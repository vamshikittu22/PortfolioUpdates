---
phase: 07-daily-digest
plan: 01
subsystem: database
tags: [postgres, supabase, rls, pg_cron, pg_net, migrations]

# Dependency graph
requires:
  - phase: 05-alerts-telegram
    provides: "notifications_outbox with 'daily_digest' pre-enumerated in the kind CHECK (20260716221450_alerts_telegram.sql), telegram_links user-keyed handshake table as the sibling precedent for digest_preferences' shape"
provides:
  - "digest_preferences table (user_id PK -> auth.users, enabled BOOLEAN DEFAULT FALSE) with own-row SELECT/INSERT/UPDATE RLS — the durable DGST-02 opt-in flag"
  - "Deploy-gated once-daily pg_cron + pg_net schedule (03:15 UTC / 08:45 IST) POSTing to /api/digest/run, secret-free, cloning price_refresh_cron.sql's never-apply-locally posture"
  - "RLS isolation test check 11: digest_preferences own-row CRUD proof (cross-user read/write blocked, owner update succeeds)"
affects: [07-02, 07-03, 07-04, 07-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deploy-gated cron migration: authored, secret-free (app.settings.* via current_setting), never applied locally — joins price_refresh_cron.sql on the hold-back list"
    - "User-level opt-in table (own-row SELECT/INSERT/UPDATE, no DELETE) as the honest 'no row == disabled' pattern, distinct from telegram_links' closed-UPDATE allowlist posture"

key-files:
  created:
    - supabase/migrations/20260718090000_daily_digest.sql
    - supabase/migrations/20260718090500_daily_digest_cron.sql
  modified:
    - scripts/rls-isolation-test.ts

key-decisions:
  - "digest_preferences is its own user-keyed table, not a column on telegram_links (rows are DELETE+INSERT'd on relink, no UPDATE policy exists) or account_settings (mock-era, account-scoped; digest concerns are user-level)"
  - "digest_preferences DOES get an authenticated UPDATE policy, unlike telegram_links — a plain boolean toggle has no allowlist boundary to protect"
  - "notifications_outbox deliberately untouched — Phase 5 pre-enumerated 'daily_digest' in the kind CHECK"
  - "Cron scheduled 03:15 UTC (08:45 IST), 15 min after the 03:00 UTC price refresh tick, so digest composition uses prices at most ~15 min old"

patterns-established:
  - "Own-row opt-in preference table pattern (digest_preferences) for future per-user toggle features"

requirements-completed: [DGST-01, DGST-02]

# Metrics
duration: 9min
completed: 2026-07-17
---

# Phase 7 Plan 01: Digest Schema Foundation Summary

**digest_preferences opt-in table with own-row RLS plus a secret-free, deploy-gated once-daily pg_cron schedule for /api/digest/run — notifications_outbox deliberately left untouched.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-17T16:31:00-05:00 (approx, first file read)
- **Completed:** 2026-07-17T16:40:03-05:00
- **Tasks:** 3/3
- **Files modified:** 3 (2 new migrations + 1 extended test script)

## Accomplishments

- `digest_preferences` table authored: `user_id UUID PK -> auth.users`, `enabled BOOLEAN NOT NULL DEFAULT FALSE`, own-row SELECT/INSERT/UPDATE RLS, no DELETE policy — the durable DGST-02 opt-in flag that survives Telegram re-linking (unlike a column on `telegram_links`, whose rows are DELETE+INSERT'd on every relink).
- Deploy-gated once-daily cron migration authored as a structural clone of `price_refresh_cron.sql`: `pg_cron.schedule('daily-digest-0845-ist', '15 3 * * *', ...)` POSTs via `net.http_post` to `/api/digest/run`, reading `app.settings.digest_run_url`/`digest_run_secret` via `current_setting(..., true)` — no secret in git, loud header warning against local apply.
- `scripts/rls-isolation-test.ts` extended with check 11: proves `digest_preferences` is user-isolated (insert-own succeeds, cross-user read returns zero rows, cross-user update affects zero rows, owner-update succeeds) — appended after the existing check 10 (news_item_instruments, added by a concurrent 06-01 executor) without renumbering or rewriting anything prior.

## Task Commits

Each task was committed atomically:

1. **Task 1: digest_preferences migration (user-level opt-in, own-row RLS)** - `e029e3b` (feat)
2. **Task 2: Deploy-gated once-daily digest cron migration** - `5102c78` (feat)
3. **Task 3: Extend the two-user RLS isolation test for digest_preferences** - `4363587` (test)

**Plan metadata:** (this SUMMARY.md commit, made separately per bookkeeping rule)

## Files Created/Modified

- `supabase/migrations/20260718090000_daily_digest.sql` - New: `digest_preferences` table + own-row SELECT/INSERT/UPDATE RLS policies, header documents two rejected alternatives
- `supabase/migrations/20260718090500_daily_digest_cron.sql` - New: deploy-gated `pg_cron`/`pg_net` daily schedule, secret-free via `app.settings.*`
- `scripts/rls-isolation-test.ts` - Extended: check 11 digest_preferences own-row CRUD isolation proof, doc-comment header updated to list it

## Decisions Made

- **digest_preferences as its own table, not a column** — the plan's two rejected alternatives (a `telegram_links` column, an `account_settings` column) are both documented verbatim in the migration's header comment so a future reader does not "fix" this into either shape.
- **Own-row UPDATE policy included** (unlike telegram_links' closed posture) — a plain boolean opt-in toggle has no allowlist boundary; toggling it is the entire point of the table.
- **Cron timing**: 03:15 UTC / 08:45 IST, 15 minutes after the existing 03:00 UTC price-refresh tick, so the digest never composes from prices more than ~15 minutes stale.
- **notifications_outbox left completely untouched** — verified via `grep -in "notifications_outbox" supabase/migrations/20260718090000_daily_digest.sql`, which returns only the header comment explaining why not.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>`/`<verify>`/`<done>` specs; both migration timestamps (20260718090000, 20260718090500) already sorted after the latest existing migration (`20260717120000_news_pipeline.sql`) with no bump needed.

## Issues Encountered

- `npx tsc --noEmit` reported pre-existing errors in `scripts/digest-compose-test.ts` (`Cannot find module '../src/lib/digest/compose'`, etc.) — traced to a concurrent 07-02 executor's in-flight files (owns `src/lib/digest/*` + `package.json` per this session's disjoint-file wave plan), confirmed unrelated to this plan's own file via `npx tsc --noEmit 2>&1 | grep -i "rls-isolation"` returning zero matches. Logged to `.planning/phases/07-daily-digest/deferred-items.md` (out of scope per the executor scope-boundary rule) rather than fixed; expected to self-resolve once 07-02 completes, matching the 05-06/05-05 `DispatchSummary` precedent in STATE.md.
- `npm run test:rls` re-run to confirm the deferral is real: honest pre-existing FAIL at `import_batches not found` (Phase 4's migration is still unpushed live), before ever reaching the new digest_preferences block — exactly the expected outcome per the plan's verification step.

## User Setup Required

None - no external service configuration required. The cron migration's one-time operator setup (`ALTER DATABASE postgres SET app.settings.digest_run_url/digest_run_secret`) is documented in the migration's header comment but is explicitly deploy-time only, not a local setup step.

## Next Phase Readiness

- `digest_preferences` is ready for 07-02 (digest composition logic) and 07-03/07-04 (the sweep + delivery) to read/write via the standard cookie-bound client for user-facing toggles, and via the service role for the sweep's cross-user read.
- Both new migrations are authored-only: `20260718090000_daily_digest.sql` is consent-gated (push deferred to 07-05, alongside `csv_import.sql`/`alerts_telegram.sql`/`news_pipeline.sql`), and `20260718090500_daily_digest_cron.sql` is additionally deploy-gated — it must NEVER be applied from localhost, joining `price_refresh_cron.sql` on that hold-back list until a real public deploy exists.
- `scripts/rls-isolation-test.ts` check 11 is present and statically correct; its live pass is blocked on the same pending-migration chain as checks 5-10, deferred to 07-05.
- No blockers for 07-02 (digest composition, disjoint files: `src/lib/digest/*` + `package.json`), which was observed running concurrently in this same session.

---
*Phase: 07-daily-digest*
*Completed: 2026-07-17*

## Self-Check: PASSED

All claimed files verified present on disk (`supabase/migrations/20260718090000_daily_digest.sql`, `supabase/migrations/20260718090500_daily_digest_cron.sql`, `.planning/phases/07-daily-digest/deferred-items.md`, `.planning/phases/07-daily-digest/07-01-SUMMARY.md`) and all three task commit hashes (`e029e3b`, `5102c78`, `4363587`) verified present in `git log --oneline --all`.
