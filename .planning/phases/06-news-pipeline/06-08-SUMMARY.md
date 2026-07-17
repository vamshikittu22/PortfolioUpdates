---
phase: 06-news-pipeline
plan: 08
subsystem: api
tags: [news, rss, finnhub, google-news, fetch-wrapper, fast-xml-parser]

# Dependency graph
requires:
  - phase: 06-news-pipeline
    provides: "06-02 dedup primitives + RawNewsItem types, 06-03 stripCompanySuffixes matcher, 06-04 parseGoogleNewsRss/parseRssFeed/parseFinnhubNews pure parsers"
provides:
  - "src/lib/news/sources.ts — feed registry + URL builders (Google News search, Finnhub company-news, Indian publisher list)"
  - "src/lib/news/fetch-news.ts — honest raw-fetch wrappers for all three news sources, live-proven for the two keyless paths"
affects: [06-09 ingest orchestration, 06-10 live-verify checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "wrapper-owns-bytes/parser-owns-meaning split (mirrors fetch-prices.ts and telegram/api.ts): fetch-news.ts never interprets response shape, only delegates to parse-feeds.ts"
    - "key-guard-first pattern for gated external APIs: unset/placeholder token checked BEFORE any network call, honest not-configured result, never a throw (telegram/api.ts precedent)"

key-files:
  created:
    - src/lib/news/sources.ts
    - src/lib/news/fetch-news.ts
  modified: []

key-decisions:
  - "buildFinnhubCompanyNewsUrl builds the query string by direct template literal (encodeURIComponent per value) rather than URLSearchParams, to avoid double-encoding an already-encoded token value"
  - "Placeholder-token detection for FINNHUB_API_KEY reuses the .env.local labeled-placeholder convention (substring 'your-', case-insensitive) established by TELEGRAM_BOT_TOKEN in 05-04"

patterns-established:
  - "Pattern: keyless external fetch paths are live-verified inside the fetch-wrapper plan itself (via a throwaway tsx -e invocation), not deferred to the phase checkpoint — only key-gated sources defer their live path"

requirements-completed: [NEWS-01]

# Metrics
duration: 12min
completed: 2026-07-17
---

# Phase 6 Plan 08: News Network Layer Summary

**Honest raw-fetch wrappers for Google News RSS, Indian publisher RSS, and Finnhub company-news, with the two keyless India-side paths live-proven (100/50/35 real items fetched through the actual wrappers) and the key-gated Finnhub path coded with a proven honest not-configured result.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-17T21:41:00Z (approx, per STATE.md session context)
- **Completed:** 2026-07-17T21:53:04Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments

- `src/lib/news/sources.ts` centralizes all feed URL/query construction: the India-locale Google News search URL, the quoted instrument query builder (reusing 06-03's `stripCompanySuffixes`), the Finnhub company-news URL builder, and the live-verified `INDIAN_PUBLISHER_FEEDS` registry (ET Markets + LiveMint Markets).
- `src/lib/news/fetch-news.ts` implements `fetchGoogleNews`, `fetchPublisherFeed`, and `fetchFinnhubCompanyNews` — all three return a discriminated `NewsFetchResult`, all three carry a 15s `AbortSignal.timeout`, none can throw an uncaught error.
- Live-verified RIGHT NOW (no key, no DB, no consent needed): Google News returned 100 items, ET Markets 50 items, LiveMint Markets 35 items, all through the real network + real wrapper + real parser path — first attempt, no retry needed.
- Finnhub's key-gate proven honest: with `FINNHUB_API_KEY` genuinely unset in `.env.local` (confirmed via `grep -c` returning 0), `fetchFinnhubCompanyNews('AAPL', ...)` returned `{"items":null,"fetchError":"FINNHUB_API_KEY not configured"}` — never threw, never fabricated a result.

## Task Commits

Each task was committed atomically:

1. **Task 1: sources.ts — feed registry + URL builders** - `0ca1e28` (feat)
2. **Task 2: fetch-news.ts wrappers + LIVE keyless verification** - `098a501` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/lib/news/sources.ts` - `INDIAN_PUBLISHER_FEEDS`, `buildInstrumentNewsQuery`, `buildGoogleNewsSearchUrl`, `buildFinnhubCompanyNewsUrl`
- `src/lib/news/fetch-news.ts` - `fetchGoogleNews`, `fetchPublisherFeed`, `fetchFinnhubCompanyNews`, `NewsFetchResult` type

## Live Smoke-Test Output (verbatim)

Keyless paths (Google News + both Indian publisher feeds), run via:

```text
npx tsx -e "import('./src/lib/news/fetch-news').then(async m => { ... })"
```

Output:

```text
google 100 | et 50 | mint 35
sample-google: 2 reasons why Infosys, TCS and other IT stocks are rising today - The Economic Times | The Economic Times | 2026-07-17T05:25:44.000Z
sample-et: US stocks today: Nasdaq, S&P fall over 1%, end lower for week as chip selloff broadens | ET Markets | 2026-07-17T20:04:39.000Z
sample-mint: Netflix shares tumble 13% after weak sales forecast, hit 22-month low | LiveMint Markets | 2026-07-17T16:25:46.000Z
```

All three sources reported non-zero items with sane titles and valid ISO-8601 timestamps on the first attempt (no retry needed).

Finnhub not-configured path (key genuinely unset — `grep -c "FINNHUB_API_KEY" .env.local` → `0`):

```text
{"items":null,"fetchError":"FINNHUB_API_KEY not configured"}
```

## Decisions Made

- `buildFinnhubCompanyNewsUrl` builds its query string via direct template-literal interpolation (each value through its own `encodeURIComponent`) instead of `URLSearchParams`, avoiding a subtle double-encoding bug that would occur if pre-encoded values were passed into `URLSearchParams`.
- Placeholder-token detection for `FINNHUB_API_KEY` mirrors the existing `.env.local` labeled-placeholder convention (case-insensitive substring `'your-'`) rather than inventing a new detection rule.

## Deviations from Plan

None - plan executed exactly as written. Both keyless live checks succeeded on the first attempt (no retry needed); the Finnhub not-configured path was verified against a genuinely-unset key (not a mocked/stubbed environment).

## Issues Encountered

One transient git-index event: staging `src/lib/news/fetch-news.ts` alone (`git add src/lib/news/fetch-news.ts`) also swept the concurrently-running 07-03 executor's new untracked file `src/lib/digest/run.ts` into the index (the known parallel-executor git-index-race behavior). Caught before commit via `git status --short`, corrected with `git restore --staged src/lib/digest/run.ts`, then re-verified the index contained exactly one file before committing. `git show HEAD --stat` on the resulting commit confirms only `src/lib/news/fetch-news.ts` landed — no cross-contamination.

## User Setup Required

None for this plan's keyless paths (Google News + Indian publisher RSS need no credentials). Finnhub still requires `FINNHUB_API_KEY` (free finnhub.io account) before its live path can be exercised — that setup and live verification is explicitly deferred to 06-10, per this plan's frontmatter `user_setup` block. The `.env.local` placeholder for `FINNHUB_API_KEY` itself is added by plan 06-09, not this plan.

## Next Phase Readiness

- `src/lib/news/{sources,fetch-news}.ts` are ready for 06-09 (ingest orchestration) to compose: call `fetchGoogleNews`/`fetchPublisherFeed`/`fetchFinnhubCompanyNews` per instrument/feed, feed results into the 06-02 dedup + 06-03 match + 06-05 summarize pipeline.
- Finnhub's live path (real key, real US-symbol company news) remains untested against the real API — deferred to 06-10 as planned, with its not-configured behavior already proven honest.

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: src/lib/news/sources.ts
- FOUND: src/lib/news/fetch-news.ts
- FOUND: commit 0ca1e28 (Task 1)
- FOUND: commit 098a501 (Task 2)
