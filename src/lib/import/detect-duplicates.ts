// Duplicate detection -- pure given rows plus the caller-supplied existing
// state (hashes, manual transactions, already-held instrument ids). Three
// rules, checked in order per row: hash already imported -> field-match vs
// a manual transaction -> Groww's "instrument already held" snapshot rule.
// A row already 'unmatched'/'unsupported'/'invalid' is left unchanged --
// dedup only applies to rows that would otherwise commit cleanly.

import { computeRowHashes } from './row-hash';
import type { NormalizedRow, ParsedRow } from './types';

export interface ManualTxnCandidate {
  instrumentId: string;
  type: string;
  quantity: number;
  price: number | null;
  dateISO: string;
}

const NON_HASHABLE_STATUSES = new Set<ParsedRow['status']>(['unmatched', 'unsupported', 'invalid']);

function toNormalizedRow(row: ParsedRow): NormalizedRow | null {
  if (row.txnType == null || row.quantityStr == null || row.dateISO == null) return null;
  return {
    broker: row.broker,
    symbol: row.symbol,
    isin: row.isin,
    txnType: row.txnType,
    quantityStr: row.quantityStr,
    priceStr: row.priceStr,
    dateISO: row.dateISO,
  };
}

function matchesManualTxn(row: ParsedRow, candidates: ManualTxnCandidate[]): boolean {
  if (row.instrumentId == null) return false;
  return candidates.some(
    (t) =>
      t.instrumentId === row.instrumentId &&
      t.type === row.txnType &&
      t.quantity === row.quantity &&
      t.price === row.price &&
      t.dateISO === row.dateISO
  );
}

export function detectDuplicates(
  rows: ParsedRow[],
  existingHashes: Set<string>,
  existingManualTxns: ManualTxnCandidate[],
  alreadyHeldInstrumentIds: Set<string>
): ParsedRow[] {
  // Build the hashable subset in original order so computeRowHashes'
  // occurrence index (Pitfall 4) is correct across the whole eligible batch.
  const eligibleIndices: number[] = [];
  const normalized: NormalizedRow[] = [];
  rows.forEach((row, idx) => {
    if (NON_HASHABLE_STATUSES.has(row.status)) return;
    const n = toNormalizedRow(row);
    if (n == null) return;
    eligibleIndices.push(idx);
    normalized.push(n);
  });

  const hashes = computeRowHashes(normalized);
  const result = [...rows];

  eligibleIndices.forEach((rowIdx, i) => {
    const row = result[rowIdx];
    const hash = hashes[i];

    if (existingHashes.has(hash)) {
      result[rowIdx] = { ...row, status: 'duplicate', statusReason: 'already imported' };
      return;
    }

    if (matchesManualTxn(row, existingManualTxns)) {
      result[rowIdx] = { ...row, status: 'duplicate', statusReason: 'matches a manual entry' };
      return;
    }

    if (row.broker === 'groww' && row.instrumentId != null && alreadyHeldInstrumentIds.has(row.instrumentId)) {
      result[rowIdx] = {
        ...row,
        status: 'duplicate',
        statusReason: 'instrument already held — snapshot would double-count',
      };
    }
  });

  return result;
}
