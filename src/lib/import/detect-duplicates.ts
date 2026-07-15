// STUB for RED -- real implementation lands in the GREEN commit.
import type { ParsedRow } from './types';

export interface ManualTxnCandidate {
  instrumentId: string;
  type: string;
  quantity: number;
  price: number | null;
  dateISO: string;
}

export function detectDuplicates(
  rows: ParsedRow[],
  _existingHashes: Set<string>,
  _existingManualTxns: ManualTxnCandidate[],
  _alreadyHeldInstrumentIds: Set<string>
): ParsedRow[] {
  return rows;
}
