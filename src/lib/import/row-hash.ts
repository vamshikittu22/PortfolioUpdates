// Deterministic per-row hash — the linchpin of IMPT-05 idempotency. Purity
// is required: same input array must yield identical output on every call
// (no Date.now(), no randomness).
//
// STUB — RED phase (04-02 Task 2). Real implementation lands in GREEN.

import type { NormalizedRow } from './types';

export function computeRowHashes(_rows: NormalizedRow[]): string[] {
  return [];
}
