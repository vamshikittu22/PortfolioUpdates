---
phase: 01-auth-rls-foundation
plan: 01
subsystem: supabase-foundation
tags: [supabase, rls, migrations, security, env]
mode: code-only / defer-verification
requires: []
provides:
  - supabase/config.toml (local stack config, email confirmations off)
  - supabase/migrations (initial_schema + rls_fixes)
  - RLS write-holes closed on price_cache / news_items
  - RLS join-column indexes
  - .env.local Supabase placeholder scaffolding (incl. server-only service-role key)
affects:
  - public.price_cache
  - public.news_items
  - public.investment_accounts / holdings / watchlist_items / alerts / brokers (indexes)
tech-stack:
  added:
    - supabase CLI v2.109.1 (used via npx, not installed globally)
  patterns:
    - migrations as canonical schema source of truth
    - shared-table writes reserved for service role (RLS-bypassing)
    - server-only secret never prefixed NEXT_PUBLIC_
key-files:
  created:
    - supabase/config.toml
    - supabase/.gitignore
    - supabase/migrations/20260714032952_initial_schema.sql
    - supabase/migrations/20260714032957_rls_fixes.sql
  modified:
    - supabase/schema.sql
    - .env.local (gitignored; not committed)
decisions:
  - Phase 1 proceeds in CODE-ONLY / DEFER-VERIFICATION mode (no Docker, no live remote Supabase).
  - .env.local holds clearly-labeled placeholders until a DB exists; not committed (gitignored).
metrics:
  duration_min: 17
  tasks_completed: 3
  files_touched: 6
  completed: 2026-07-14
requirements: [AUTH-04]
---

# Phase 1 Plan 01: Auth + RLS Foundation (Supabase Stack) Summary

Converted the existing 11-table `schema.sql` into reproducible timestamped migrations, closed the two shared-table RLS write holes (`price_cache`, `news_items`) so writes are service-role-only, added RLS join-column indexes, initialized `supabase/config.toml` with email confirmations disabled, and scaffolded `.env.local` Supabase placeholders including a server-only `SUPABASE_SERVICE_ROLE_KEY`. Stack startup and live-DB verification are DEFERRED (no Docker / no live Supabase).

## What Was Actually Done (verified against the filesystem/CLI)

1. **Local Supabase config initialized** — `npx supabase init` generated `supabase/config.toml` and `supabase/.gitignore` without overwriting `schema.sql`. `enable_confirmations = false` is present under `[auth.email]` (this CLI version ships it as the default, satisfying the plan). No external OAuth enabled; `site_url` left at local default. Commit `a90506e`.
2. **Schema converted to migrations** — Two CLI-timestamped migrations created:
   - `20260714032952_initial_schema.sql` — full copy of the existing 11-table schema + triggers.
   - `20260714032957_rls_fixes.sql` — drops the two permissive `authenticated`-write policies and adds 5 join-column indexes.
   `schema.sql` retained and annotated as reference-only. Commit `4305b73`.
3. **RLS write holes closed (in migration code)** — `DROP POLICY IF EXISTS "Allow authenticated users to insert/update prices" ON public.price_cache;` and `DROP POLICY IF EXISTS "Allow authenticated users to insert news" ON public.news_items;`. SELECT-only read policies remain, so authenticated read access is preserved. Writes are now reserved for the service role (which bypasses RLS).
4. **RLS performance indexes added (in migration code)** — `idx_investment_accounts_user_id`, `idx_holdings_account_id`, `idx_watchlist_items_account_id`, `idx_alerts_account_id`, `idx_brokers_account_id`.
5. **Env scaffolding** — `.env.local` now has clearly-labeled `PLACEHOLDER_*` values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and a server-only `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix), with a comment marking them deferred-until-a-DB-exists. All four existing non-Supabase keys (YOUTUBE/GEMINI/OPENROUTER/HUGGINGFACE) preserved. `.env.local` is gitignored — **not committed** (no secrets in git).

## DEFERRED / Unverified (blocked on a real DB)

These were intentionally NOT executed per the coordinator's code-only decision. No values were fabricated.

- **Local Supabase stack start** — `npx supabase start` NOT run (no Docker installed; `docker` command not found).
- **Migration apply against a live DB** — the migrations are written but have **not** been applied/executed anywhere. Their SQL correctness is unverified against Postgres.
- **RLS enforcement behavior** — that an authenticated user is actually rejected on INSERT/UPDATE to `price_cache`/`news_items` is unverified; to be confirmed by the isolation test in plan 02 once a DB exists.
- **Real key capture** — no real `anon` / `service_role` keys captured; `.env.local` holds placeholders only.

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| Local Supabase stack starts and applies all migrations reproducibly | DEFERRED / blocked-on-DB (not verified) |
| An authenticated user can no longer INSERT/UPDATE rows in price_cache or news_items | Code written (policies dropped in migration); enforcement DEFERRED until DB exists |
| .env.local holds the local anon key and a server-only SUPABASE_SERVICE_ROLE_KEY | Partially — server-only key var present, but values are PLACEHOLDERs pending a DB |

## Deviations from Plan

### Environment-driven mode change

**1. [Coordinator decision] CODE-ONLY / DEFER-VERIFICATION mode**
- **Found during:** Task 3
- **Issue:** Docker is not installed (`docker` command not found), and the existing `.env.local` holds placeholder values only — no live remote Supabase exists. `npx supabase start` cannot run.
- **Resolution:** Per explicit coordinator decision, Task 3 completed as env-scaffolding only. No Docker/live-DB commands run; no keys fabricated. Stack start + migration apply + real-key capture deferred to when a DB exists.
- **Files modified:** `.env.local` (gitignored, not committed)

### Minor

**2. Task 1 required no config edit**
- `enable_confirmations = false` is the default under `[auth.email]` in supabase CLI v2.109.1, so the planned edit was a no-op; verification still passes.

## Authentication Gates

None (the Docker requirement was resolved by a coordinator decision to skip verification, not by an auth gate).

## Self-Check: PASSED

- All created files exist: config.toml, .gitignore, both migrations, SUMMARY.md.
- Both per-task commits exist in git history: `a90506e`, `4305b73`.
- `.env.local` scaffolding present and correctly gitignored (not committed).
- Honest status: migration apply against a live DB and stack start remain DEFERRED/unverified (no fabrication).
