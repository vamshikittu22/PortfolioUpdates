# Plan 06-09 Summary: News ingest orchestration + secret-guarded refresh route

**Status:** COMPLETE (executor cut off by session limit at final verification; orchestrator verified and committed the finished work)
**Requirements:** NEWS-01, NEWS-02, NEWS-04, NEWS-05, ALRT-04

## What was built

- `src/lib/news/ingest.ts` (357 lines, commit `a81d3a6`) — `refreshAllNews(admin)`: discovers held+watched instruments, fans out keyless Google News RSS + Indian publisher RSS fetches and the key-gated Finnhub path via `fetch-news.ts`, dedupes by canonical URL + title hash (`dedupe.ts`), matches via the word-boundary matcher (`match.ts`), inserts new `news_items` + `news_item_instruments` rows (service-role posture per schema), then batch-summarizes NEW matched items via `summarize.ts`/`ai.ts` with honest quota-degrade (`summary_status` stays honest, feed falls back to headlines-only per NEWS-05), and finally runs `sweepNewsAlerts` + `dispatchOutbox`.
- `src/app/api/news/refresh/route.ts` (commit `d0f4502`) — secret-guarded POST entry point with its OWN `NEWS_REFRESH_SECRET` (independent rotation, least privilege — same rationale as `NOTIFY_DISPATCH_SECRET`); guard runs BEFORE any Supabase client construction. Deliberately a separate route from the price cron: news ingest is heavier and independently tunable; a news cron migration is explicitly out of scope (deploy-gated precedent).

## Verification (orchestrator-run after recovery)

- `npx tsc --noEmit` clean project-wide
- `npm run build` clean; `ƒ /api/news/refresh` present in the route table
- Staged-content review before commit: exactly the two files, no cross-contamination

## Deferred (to 06-10)

Live ingest run (needs the news migration pushed + FINNHUB_API_KEY/GEMINI_API_KEY), live dedupe/matching against real feed data at DB level, live summarization + quota behavior, live news alert delivery.

## Notes

Executor `a5163b52b5c469e9e` was terminated by a session limit at ~107 tool uses with both files written and ingest.ts staged; the orchestrator completed verification and made the two task commits. No deviations from plan observed in the recovered artifacts.
