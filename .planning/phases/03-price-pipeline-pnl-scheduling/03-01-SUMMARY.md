---
phase: 03-price-pipeline-pnl-scheduling
plan: 01
subsystem: database
tags: [postgres, supabase, pg_cron, pg_net, rls, migrations]

# Dependency graph
requires:
  - phase: 02-schema-persistence-hydration
    provides: "public.instruments table (ISIN+exchange identity) that price_cache.instrument_id now references"
provides:
  - "fx_cache table: cached FX rates, RLS read-only for authenticated, service-role write only"
  - "price_cache re-keyed to instrument_id (was bare symbol) with nullable price/source, fetch_error, corporate_action_flag"
  - "pg_cron + pg_net migration scheduling a 3-hourly POST to /api/prices/refresh, secret read from Postgres settings (not hardcoded)"
affects: [03-02, 03-03, 03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared reference table RLS pattern reused for fx_cache: authenticated SELECT-only policy, no write policy (service role writes via admin client)"
    - "Nullable price/source columns represent 'never fetched' honestly instead of a fabricated 0/placeholder value"
    - "pg_cron job body reads URL/secret via current_setting(..., true) so no secret or domain is hardcoded in a committed migration file"

key-files:
  created:
    - supabase/migrations/20260714220333_price_fx_schema.sql
    - supabase/migrations/20260714220438_price_refresh_cron.sql
  modified: []

key-decisions:
  - "price_cache primary key changed from symbol to instrument_id — required so the same company on two exchanges (e.g. INFY NSE vs NYSE) gets distinct, non-colliding rows, per Phase 2's ISIN+exchange identity decision."
  - "price/source made nullable rather than defaulting to 0/'unknown' — NULL is the only honest representation of 'instrument tracked but never successfully priced', distinct from 'stale' (old updated_at) and 'failed' (fetch_error set)."
  - "pg_cron/pg_net migration authored and statically reviewed only — live apply and actual job execution deferred to plan 03-06's checkpoint since this environment has no Docker and the live hosted Supabase has not yet had these migrations pushed."

patterns-established:
  - "Pattern: new Phase 3+ shared tables follow the fx_cache RLS shape exactly (authenticated SELECT-only, no authenticated write policy, service-role writes only)."

requirements-completed: [PRICE-01, PRICE-02, PRICE-06, PRICE-07]

# Metrics
duration: 2min
completed: 2026-07-14
---

# Phase 03 Plan 01: Price/FX Schema + Refresh Scheduling Summary

**Authored fx_cache table and re-keyed price_cache to instrument_id with honest nullable price/source, plus a pg_cron/pg_net migration scheduling a secret-guarded 3-hourly refresh — both new migrations, statically verified, live apply deferred.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-14T22:03:30Z
- **Completed:** 2026-07-14T22:05:25Z
- **Tasks:** 3 (2 code tasks + 1 verification-only task)
- **Files modified:** 2 (both new files)

## Accomplishments
- `fx_cache` table created: one authoritative cached rate per currency pair (e.g. `USD_INR`), RLS enabled, authenticated SELECT-only (no write policy — matches Phase 1's shared-table write-hole-closing precedent from `rls_fixes.sql`).
- `price_cache` re-keyed from bare `symbol` (Phase 1) to `instrument_id` (Phase 2 identity), so dual-listed instruments (e.g. INFY on NSE vs NYSE) get distinct price rows. `price` and `source` made nullable so "never successfully fetched" is representable without a fabricated placeholder value. Added `fetch_error` (last-failure message) and `corporate_action_flag` (>40% overnight move flag) columns.
- New pg_cron + pg_net migration schedules `refresh-price-cache-every-3h` (`0 */3 * * *`) to POST to the refresh endpoint, reading both the URL and the bearer secret from Postgres `current_setting(...)` custom settings — no secret or deployed domain is hardcoded in the committed SQL file.
- Confirmed via `git diff --stat` across both commits that no existing migration (Phase 1's `initial_schema`/`rls_fixes`, or Phase 2's `instruments_transactions`/`watchlist_instrument_identity`/`seed_instruments`) was touched — only the two new timestamped files were added.

## Task Commits

Each task was committed atomically:

1. **Task 1: fx_cache + price_cache schema migration** - `d0bcd2c` (feat)
2. **Task 2: pg_cron + pg_net scheduling migration** - `97d8608` (feat)
3. **Task 3: static verification pass** - no commit (verification-only, no files modified)

**Plan metadata:** (this commit, following SUMMARY/STATE/ROADMAP update)

## Files Created/Modified
- `supabase/migrations/20260714220333_price_fx_schema.sql` - Creates `fx_cache`; re-keys `price_cache` to `instrument_id`; adds `fetch_error`, `corporate_action_flag`; makes `price`/`source` nullable.
- `supabase/migrations/20260714220438_price_refresh_cron.sql` - Enables `pg_cron`/`pg_net`; schedules 3-hourly `net.http_post` to the refresh endpoint using `current_setting(...)` for URL/secret.

## Decisions Made
- Re-keyed `price_cache` to `instrument_id` instead of keeping `symbol` as PK, per Phase 2's ISIN+exchange instrument identity decision — a bare symbol cannot distinguish INFY-on-NSE from INFY-on-NYSE.
- Kept `symbol` as a non-unique indexed column (not dropped) for display/debug lookups only.
- Made `price`/`source` nullable rather than inventing a sentinel value (`0`, `'unknown'`) — NULL is the only honest way to represent "tracked but never priced," consistent with the project's no-fabricated-value rule (PRICE-04 elsewhere in the requirement set).
- pg_cron job reads `app.settings.price_refresh_url` / `app.settings.price_refresh_secret` via `current_setting(..., true)` rather than embedding either value — keeps the secret out of git history entirely; an operator sets both once directly against the live project via `ALTER DATABASE ... SET ...` (documented in a comment in the migration, not executed by this plan).

## Deviations from Plan

None — plan executed exactly as written. Both migration files match the SQL specified in the plan verbatim (only the `npx supabase migration new` generated timestamps differ from the plan's `<timestamp>` placeholders, as expected).

## Issues Encountered

None. `npx supabase migration new` worked as a pure filesystem scaffold with no Docker required, exactly as anticipated in the plan.

## Environment Note (read before next plan in this phase)

This plan's <environment> instructions state a live hosted Supabase now exists (project `ozkorwkhtamyaavuphhm`) with all 5 prior migrations already applied. Per this plan's explicit instructions, **no `supabase db push`/`db reset` or any live-writing command was run** — migrations were authored and statically verified only (grep checks + `git diff --stat` proof + FK-ordering review by eye). Applying these two new migrations to the live DB is the orchestrator's job, with explicit user consent, and remains DEFERRED here.

### Done (authored, static-verified)
- `20260714220333_price_fx_schema.sql` — all 4 grep verification checks passed (fx_cache CREATE TABLE present once, price/source nullable, PK is instrument_id, exactly 1 new CREATE POLICY for fx_cache).
- `20260714220438_price_refresh_cron.sql` — all 3 verification checks passed (cron.schedule present, current_setting used 3x for url+secret, no hardcoded secret/domain outside the commented operator-instructions).
- Task 3 static pass — `git diff --stat` proves only the two new files changed; migration count went from 5 to 7 (5 pre-existing + 2 new); FK/extension ordering confirmed correct by timestamp (fx_schema's `instruments` FK target was created in a Phase 2 migration that sorts earlier; cron migration has no table dependency).

### Deferred (live apply pending orchestrator push)
- Running these two migrations against the live hosted Supabase project.
- Confirming `fx_cache`/`price_cache` RLS policies behave as designed against real data (authenticated SELECT succeeds, authenticated write fails, service-role write succeeds).
- Registering and firing the pg_cron job for real — requires an operator to run the `ALTER DATABASE postgres SET app.settings.price_refresh_url/...secret` statements directly against the live project (never via a migration file) plus a deployed domain. Exercised in plan 03-06's checkpoint.

## User Setup Required

None yet from this plan directly. A future step (plan 03-06, or whenever these migrations are pushed) will require an operator to run, once, directly against the live Supabase project (NOT via a migration file, so the secret never enters git history):
```sql
ALTER DATABASE postgres SET app.settings.price_refresh_url = 'https://<deployed-domain>/api/prices/refresh';
ALTER DATABASE postgres SET app.settings.price_refresh_secret = '<value of PRICE_REFRESH_SECRET>';
```

## Next Phase Readiness
- The storage shape Phase 3 depends on is locked in: `fx_cache` for FX rates, `price_cache` keyed by `instrument_id` with honest nullable price/source/fetch_error/corporate_action_flag fields.
- Plans 03-02 through 03-05 (price fetch library, refresh endpoint, P&L calculator, UI wiring) can now be written against this schema.
- Blocker for full closure: these two migrations, plus all 5 prior ones, still need to be pushed to the live hosted Supabase project before any runtime behavior (RLS enforcement, cron firing) can be verified — tracked as deferred verification debt, consistent with Phase 1/2's carried-forward CODE-ONLY mode.

---
*Phase: 03-price-pipeline-pnl-scheduling*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260714220333_price_fx_schema.sql
- FOUND: supabase/migrations/20260714220438_price_refresh_cron.sql
- FOUND: .planning/phases/03-price-pipeline-pnl-scheduling/03-01-SUMMARY.md
- FOUND commit: d0bcd2c
- FOUND commit: 97d8608
