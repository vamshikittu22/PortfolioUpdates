# Plan 07-05 Summary: Live Daily Digest Verification Checkpoint — DEFERRED

**Status:** DEFERRED — checkpoint reached 2026-07-18; standing user direction is to defer user-gated live verification and record it honestly (03-06/04-07/05-09/06-10 precedent)
**Requirements gated here:** live proof of DGST-01, DGST-02 (all code-complete/static-verified in 07-01..07-04)

## Verified NOW (honest, no fabrication)

| Check | Result |
|---|---|
| `npx tsc --noEmit` / `npm run build` | clean; `ƒ /api/digest/run` in route table; /alerts renders DigestSettingsCard |
| `npm run test:digest-compose` | PASS (16 case groups: IST rollover incl. year boundary, dedupe key, top movers exclusion rules, HTML builder honest empties + whole-item truncation) |
| Regression: all other 8 test suites | PASS (telegram, alerts, import-parse, news-dedupe/match/parse/summarize/alert) |
| `npm run test:rls` | honest FAIL at first unapplied migration — digest_preferences check 11 unreached, deferral genuine |

## DEFERRED until user provides

1. **TELEGRAM_BOT_TOKEN** (BotFather) + linked chat → live send-test digest delivery, single-message composition check.
2. **Migration-push consent** → `20260718090000_daily_digest.sql` (+ the three other pending phase migrations) → live toggle round-trip, once-per-day idempotency proof (second `curl` enqueues zero rows), enabled-but-unlinked skip behavior, RLS check 11 green.
3. **Public deploy** → apply `20260718090500_daily_digest_cron.sql` (NEVER locally) → real 08:45 IST daily schedule firing.

## Resume path

Token + consent → selective `db push` → enable digest on /alerts → "Send test digest" → real Telegram message with total value, day P&L, top movers, news (or honest portfolio-only degrade) → `curl -X POST /api/digest/run -H "Authorization: Bearer $DIGEST_RUN_SECRET"` twice, second run 0 new enqueues → deploy → cron migration → observe next-morning digest.
