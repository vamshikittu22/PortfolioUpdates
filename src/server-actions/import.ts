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
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getAccountId } from '@/lib/supabase/portfolio';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Instrument } from '@/lib/types';
import { detectBroker } from '@/lib/import/detect-broker';
import { parseGroww } from '@/lib/import/parse-groww';
import { parseRobinhood } from '@/lib/import/parse-robinhood';
import { matchInstruments, type SavedMapping } from '@/lib/import/match-instruments';
import { detectDuplicates, type ManualTxnCandidate } from '@/lib/import/detect-duplicates';
import { computeRowHashes } from '@/lib/import/row-hash';
import { ImportParseError } from '@/lib/import/types';
import type {
  CommitChoices,
  ImportBroker,
  ImportPreview,
  ImportResult,
  NormalizedRow,
  ParsedRow,
  RowStatus,
} from '@/lib/import/types';

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

const ROBINHOOD_NOTE_PREFIX = 'Imported from Robinhood activity report';

/** Groww rows already carry a snapshot marker in rawFields.notes (parse-groww.ts). */
function buildNotes(row: ParsedRow, broker: ImportBroker): string | null {
  if (broker === 'groww') return (row.rawFields.notes as string | undefined) ?? null;
  const description = row.rawFields['Description'];
  return description ? `${ROBINHOOD_NOTE_PREFIX} — ${description}` : ROBINHOOD_NOTE_PREFIX;
}

/**
 * commitImport — re-parses the SAME file server-side (never trusts
 * client-parsed rows), resolves the user's symbol mappings (creating
 * instruments ONLY via the find_or_create_instrument SECURITY DEFINER RPC),
 * re-applies the same matching/dedup logic so it agrees deterministically
 * with previewImport, then writes atomically: insert the import_batches row
 * -> single bulk transactions insert (each row carrying import_batch_id +
 * import_row_hash) -> on failure, compensating delete of the batch row.
 * Never fabricates a value; invalid/still-unmatched rows are never imported.
 */
export async function commitImport(formData: FormData): Promise<ImportResult> {
  const { supabase, accountId } = await requireAuthedContext();

  const derived = await deriveFileBytes(formData);
  if ('error' in derived) return { ok: false, error: derived.error };
  const { file, bytes, text, fileHash } = derived;

  const choices = JSON.parse(String(formData.get('choices') ?? '{}')) as CommitChoices;

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

  // Resolve every user mapping choice: a direct instrumentId is used as-is;
  // a `create` request goes through the SECURITY DEFINER RPC — the only
  // privileged write in this action, and the only path that may add a row
  // to the closed `instruments` table. A failed/null result is a hard error
  // returned to the user — never a fabricated id.
  const resolvedMappings: Array<{ brokerSymbol: string; instrumentId: string }> = [];
  for (const mapping of choices.mappings ?? []) {
    if ('instrumentId' in mapping) {
      resolvedMappings.push({ brokerSymbol: mapping.brokerSymbol, instrumentId: mapping.instrumentId });
      continue;
    }
    const { data: newId, error: rpcError } = await supabase.rpc('find_or_create_instrument', {
      p_isin: mapping.create.isin,
      p_symbol: mapping.create.symbol,
      p_exchange: mapping.create.exchange,
      p_display_name: mapping.create.displayName,
      p_currency: mapping.create.currency,
    });
    if (rpcError || !newId) {
      return {
        ok: false,
        error: rpcError?.message ?? `Could not create instrument for "${mapping.brokerSymbol}"`,
      };
    }
    resolvedMappings.push({ brokerSymbol: mapping.brokerSymbol, instrumentId: newId as string });
  }

  // Re-run matching with the choice-resolved mappings layered on top of the
  // already-saved ones (choices take precedence — put first so
  // matchInstruments' `.find()` picks them), so previously-unmatched rows
  // now resolve.
  const [instruments, savedMappings, duplicateInputs] = await Promise.all([
    loadInstrumentUniverse(supabase),
    loadSavedMappings(supabase, accountId, broker),
    loadDuplicateInputs(supabase, accountId),
  ]);
  const overrideMappings: SavedMapping[] = resolvedMappings.map((m) => ({
    broker,
    brokerSymbol: m.brokerSymbol,
    instrumentId: m.instrumentId,
  }));
  const matchedRows = matchInstruments(parsedRows, instruments, [...overrideMappings, ...savedMappings]);

  const finalRows = detectDuplicates(
    matchedRows,
    duplicateInputs.existingHashes,
    duplicateInputs.existingManualTxns,
    duplicateInputs.alreadyHeldInstrumentIds
  );

  // Final import set per the user's choices: always import `valid`; import
  // `duplicate` only if explicitly chosen. `invalid`, still-`unmatched`, and
  // `unsupported` rows are NEVER imported — unsupported types have no ledger
  // representation (04-04-PLAN Task 3).
  const importableRows = finalRows.filter(
    (row) => row.status === 'valid' || (row.status === 'duplicate' && choices.importDuplicates)
  );

  // Guard + build NormalizedRow[] for hashing — valid/duplicate rows always
  // carry these fields by construction, but never assume across the
  // parse -> match -> dedup pipeline boundary (this project's cardinal sin
  // is fabricating/coercing a missing value).
  const importedParsed: ParsedRow[] = [];
  const importedNormalized: NormalizedRow[] = [];
  for (const row of importableRows) {
    if (row.txnType == null || row.quantityStr == null || row.dateISO == null || row.instrumentId == null) {
      return {
        ok: false,
        error: `Internal error: row ${row.rowIndex} was marked importable but is missing a required field`,
      };
    }
    importedParsed.push(row);
    importedNormalized.push({
      broker: row.broker,
      symbol: row.symbol,
      isin: row.isin,
      txnType: row.txnType,
      quantityStr: row.quantityStr,
      priceStr: row.priceStr,
      dateISO: row.dateISO,
    });
  }
  const importHashes = computeRowHashes(importedNormalized);

  const validCount = finalRows.filter((r) => r.status === 'valid').length;
  const duplicateCount = finalRows.filter((r) => r.status === 'duplicate').length;
  const skippedCount = finalRows.length - validCount - duplicateCount;
  const importedCount = importedParsed.length;

  // ── Atomic write: insert the batch row, then a SINGLE bulk transactions
  // insert (one PostgREST statement — all rows or none), compensating with
  // a batch delete if the insert fails. ──
  const { data: batchRow, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      account_id: accountId,
      broker,
      file_name: file.name,
      file_hash: fileHash,
      row_count: finalRows.length,
      imported_count: importedCount,
      skipped_count: skippedCount,
      duplicate_count: duplicateCount,
    })
    .select('id')
    .single();
  if (batchError || !batchRow) {
    return { ok: false, error: batchError?.message ?? 'Failed to create import batch' };
  }
  const batchId = batchRow.id as string;

  if (importedParsed.length > 0) {
    const payload = importedParsed.map((row, i) => ({
      account_id: accountId,
      instrument_id: row.instrumentId as string,
      transaction_type: row.txnType,
      quantity: row.quantity,
      price: row.txnType === 'SPLIT' ? null : row.price,
      transaction_date: row.dateISO,
      notes: buildNotes(row, broker),
      import_batch_id: batchId,
      import_row_hash: importHashes[i],
    }));

    const { error: insertError } = await supabase.from('transactions').insert(payload);
    if (insertError) {
      // Compensation: this batch row is orphaned without its transactions —
      // delete it so the audit trail stays honest (no phantom "imported"
      // count sitting on a batch that wrote nothing).
      await supabase.from('import_batches').delete().eq('id', batchId);
      return { ok: false, error: insertError.message };
    }
  }

  // Persist the user's resolved mappings so future imports auto-apply them.
  // Non-fatal: the transactions already committed above.
  if (resolvedMappings.length > 0) {
    const { error: mappingError } = await supabase.from('symbol_mappings').upsert(
      resolvedMappings.map((m) => ({
        account_id: accountId,
        broker,
        broker_symbol: m.brokerSymbol,
        instrument_id: m.instrumentId,
      })),
      { onConflict: 'account_id,broker,broker_symbol' }
    );
    if (mappingError) {
      console.error('Failed to persist symbol mappings (non-fatal):', mappingError.message);
    }
  }

  revalidatePath('/');
  revalidatePath('/holdings');

  return { ok: true, batchId, imported: importedCount, skipped: skippedCount, duplicates: duplicateCount };
}
