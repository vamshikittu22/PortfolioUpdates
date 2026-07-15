'use server';

// Server Actions that own the CSV/XLSX import trust boundary (IMPT-01..05).
// The server is the trust boundary: both previewImport and commitImport
// receive the raw File itself and PARSE it server-side — the client never
// supplies parsed row data that gets written (04-RESEARCH Anti-Pattern).
// Both copy the requireAuthedContext cookie-bound pattern from
// src/server-actions/portfolio.ts — NEVER the admin client
// (`@/utils/supabase/admin`), which bypasses RLS and must never touch
// user-facing writes.
//
// All parsing/matching/dedup logic lives in the pure `src/lib/import/*`
// modules (04-02/04-03); this file only orchestrates them against Supabase.

import { createHash } from 'node:crypto';
import { createClient } from '@/utils/supabase/server';
import { getAccountId } from '@/lib/supabase/portfolio';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Instrument } from '@/lib/types';
import { detectBroker } from '@/lib/import/detect-broker';
import { parseGroww } from '@/lib/import/parse-groww';
import { parseRobinhood } from '@/lib/import/parse-robinhood';
import { matchInstruments, type SavedMapping } from '@/lib/import/match-instruments';
import { detectDuplicates, type ManualTxnCandidate } from '@/lib/import/detect-duplicates';
import { ImportParseError } from '@/lib/import/types';
import type { ImportBroker, ImportPreview, ParsedRow, RowStatus } from '@/lib/import/types';

async function requireAuthedContext(): Promise<{ supabase: SupabaseClient; accountId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const accountId = await getAccountId(supabase, user.id);
  return { supabase, accountId };
}

/**
 * Re-derives bytes/text/hash from the uploaded File itself — never from
 * client-supplied JSON. Shared by previewImport and commitImport so both
 * agree deterministically on the same file (04-RESEARCH Pattern 1).
 */
async function deriveFileBytes(
  formData: FormData
): Promise<{ file: File; bytes: Uint8Array; text: string; fileHash: string } | { error: string }> {
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No file received' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  return { file, bytes, text, fileHash };
}

/**
 * Byte-level broker detection, with an optional client-supplied override
 * (the UI's manual broker override re-calls with an explicit broker instead
 * of relying on detection — honest failure otherwise).
 */
function resolveBroker(bytes: Uint8Array, fileName: string, formData: FormData): ImportBroker | 'unknown' {
  const override = formData.get('broker');
  if (override === 'groww' || override === 'robinhood') return override;
  return detectBroker(bytes, fileName);
}

function parseByBroker(broker: ImportBroker, bytes: Uint8Array, text: string): ParsedRow[] {
  return broker === 'groww' ? parseGroww(bytes) : parseRobinhood(text);
}

/** The shared instrument universe (bounded seed set) used for matching. */
async function loadInstrumentUniverse(supabase: SupabaseClient): Promise<Instrument[]> {
  const { data, error } = await supabase
    .from('instruments')
    .select('id, isin, symbol, exchange, display_name, asset_type, currency, price_source_symbol');
  if (error) throw new Error(`Failed to load instruments: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    isin: row.isin,
    symbol: row.symbol,
    exchange: row.exchange,
    displayName: row.display_name,
    assetType: row.asset_type,
    currency: row.currency,
    priceSourceSymbol: row.price_source_symbol ?? '',
  }));
}

async function loadSavedMappings(
  supabase: SupabaseClient,
  accountId: string,
  broker: ImportBroker
): Promise<SavedMapping[]> {
  const { data, error } = await supabase
    .from('symbol_mappings')
    .select('broker, broker_symbol, instrument_id')
    .eq('account_id', accountId)
    .eq('broker', broker);
  if (error) throw new Error(`Failed to load symbol mappings: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    broker: row.broker as ImportBroker,
    brokerSymbol: row.broker_symbol,
    instrumentId: row.instrument_id,
  }));
}

interface DuplicateInputs {
  existingHashes: Set<string>;
  existingManualTxns: ManualTxnCandidate[];
  alreadyHeldInstrumentIds: Set<string>;
}

/**
 * Single query loads everything detectDuplicates needs: the set of already-
 * imported row hashes, the existing MANUAL (import_row_hash IS NULL)
 * transactions for field-matching, and every instrument_id the account has
 * ANY transaction for (Groww's already-held snapshot rule) — no N+1.
 */
async function loadDuplicateInputs(supabase: SupabaseClient, accountId: string): Promise<DuplicateInputs> {
  const { data, error } = await supabase
    .from('transactions')
    .select('instrument_id, transaction_type, quantity, price, transaction_date, import_row_hash')
    .eq('account_id', accountId);
  if (error) throw new Error(`Failed to load existing transactions: ${error.message}`);

  const existingHashes = new Set<string>();
  const existingManualTxns: ManualTxnCandidate[] = [];
  const alreadyHeldInstrumentIds = new Set<string>();

  for (const row of data ?? []) {
    alreadyHeldInstrumentIds.add(row.instrument_id as string);
    if (row.import_row_hash) {
      existingHashes.add(row.import_row_hash as string);
    } else {
      existingManualTxns.push({
        instrumentId: row.instrument_id as string,
        type: row.transaction_type as string,
        quantity: row.quantity as number,
        price: row.price as number | null,
        dateISO: row.transaction_date as string,
      });
    }
  }

  return { existingHashes, existingManualTxns, alreadyHeldInstrumentIds };
}

/**
 * previewImport — parses the uploaded file server-side, classifies every
 * row (matched/duplicate/invalid/unmatched/unsupported), and returns the
 * full preview. Writes NOTHING.
 */
export async function previewImport(formData: FormData): Promise<ImportPreview> {
  const { supabase, accountId } = await requireAuthedContext();

  const derived = await deriveFileBytes(formData);
  if ('error' in derived) return { ok: false, error: derived.error };
  const { file, bytes, text, fileHash } = derived;

  const broker = resolveBroker(bytes, file.name, formData);
  if (broker === 'unknown') {
    return {
      ok: false,
      error: 'Could not detect broker from file. Expected a Groww .xlsx or a Robinhood activity .csv.',
    };
  }

  let parsedRows: ParsedRow[];
  try {
    parsedRows = parseByBroker(broker, bytes, text);
  } catch (err) {
    if (err instanceof ImportParseError) return { ok: false, error: err.message };
    throw err;
  }

  const [instruments, savedMappings, duplicateInputs] = await Promise.all([
    loadInstrumentUniverse(supabase),
    loadSavedMappings(supabase, accountId, broker),
    loadDuplicateInputs(supabase, accountId),
  ]);

  const matchedRows = matchInstruments(parsedRows, instruments, savedMappings);
  const finalRows = detectDuplicates(
    matchedRows,
    duplicateInputs.existingHashes,
    duplicateInputs.existingManualTxns,
    duplicateInputs.alreadyHeldInstrumentIds
  );

  const categories: Record<RowStatus, number> = {
    valid: 0,
    invalid: 0,
    duplicate: 0,
    unmatched: 0,
    unsupported: 0,
  };
  const unmatchedSymbolSet = new Set<string>();
  for (const row of finalRows) {
    categories[row.status]++;
    if (row.status === 'unmatched') unmatchedSymbolSet.add(row.symbol);
  }

  const { data: priorBatchRow } = await supabase
    .from('import_batches')
    .select('imported_count, duplicate_count, created_at')
    .eq('account_id', accountId)
    .eq('file_hash', fileHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const priorBatch = priorBatchRow
    ? {
        importedAt: priorBatchRow.created_at as string,
        importedCount: priorBatchRow.imported_count as number,
        duplicateCount: priorBatchRow.duplicate_count as number,
      }
    : undefined;

  return {
    ok: true,
    broker,
    fileHash,
    fileName: file.name,
    rowCount: finalRows.length,
    rows: finalRows,
    categories,
    unmatchedSymbols: [...unmatchedSymbolSet],
    priorBatch,
  };
}
