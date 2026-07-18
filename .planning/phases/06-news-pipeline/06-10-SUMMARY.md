# Plan 06-10 Summary: Live News Pipeline Verification Checkpoint — DEFERRED

**Status:** DEFERRED — checkpoint reached 2026-07-18; standing user direction is to defer user-gated live verification and record it honestly (03-06/04-07/05-09 precedent)
**Requirements gated here:** live proof of NEWS-01..05 + ALRT-04 (all code-complete/static-verified in 06-01..06-09)

## Verified NOW (honest, no fabrication)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean project-wide |
| `npm run build` | clean; `ƒ /api/news/refresh` in route table |
| `npm run test:news-dedupe` | PASS (7 case groups) |
| `npm run test:news-match` | PASS (9 case groups + suffix coverage) |
| `npm run test:news-parse` | PASS (6 case groups) |
| `npm run test:news-summarize` | PASS (6 case groups, token-free) |
| `npm run test:news-alert` | PASS |
| Keyless fetch paths | LIVE-verified in 06-08: Google News 100 items, ET Markets 50, LiveMint 35 through the real wrappers |
| `npm run test:rls` | honest FAIL at `import_batches` not found — proof the Phase 4/5/6 migrations are genuinely unapplied, not masked |

## DEFERRED until user provides

1. **FINNHUB_API_KEY** (free tier, finnhub.io) → live US-ticker company-news fetch.
2. **GEMINI_API_KEY** (or confirm reuse of the legacy YouTube-route key) → live batch summarization, quota-degrade observation.
3. **Migration-push consent** → `20260717120000_news_pipeline.sql` (with the also-pending `20260715230011_csv_import.sql`, `20260716221450_alerts_telegram.sql`, `20260718090000_daily_digest.sql`; NEVER `price_refresh_cron.sql`/`20260718090500_daily_digest_cron.sql` — deploy-gated) → live `test:rls` green, live ingest run, real feed rows in `/news`, persisted summaries never regenerated, significant-news Telegram alert via outbox (also needs TELEGRAM_BOT_TOKEN from 05-09's deferred list).

## Resume path

Provide the keys + consent → `supabase login`/`link`/selective `db push` → `curl -X POST /api/news/refresh -H "Authorization: Bearer $NEWS_REFRESH_SECRET"` → verify `/news` feed, summary persistence, headline-only degrade with key removed, news alert delivery.
