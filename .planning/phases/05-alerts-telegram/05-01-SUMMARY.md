---
phase: 05-alerts-telegram
plan: 01
subsystem: database
tags: [postgres, supabase, rls, row-level-security, plpgsql, security-definer, outbox]

# Dependency graph
requires:
  - phase: 04-csv-import
    provides: "the account-ownership RLS EXISTS-subquery shape (transactions/import_batches) and the SECURITY DEFINER controlled-write-path precedent (find_or_create_instrument) this plan reuses verbatim"
provides:
  - "price_alerts table (account-owned, cooldown state, one-per-instrument-per-direction) replacing the dead legacy Phase-1 alerts table"
  - "telegram_links table (user-keyed, closed-UPDATE allowlist posture — the structural boundary ALRT-01 depends on)"
  - "notifications_outbox table (payload-generic kind/payload/dedupe_key, service-role-write-only) that Phases 5/6/7 all enqueue into"
  - "claim_due_notifications SECURITY DEFINER RPC (FOR UPDATE SKIP LOCKED claim + exponential-backoff + dead-letter) for concurrent dispatchers"
  - "scripts/rls-isolation-test.ts extended to prove all three new tables' RLS/allowlist postures"
affects: [05-alerts-telegram (all later plans in this phase build on this schema), 06-news-pipeline, 07-daily-digest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Closed-UPDATE allowlist posture: a table with SELECT/INSERT/DELETE policies for the owner but ZERO UPDATE policy for any authenticated role — the absence of the policy IS the security boundary (telegram_links.chat_id/status can only ever be set by the service role)."
    - "FOR UPDATE SKIP LOCKED claim function (SECURITY DEFINER, revoked from anon/authenticated) as the concurrent-dispatcher-safe queue-claim idiom, extending the 04-01 find_or_create_instrument RPC precedent."

key-files:
  created:
    - supabase/migrations/20260716221450_alerts_telegram.sql
  modified:
    - scripts/rls-isolation-test.ts

key-decisions:
  - "One alert per (account, instrument, direction) — kept UNIQUE (account_id, instrument_id, direction) as researched, not relaxed to include threshold."
  - "Default cooldown_minutes = 1440 (24h), floor 60, per-alert override."
  - "telegram_links gets NO UPDATE policy at all (not even owner-scoped) — re-linking is DELETE + INSERT; only the service role can complete a handshake."
  - "notifications_outbox gets exactly one policy (owner SELECT) — no authenticated write policy of any kind, matching the price_cache/fx_cache closed posture."
  - "claim_due_notifications dead-letters (status='failed') any row with attempts >= 8 before claiming, so poison messages self-terminate without a sweeper."

patterns-established:
  - "RLS isolation test now covers 'structural closure' assertions (update affects zero rows for BOTH the owner and a stranger), not just ownership-CRUD assertions — a new test shape for tables where nobody but the service role may write a column."

requirements-completed: [ALRT-01, ALRT-02, ALRT-03, ALRT-05]

# Metrics
duration: 15min
completed: 2026-07-16
---

# Phase 5 Plan 01: Schema — price_alerts, telegram_links, notifications_outbox Summary

**One new migration (three tables + one SECURITY DEFINER claim function) locking in Phase 5's schema and RLS write-ownership boundaries before any evaluator, dispatcher, or UI is built against them — plus an RLS isolation test extension proving each posture.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 extended)

## Accomplishments
- `price_alerts` created (dropping the empty, never-written legacy Phase-1 `alerts` table) with the exact four-policy account-ownership EXISTS-subquery RLS shape copied verbatim from `transactions`/`import_batches`, cooldown state (`last_triggered_at`, `cooldown_minutes` default 1440/floor 60), and the one-per-(account, instrument, direction) unique constraint.
- `telegram_links` created as a user-keyed handshake table with a deliberately closed UPDATE posture — SELECT/INSERT/DELETE policies for the owner, but zero UPDATE policy for anyone, which structurally IS the ALRT-01 allowlist (only the service role can ever set `chat_id`/`status='linked'`). `chat_id` is BIGINT (never INT — Telegram ids exceed 32 bits).
- `notifications_outbox` created as the payload-generic, service-role-write-only outbox (`kind` enumerates all three roadmapped kinds now — `price_alert`/`news_alert`/`daily_digest` — so Phases 6/7 need no further migration), with a partial unique dedupe index and a due-pending index.
- `claim_due_notifications(p_limit INT DEFAULT 25)` — a `SECURITY DEFINER` plpgsql function using `FOR UPDATE SKIP LOCKED` to atomically claim due rows, bump attempts/backoff, and dead-letter rows that have exhausted 8 attempts; revoked from `anon`/`authenticated` (service-role only, stricter than `find_or_create_instrument`).
- `scripts/rls-isolation-test.ts` extended with three new coverage blocks: `price_alerts` (owner-write CRUD + cross-user read/write rejection, same shape as `transactions`), `telegram_links` (owner-insert/read proof + the allowlist-closure proof that UPDATE affects zero rows for both a stranger AND the owner), and `notifications_outbox` (authenticated INSERT rejected).

## Task Commits

Each task was committed atomically:

1. **Task 1: Drop legacy alerts, create price_alerts (account-ownership RLS + cooldown state)** - `fe08893` (feat)
2. **Task 2: telegram_links + notifications_outbox + claim_due_notifications RPC** - `ffc7c9b` (feat)
3. **Task 3: Extend the two-user RLS isolation test to the three new tables** - `a8dd620` (test)

_Note: no plan-metadata commit yet — this SUMMARY/STATE/ROADMAP update is the final commit for this plan, made after this file is written._

## Files Created/Modified
- `supabase/migrations/20260716221450_alerts_telegram.sql` - the single new migration: drops legacy `alerts`; creates `price_alerts`, `telegram_links`, `notifications_outbox` with their RLS policies and indexes; creates `claim_due_notifications`.
- `scripts/rls-isolation-test.ts` - extended (not rewritten) with three new coverage blocks for the tables above, following the file's existing two-authenticated-session / `node:assert`-style / throw-on-failure structure.

## Decisions Made
- Locked the research's Open Questions as specified in the plan: one alert per (account, instrument, direction); 24h default cooldown with a 60-minute floor; `telegram_links` gets no UPDATE policy for anyone (not even the owner) — the closure itself is the allowlist; `notifications_outbox` gets exactly one policy (owner SELECT), zero write policies.
- No column-level restriction added on `price_alerts.last_triggered_at` — a user updating their own row via the existing owner-UPDATE policy is self-harm only (the evaluator always writes via the admin client, bypassing RLS regardless).

## Deviations from Plan

None — plan executed exactly as written. The migration's SQL was copied verbatim from `05-RESEARCH-schema-outbox.md` sections 1-4 as instructed, and the RLS test extension follows the file's established structure without weakening any existing assertion.

## Issues Encountered

`npx tsc --noEmit` surfaced one pre-existing error in `scripts/alerts-eval-test.ts` (`Module has no exported member 'computeAlertDedupeKey'`), owned by the parallel 05-03 executor's in-flight TDD RED phase on a disjoint file this plan does not touch. Confirmed out of scope per the SCOPE BOUNDARY rule (not caused by this plan's changes) and confirmed `scripts/rls-isolation-test.ts` itself typechecks clean in isolation (`npx tsc --noEmit 2>&1 | grep -v alerts-eval-test.ts` → no output). Not fixed, not logged to deferred-items.md (transient parallel-executor state, not a defect).

`npm run test:rls` was run to confirm the DEFERRED live-run claim is honest, not fabricated: it fails at `import_batches` — Phase 4's migration (`20260715230011_csv_import.sql`) is also still unapplied to the live hosted DB, so execution never reaches this plan's new Phase 5 assertions. This is the expected state (matches STATE.md's recorded Phase 4 DEFERRED status) and is recorded here as the honest verification result, not a regression.

## User Setup Required

None - no external service configuration required. Live migration apply (this file plus the still-pending Phase 4 migration) and the live `npm run test:rls` run are explicitly DEFERRED to the phase-closing checkpoint 05-09, per the 03-01→03-06 / 04-01→04-07 precedent — requires explicit user consent before any `supabase db push` (which would also apply the deliberately-held-back `price_refresh_cron.sql` unless pushed selectively).

## Next Phase Readiness

Schema and RLS write-ownership boundaries for all of Phase 5 are now locked: `price_alerts`, `telegram_links`, `notifications_outbox`, and `claim_due_notifications` exist as static, reviewed SQL. Plans 05-02 (pure Telegram logic) and 05-03 (pure alert evaluation) — both running in parallel with this plan on disjoint files — do not depend on this schema landing live; later plans that DO touch the database (05-04 outbox engine, 05-05 evaluate-and-enqueue sweep, 05-06 handshake Server Actions, 05-07 alert CRUD Server Actions) can now code directly against these exact table/column/function shapes. No blockers. Live apply remains outstanding until 05-09.

---
*Phase: 05-alerts-telegram*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260716221450_alerts_telegram.sql
- FOUND: scripts/rls-isolation-test.ts
- FOUND: .planning/phases/05-alerts-telegram/05-01-SUMMARY.md
- FOUND: commit fe08893 (Task 1)
- FOUND: commit ffc7c9b (Task 2)
- FOUND: commit a8dd620 (Task 3)
