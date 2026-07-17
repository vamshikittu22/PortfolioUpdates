---
phase: 06-news-pipeline
plan: 04
subsystem: news
tags: [fast-xml-parser, rss, finnhub, tdd, pure-function]

# Dependency graph
requires:
  - phase: 06-news-pipeline
    provides: "RawNewsItem type (06-02, src/lib/news/types.ts)"
provides:
  - "parseGoogleNewsRss(xml) — Google News RSS search feed -> RawNewsItem[]"
  - "parseRssFeed(xml, sourceName) — generic publisher RSS (ET Markets/LiveMint shape) -> RawNewsItem[]"
  - "parseFinnhubNews(json, fallbackSource?) — Finnhub company-news JSON -> RawNewsItem[]"
  - "ParseResult type ({ items: RawNewsItem[]; error: string | null })"
affects: [06-08-fetch-wrappers, news-pipeline-fetch-plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure interpretation layer separate from fetch wrappers (fetch-prices.ts precedent) — parse-feeds.ts has zero I/O, zero Date.now(), zero randomness"
    - "fast-xml-parser XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'item' }) shared across both RSS parsers"
    - "extractText() helper normalizes both plain-string and { '#text', '@_attr' } fast-xml-parser node shapes into one text-or-null value"
    - "Honest { items: [], error } never-throw contract on malformed input, including surfacing an upstream API's own error message (Finnhub 401 body) rather than a generic string"

key-files:
  created:
    - src/lib/news/parse-feeds.ts
    - scripts/news-parse-test.ts
  modified: []

key-decisions:
  - "Missing <rss><channel> after a successful (non-throwing) fast-xml-parser parse is treated as the malformed-XML error signal, since fast-xml-parser never throws on non-XML text (verified live: 'not xml at all' parses to {})"
  - "Google News <description> is always discarded to abstract:null (anchor-soup HTML, no clean text) — abstract only comes from parseRssFeed's real publisher <description>"
  - "Finnhub entries missing url/headline/numeric datetime are silently skipped rather than fabricated, matching the plan's 'skip malformed entries honestly' contract"
  - "A non-array Finnhub JSON body with a string .error field surfaces that exact API message (prefixed 'Finnhub error: ') rather than a generic error, per the live-probed 401 {\"error\":\"Invalid API key\"} shape"

patterns-established:
  - "TDD fixture strings modeled byte-for-byte on 06-RESEARCH-external.md's live captures (Google News <source url> attribute form, ET/LiveMint CDATA wrapping, +0530 offsets) rather than synthetic simplified XML"

requirements-completed: [NEWS-01]

duration: 12min
completed: 2026-07-17
---

# Phase 6 Plan 04: Feed-Parser Interpretation Layer Summary

**Pure `parseGoogleNewsRss`/`parseRssFeed`/`parseFinnhubNews` functions turning raw RSS/JSON bytes into `RawNewsItem[]`, proven by fixture-driven TDD against the live-captured Google News, ET Markets/LiveMint, and Finnhub shapes — zero I/O, honest `{items, error}` on malformed input, never a throw.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-17T16:35:00-05:00 (approx)
- **Completed:** 2026-07-17T16:42:03-05:00
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2 (both new)

## Accomplishments
- `parseGoogleNewsRss` correctly reads the publisher name from Google News' `<source url="...">Name</source>` element (never hardcoded "Google News"), preserves the raw " - Publisher" title suffix for dedupe.ts to strip later, converts RFC-822 GMT pubDates to ISO-8601 UTC, and discards the anchor-soup `<description>`.
- `parseRssFeed` handles the CDATA-wrapped title/link/description/pubDate shape observed live on ET Markets and LiveMint, including the `+0530` RFC-822 offset, and pins the fast-xml-parser single-item-yields-an-object pitfall (verified: `isArray` forces a one-element array even for a lone `<item>`).
- `parseFinnhubNews` validates an `unknown` JSON value, maps `headline`→`title` and unix-SECONDS `datetime`→ISO (×1000), skips entries missing a required field instead of fabricating data, and surfaces Finnhub's own `{"error": "..."}` auth-failure message honestly rather than a generic string.
- No parser ever throws — confirmed against garbage XML, garbage JSON, and an empty object.

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED — fixture-driven tests for all three parsers** - `1b737fe` (test)
2. **Task 2: TDD GREEN — implement the three parsers** - `b5658dc` (feat)

**Plan metadata:** (this commit, SUMMARY.md only)

_No REFACTOR commit — GREEN passed cleanly on first implementation, nothing needed cleanup._

## Files Created/Modified
- `scripts/news-parse-test.ts` - node:assert/strict fixture tests: Google News RSS (2 items), publisher RSS CDATA/+0530 (2 items), single-item array pitfall, Finnhub valid+skip (2 valid of 4 entries), Finnhub source-fallback behavior, and malformed-input honesty across all three parsers (6 case groups, all green)
- `src/lib/news/parse-feeds.ts` - `parseGoogleNewsRss`, `parseRssFeed`, `parseFinnhubNews`, `ParseResult` type; shared `XMLParser`/`parseChannel`/`extractText`/`pubDateToIso`/`asItemRecords` helpers; zero I/O

## Decisions Made
- Live-probed fast-xml-parser's actual output shapes before writing assertions (sandboxed one-off script, not committed) to avoid guessing: confirmed `<source url="...">Text</source>` parses to `{ '#text': 'Text', '@_url': '...' }`, confirmed `'not xml at all'` parses to `{}` (no throw) and `'<html>...'` parses to `{ html: {...} }` (no throw) — both correctly caught by the missing-`<rss><channel>` check rather than a try/catch, since fast-xml-parser doesn't throw on non-XML text.
- Kept `extractText()` generic enough to handle both the plain-string and `{'#text', '@_attr'}` node forms in one helper, reused by title/link/pubDate/source/description across both RSS parsers — avoids duplicating the "is this a string or an attributed node" check four times.
- Added one extra test group (`testFinnhubSourceFallback`) beyond the plan's explicit assertions, covering the `fallbackSource` parameter and the `'Finnhub'` default, since the plan's own function signature defines that parameter and it's directly exercised by the implementation.

## Deviations from Plan

None - plan executed exactly as written. All fixture shapes, assertions, and function signatures match the plan's specification; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

None specific to this plan's own files. `npx tsc --noEmit` showed one pre-existing transient error, `scripts/digest-compose-test.ts(24,3): error TS2305: Module '"../src/lib/digest/compose"' has no exported member 'buildDailyDigestMessage'` — this is the concurrently-running 07-02 executor's own in-flight TDD RED state (`src/lib/digest/*`, entirely outside this plan's file scope), already documented in `.planning/phases/06-news-pipeline/deferred-items.md` under the "06-05" entry from an earlier sibling run. Not fixed here (out of scope); verified isolated by confirming zero tsc errors reference `parse-feeds.ts` or `news-parse-test.ts`.

A shared-git-index race was observed while staging Task 1 (`git status --short` briefly showed `scripts/news-alert-test.ts` and `src/lib/news/build-news-message.ts` — both belonging to the concurrent 06-07 executor — as staged "A" alongside this plan's own `scripts/news-parse-test.ts`). Handled per the standing parallel-executor protocol: committed with an explicit trailing pathspec restricted to only this plan's file, then verified via `git show HEAD --stat` that exactly one file landed in each of the two commits. No corrective commit was needed since the explicit pathspec prevented the sibling's files from ever entering this plan's commits.

## User Setup Required

None - no external service configuration required. This plan is pure/offline; no network calls, no API keys, no database, no environment variables.

## Next Phase Readiness
- `src/lib/news/parse-feeds.ts` is ready for the 06-08 fetch wrappers to import directly: each wrapper only needs to fetch raw bytes/JSON and hand them to the matching parser, per the fetch-prices.ts/ingest.ts separation this plan follows.
- No blockers. Concurrent siblings (06-05 summarize/ai, 06-06 read/page, 06-07 build-news-message/alert-sweep, 07-01 migrations, 07-02 digest) are unaffected — this plan touched only its two assigned files.

---
*Phase: 06-news-pipeline*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: src/lib/news/parse-feeds.ts
- FOUND: scripts/news-parse-test.ts
- FOUND: .planning/phases/06-news-pipeline/06-04-SUMMARY.md
- FOUND: 1b737fe (test commit)
- FOUND: b5658dc (feat commit)
