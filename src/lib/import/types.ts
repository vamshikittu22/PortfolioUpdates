// Shared vocabulary for Phase 4 (CSV/XLSX import). Declarations only — no
// runtime logic lives here. Every later import file (normalize, row-hash,
// detect-broker, parsers, matchers, Server Actions, UI) imports from here
// instead of re-deriving these shapes, so drift between preview and commit
// (which must parse identically — see 04-RESEARCH Pattern 1) is structurally
// impossible.

import type { Exchange, Currency } from '@/lib/types';

/** The two broker file sources this phase supports. */
export type ImportBroker = 'groww' | 'robinhood';

/**
 * Row status drives preview categories, bulk toggles, and commit filtering —
 * one union, no ad-hoc booleans (04-RESEARCH Don't Hand-Roll).
 *
 * - valid: parsed cleanly, instrument matched, not a duplicate.
 * - invalid: a required field failed to parse (money/quantity/date) — a row
 *   validation error, never silently coerced (this project's cardinal sin).
 * - duplicate: row hash already imported, OR field-matches an existing
 *   transaction, OR (Groww-specific) the instrument is already held.
 * - unmatched: broker symbol/ISIN could not be resolved to an instrument yet.
 * - unsupported: a recognized-but-unsupported broker row type (e.g. Robinhood
 *   CDIV/options/fees) — reported, never dropped.
 */
export type RowStatus = 'valid' | 'invalid' | 'duplicate' | 'unmatched' | 'unsupported';

/**
 * The subset of Phase 2's TransactionType that imports can produce. BONUS is
 * not emitted by either broker file (Groww is a snapshot; Robinhood has no
 * bonus-share Trans Code in this phase's mapping).
 */
export type ImportTxnType = 'BUY' | 'SELL' | 'SPLIT';

/**
 * The canonical hash/insert input — every field already normalized to a
 * string or ISO date. This is what `computeRowHashes` consumes, so hashing
 * is drift-free (04-RESEARCH Pitfall 5: hash normalized STRINGS, never raw
 * floats, so parseFloat("36.000000") vs "36" cannot produce different
 * hashes across runs).
 */
export interface NormalizedRow {
  broker: ImportBroker;
  symbol: string;
  isin: string | null;
  txnType: ImportTxnType;
  quantityStr: string;
  priceStr: string | null;
  dateISO: string;
}

/**
 * One parsed source row carrying full provenance for the preview UI. Every
 * numeric/date field is nullable — a null means "failed to parse", and
 * `status`/`statusReason` explain why. Never a fabricated 0 or a guessed
 * date silently standing in for a parse failure.
 */
export interface ParsedRow {
  rowIndex: number;
  broker: ImportBroker;
  rawFields: Record<string, string | null>;
  symbol: string;
  isin: string | null;
  txnType: ImportTxnType | null;
  quantity: number | null;
  quantityStr: string | null;
  price: number | null;
  priceStr: string | null;
  dateISO: string | null;
  status: RowStatus;
  statusReason?: string;
  instrumentId?: string;
}

/** `ParsedRow` plus resolved preview fields for the mapping UI. */
export interface PreviewRow extends ParsedRow {
  unmatchedSymbol?: string;
}

/** The full result of `previewImport` — either a rendered preview or an honest parse failure. */
export type ImportPreview =
  | {
      ok: true;
      broker: ImportBroker;
      fileHash: string;
      fileName: string;
      rowCount: number;
      rows: PreviewRow[];
      categories: Record<RowStatus, number>;
      unmatchedSymbols: string[];
      priorBatch?: { importedAt: string; importedCount: number; duplicateCount: number };
    }
  | { ok: false; error: string };

/**
 * The user's choices collected during preview, re-sent (along with the file
 * itself) to `commitImport` — bulk category toggles plus per-symbol
 * mappings, either to an existing instrument or a request to create one via
 * the `find_or_create_instrument` SECURITY DEFINER RPC (04-RESEARCH Pattern 3).
 */
export interface CommitChoices {
  importDuplicates: boolean;
  importUnsupported: boolean;
  mappings: Array<
    | { brokerSymbol: string; instrumentId: string }
    | {
        brokerSymbol: string;
        create: {
          isin: string;
          symbol: string;
          exchange: Exchange;
          displayName: string;
          currency: Currency;
        };
      }
  >;
}

/** The result of `commitImport` — either the audit counts or an honest failure. */
export type ImportResult =
  | { ok: true; batchId: string; imported: number; skipped: number; duplicates: number }
  | { ok: false; error: string };

/**
 * Thrown by parsers (04-03: parse-groww.ts / parse-robinhood.ts) on an
 * unrecognizable file — e.g. no header row found. Declared here so both the
 * parser plan and this plan's test script share one type.
 */
export class ImportParseError extends Error {}
