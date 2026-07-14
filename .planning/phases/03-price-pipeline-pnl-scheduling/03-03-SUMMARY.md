---
phase: 03-price-pipeline-pnl-scheduling
plan: 03
subsystem: prices
tags: [yahoo-finance, fetch, fx-rate, network-wrapper, error-handling, honest-failure]

# Dependency graph
requires:
  - phase: 03-price-pipeline-pnl-scheduling
    provides: "parseYahooChartResponse (src/lib/prices/ingest.ts, plan 03-02) — safe, tested Yahoo chart-response parser this plan reuses instead of reimplementing"
provides:
  - "fetchPrices(symbols: string[]): Promise<Record<string, PriceFetchResult>> — parallel, per-symbol-safe Yahoo Finance chart fetcher"
  - "fetchFXRate(from: string, to: string): Promise<FxFetchResult> — exchangerate.host wrapper with honest failure (no fabricated rate fallback)"
affects: [03-04-route-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Network wrapper layer isolated from pure parsing (03-02) and orchestration/storage (03-04) — this file only handles bytes-over-the-wire + failure degradation"
    - "Promise.allSettled per-symbol fan-out with a defensive fallback branch so a truly unexpected rejection still yields an honest per-symbol error result instead of an unhandled rejection"
    - "Never-fabricate-a-value discipline extended to network layer: failure always returns { price: null, fetchError: string } / { rate: null, fetchError: string }, never 0, never 1.0, never a stale value silently reused"

key-files:
  created:
    - src/lib/prices/fetch-prices.ts
    - src/lib/prices/fx-rates.ts
  modified: []

key-decisions:
  - "Reused the same browser-like User-Agent string from src/lib/research/yahoo-finance.ts verbatim, per plan instruction, rather than inventing a new header convention."
  - "fetchFXRate checks both { result: number } and { info: { rate: number } } response shapes (exchangerate.host has used both historically) but returns an explicit error if neither is a valid number — no fallback to 1.0 or any guessed rate, unlike 03-RESEARCH.md's example code."

patterns-established:
  - "Live-network smoke test performed once (non-committed script) to sanity-check real-world response shapes against the pure parser's assumptions, then removed before commit — used to verify, not to persist as project code."

requirements-completed: [PRICE-01, PRICE-04]

# Metrics
duration: 15min
completed: 2026-07-14
---

# Phase 3 Plan 3: Price + FX network wrappers Summary

**Two thin, resilient network wrappers (`fetchPrices` for Yahoo Finance, `fetchFXRate` for exchangerate.host) that degrade to explicit per-item errors on any failure and were live-smoke-tested against real Yahoo Finance data — no fabricated price or FX rate on any failure path.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-14 (approx, following 03-02)
- **Completed:** 2026-07-14
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `fetchPrices` fetches every symbol's Yahoo Finance `/v8/finance/chart/{symbol}` data in parallel via `Promise.allSettled`, delegates all response interpretation to the tested `parseYahooChartResponse` (03-02), and never lets one symbol's failure (bad ticker, network error, malformed JSON) abort the batch or produce an unhandled rejection.
- `fetchFXRate` calls exchangerate.host's `/convert` endpoint and returns either a real numeric rate or an explicit `fetchError` string — it deliberately does NOT replicate 03-RESEARCH.md's example fallback-to-`1` behavior, which would have been a fabricated value.
- **Live smoke test (bonus, non-blocking per plan instructions):** ran a real, uncommitted script against both wrappers.
  - `fetchPrices(['AAPL', 'INFY.NS', 'NOTAREALTICKERXYZ123'])` returned real live prices for `AAPL` ($314.86, -0.77%) and `INFY.NS` (₹1102.60, +3.24%), and an honest `{ price: null, fetchError: 'HTTP 404' }` for the invalid symbol — confirms `parseYahooChartResponse`'s assumptions still match Yahoo's real response shape and that per-symbol failure isolation works against a live 404.
  - `fetchFXRate('USD', 'INR')` returned `{ rate: null, fetchError: 'Malformed response from FX source' }`. Root cause confirmed via a raw `curl`-equivalent fetch: exchangerate.host now returns `{"success": false, "error": {"code": 101, "type": "missing_access_key", ...}}` — this free-tier endpoint apparently now requires a paid API key, a real-world drift from 03-RESEARCH.md's assumption. The wrapper handled this exactly as designed: no fabricated rate, an honest error surfaced instead.
- `npx tsc --noEmit` clean after both tasks. `npm run test:price-pnl` (03-02's suite) still passes unchanged — confirms this plan did not touch or break the pure logic layer.

## Task Commits

Each task was committed atomically:

1. **Task 1: fetchPrices — Yahoo Finance chart endpoint per symbol** - `09ef8c6` (feat)
2. **Task 2: fetchFXRate — free FX rate API** - `4eaa458` (feat)

**Plan metadata:** (this commit, below)

## Files Created/Modified

- `src/lib/prices/fetch-prices.ts` — `fetchPrices(symbols)`, `PriceFetchResult` type; reuses `parseYahooChartResponse` from `@/lib/prices/ingest`, never reimplements chart-JSON parsing.
- `src/lib/prices/fx-rates.ts` — `fetchFXRate(from, to)`, `FxFetchResult` type; honest-failure exchangerate.host wrapper.

## Decisions Made

- Matched `src/lib/research/yahoo-finance.ts`'s exact User-Agent string rather than inventing a new one, per the plan's explicit instruction to reuse existing header/error-handling conventions.
- Kept `Promise.allSettled` (plan's preferred option) over a plain sequential loop for speed on a 15-20 symbol portfolio, with a defensive (currently unreachable, since `fetchOnePrice` catches internally) fallback branch in case a future refactor introduces a code path that could reject.
- `fetchFXRate` checks two known exchangerate.host response shapes (`result` and `info.rate`) for resilience against the API's historical shape drift, but treats anything else — including the `{success:false, error:{...}}` shape discovered live during this plan's smoke test — as an honest failure, never a guessed rate.

## Deviations from Plan

None - plan executed exactly as written. Both function signatures, the `Promise.allSettled` fan-out, the `price_source_symbol`-only usage note (enforced by contract — this function is symbol-agnostic and the caller in 03-04 owns supplying the right value), and the "never fabricate a value" discipline match the plan's `<action>` sections verbatim.

## Issues Encountered

None blocking. One notable **live finding** (not a plan deviation, not fixed in this plan — informational for 03-04/03-06): `exchangerate.host`'s free `/convert` endpoint now returns `missing_access_key` in production, meaning the "free, no key" assumption in 03-RESEARCH.md is stale as of this session. `fetchFXRate` already handles this correctly (explicit `fetchError`, no fabricated rate), so no code change was required by this plan's contract — but 03-04 (or a later plan) will need to either register for exchangerate.host's key, or research/swap to a genuinely free alternative (e.g. Frankfurter, open.er-api.com) before FX rates can populate `fx_cache` for real. Logged here rather than silently worked around.

## User Setup Required

None for this plan's static verification. Flagging for a future session/plan: if `exchangerate.host` requires a paid key going forward, either an `EXCHANGERATE_API_KEY` env var (if staying on this provider) or a swap to a different free FX source will be needed before 03-04/03-06's live FX refresh can succeed end-to-end. This does not block 03-03's own success criteria (honest failure handling), which is fully met.

## Next Phase Readiness

- 03-04 (route orchestration) can import `fetchPrices` and `fetchFXRate` directly; both are keyed purely by symbol/currency-pair strings with zero Supabase/instrument_id awareness, matching the plan's isolation goal.
- 03-04 must map `instrument.price_source_symbol` → `instrument_id` itself when consuming `fetchPrices`'s result (this wrapper does not do that mapping, by design).
- 03-04 must preserve the last-known-good `fx_cache` row whenever `fetchFXRate` returns a `fetchError`, per this plan's code comment and PRICE-04/PRICE-06's requirements.
- **Carried-forward concern:** the live exchangerate.host access-key requirement discovered above should be resolved (key or provider swap) before 03-06's live end-to-end FX verification checkpoint, or that checkpoint will show a permanently stale/never-populated `fx_cache` for FX pairs.

---
*Phase: 03-price-pipeline-pnl-scheduling*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/lib/prices/fetch-prices.ts
- FOUND: src/lib/prices/fx-rates.ts
- FOUND: 09ef8c6 (feat commit, Task 1)
- FOUND: 4eaa458 (feat commit, Task 2)
