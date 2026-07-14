/**
 * PRICE-04 — network wrapper around a free FX rate API (exchangerate.host,
 * per 03-RESEARCH.md's chosen free source).
 *
 * NOTE (observed risk in practice): exchangerate.host is an external
 * free-tier service whose availability/response shape/terms can change
 * without notice. This file's only job is to report success or failure
 * honestly — it never guesses a rate. The caller (03-04) is responsible
 * for preserving the last-known-good `fx_cache` row on failure, exactly
 * like `fetchPrices` leaves a stale price_cache row untouched on failure.
 *
 * On any failure (non-OK status, thrown network error, or a response body
 * missing a usable numeric rate) this returns an explicit error result —
 * NEVER a fallback value like 1.0 or the previous rate silently reused as
 * if fresh. 03-RESEARCH.md's example code falls back to `1` on failure;
 * that is exactly the fabricated value PRICE-04/PRICE-06 forbid and is
 * intentionally NOT replicated here.
 */

export type FxFetchResult = { rate: number; fetchError: null } | { rate: null; fetchError: string };

function extractRate(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;

  const record = body as Record<string, unknown>;

  // Primary shape: { result: number }
  if (typeof record.result === 'number' && !Number.isNaN(record.result)) {
    return record.result;
  }

  // Fallback shape some exchangerate.host responses use: { info: { rate: number } }
  const info = record.info;
  if (typeof info === 'object' && info !== null) {
    const rate = (info as Record<string, unknown>).rate;
    if (typeof rate === 'number' && !Number.isNaN(rate)) {
      return rate;
    }
  }

  return null;
}

export async function fetchFXRate(from: string, to: string): Promise<FxFetchResult> {
  try {
    const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = await fetch(url);

    if (!res.ok) {
      return { rate: null, fetchError: `HTTP ${res.status}` };
    }

    const body = await res.json();
    const rate = extractRate(body);

    if (rate === null) {
      return { rate: null, fetchError: 'Malformed response from FX source' };
    }

    return { rate, fetchError: null };
  } catch (err) {
    return {
      rate: null,
      fetchError: err instanceof Error ? err.message : 'Unknown fetch error',
    };
  }
}
