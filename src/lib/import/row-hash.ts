// Deterministic per-row hash — the linchpin of IMPT-05 idempotency. Purity
// is required: same input array must yield identical output on every call
// (no Date.now(), no randomness). Hashes normalized STRINGS (never raw
// floats), so parseFloat("36.000000") vs "36" cannot drift the hash across
// runs (04-RESEARCH Pitfall 5). A 1-based occurrence index of otherwise-
// identical rows lets two legitimately-identical same-day trades both
// survive within one file, while re-import stays exactly idempotent — the
// 1st row maps to the 1st hash, the 2nd to the 2nd (04-RESEARCH Pitfall 4).

import { createHash } from 'node:crypto';
import type { NormalizedRow } from './types';

export function computeRowHashes(rows: NormalizedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [r.broker, r.isin ?? r.symbol, r.txnType, r.quantityStr, r.priceStr ?? '', r.dateISO].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash('sha256').update(`${base}|${n}`).digest('hex');
  });
}
