/**
 * PRICE-04 — network wrapper around a free FX rate API.
 *
 * PROVIDER: api.frankfurter.dev (ECB reference rates).
 *
 * History — why NOT exchangerate.host (03-RESEARCH.md's original pick):
 * verified live on 2026-07-14, its free /convert endpoint now returns
 * `{"success":false,"error":{"code":101,"type":"missing_access_key"}}` with
 * HTTP 200. The research doc's "free, no key required" claim is stale. Rather
 * than register for a key on a service that silently moved behind one, this
 * uses Frankfurter: ECB-sourced, open-source, self-hostable, no API key, and
 * with no commercial incentive to add one later. Cross-checked on 2026-07-14
 * against open.er-api.com — USD->INR 96.2 vs 96.24, i.e. they agree.
 *
 * Caveat: ECB publishes reference rates once per working day (~16:00 CET), so
 * `date` in the response may lag on weekends/holidays. That is fine here — the
 * rate carries its own date and the UI surfaces FX staleness rather than
 * implying a live tick.
 *
 * This file's only job is to report success or failure honestly — it never
 * guesses a rate. The caller (03-04) preserves the last-known-good `fx_cache`
 * row on failure, exactly like `fetchPrices` leaves a stale price_cache row
 * untouched.
 *
 * On any failure (non-OK status, thrown network error, or a response body
 * missing a usable numeric rate) this returns an explicit error result —
 * NEVER a fallback value like 1.0 or the previous rate silently reused as
 * if fresh. 03-RESEARCH.md's example code falls back to `1` on failure;
 * that is exactly the fabricated value PRICE-04/PRICE-06 forbid and is
 * intentionally NOT replicated here.
 */

export type FxFetchResult = { rate: number; fetchError: null } | { rate: null; fetchError: string };

/**
 * Frankfurter shape: { amount: 1.0, base: "USD", date: "2026-07-14", rates: { INR: 96.2 } }
 * The rate is keyed by the TARGET currency.
 */
function extractRate(body: unknown, to: string): number | null {
  if (typeof body !== 'object' || body === null) return null;

  const rates = (body as Record<string, unknown>).rates;
  if (typeof rates !== 'object' || rates === null) return null;

  const rate = (rates as Record<string, unknown>)[to.toUpperCase()];
  if (typeof rate === 'number' && !Number.isNaN(rate)) {
    return rate;
  }

  return null;
}

export async function fetchFXRate(from: string, to: string): Promise<FxFetchResult> {
  // Identity is arithmetic, not a fabricated rate — and Frankfurter rejects
  // base === symbols, so short-circuit before the network call.
  if (from.toUpperCase() === to.toUpperCase()) {
    return { rate: 1, fetchError: null };
  }

  try {
    const url =
      `https://api.frankfurter.dev/v1/latest` +
      `?base=${encodeURIComponent(from.toUpperCase())}` +
      `&symbols=${encodeURIComponent(to.toUpperCase())}`;
    const res = await fetch(url);

    if (!res.ok) {
      return { rate: null, fetchError: `HTTP ${res.status}` };
    }

    const body = await res.json();
    const rate = extractRate(body, to);

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
