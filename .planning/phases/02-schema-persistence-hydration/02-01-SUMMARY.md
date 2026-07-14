---
phase: 02-schema-persistence-hydration
plan: 01
subsystem: database
tags: [supabase, postgres, migrations, rls, instruments, transactions, watchlist]
mode: code-only / defer-verification

# Dependency graph
requires:
  - phase: 01-auth-rls-foundation
    provides: "supabase/migrations (initial_schema + rls_fixes), investment_accounts table, RLS pattern"
provides:
  - "public.instruments table (ISIN+exchange identity, read-only to authenticated users)"
  - "public.transactions table (BUY/SELL/SPLIT/BONUS ledger with price CHECK constraint)"
  - "public.watchlist_items re-keyed on instrument_id (FK, NOT NULL, unique per account)"
  - "public.holdings table dropped (legacy snapshot, superseded by ledger)"
  - "16 seeded instrument rows incl. NSE/NYSE dual listing (INFY)"
affects: [02-02-derive-holdings, 03-price-pipeline, 04-import-alerts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "instrument identity = (isin, exchange) UNIQUE constraint — same company on two exchanges is two distinct rows"
    - "holdings derived from transactions ledger in application code, never stored as a mutable snapshot"
    - "shared reference tables (instruments) follow price_cache/news_items pattern: authenticated SELECT-only, service-role writes"

key-files:
  created:
    - supabase/migrations/20260714160720_instruments_transactions.sql
    - supabase/migrations/20260714160803_watchlist_instrument_identity.sql
    - supabase/migrations/20260714160838_seed_instruments.sql
  modified: []

key-decisions:
  - "Continued CODE-ONLY / DEFER-VERIFICATION mode from Phase 1 (no Docker, no live Supabase) — all SQL authored and statically verified only."
  - "Migrations generated via `npx supabase migration new` (filesystem scaffold, no Docker) to get CLI-authentic timestamps rather than hand-picking them."

patterns-established:
  - "Ledger-derived state: transactions is the source of truth; no snapshot tables for anything derivable from it."

requirements-completed: [PORT-04, PORT-05, PORT-06]

# Metrics
duration: 12min
completed: 2026-07-14
---

# Phase 2 Plan 01: Instrument Master + Transactions Ledger Schema Summary

**Three new Postgres migrations adding an ISIN+exchange instrument master, a BUY/SELL/SPLIT/BONUS transactions ledger with RLS, and re-keying watchlist_items on instrument_id — all authored and statically verified, live-apply DEFERRED (no Docker/live Supabase in this environment).**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3 completed
- **Files modified:** 3 (all new migration files; zero edits to Phase 1 migrations)

## Accomplishments
- `public.instruments`: ISIN+exchange identity table, `UNIQUE(isin, exchange)`, RLS enabled, authenticated-SELECT-only policy (writes reserved for service role, matching the `price_cache`/`news_items` pattern from Phase 1).
- `public.transactions`: BUY/SELL/SPLIT/BONUS ledger with a CHECK constraint enforcing price is required for BUY/SELL and NULL for SPLIT/BONUS; full CRUD RLS scoped through `investment_accounts.user_id`.
- `public.watchlist_items` re-keyed: added NOT NULL `instrument_id` FK, dropped free-text `symbol`/`name` columns, replaced the old `(account_id, symbol)` unique constraint with `(account_id, instrument_id)`.
- `public.holdings` (Phase 1 snapshot table) dropped — holdings will be derived from `transactions` in plan 02-02's `derive-holdings.ts`.
- 16 instrument rows seeded (10 NSE, 1 BSE, 4 NASDAQ, 1 NYSE) including the roadmap-mandated dual listing: INFY on NSE (`INE009A01021`, INR) vs INFY ADR on NYSE (`US4567881085`, USD) as two distinct rows.

## Task Commits

Each task was committed atomically:

1. **Task 1: instruments + transactions migration** - `fc0c582` (feat)
2. **Task 2: watchlist instrument identity + drop legacy holdings** - `fa1b686` (feat)
3. **Task 3: seed instruments + static verification pass** - `73ad28b` (feat)

_Plan metadata commit follows this summary._

## Files Created/Modified
- `supabase/migrations/20260714160720_instruments_transactions.sql` - instruments + transactions tables, RLS, indexes
- `supabase/migrations/20260714160803_watchlist_instrument_identity.sql` - watchlist_items re-key, holdings drop
- `supabase/migrations/20260714160838_seed_instruments.sql` - 16 seeded instrument rows incl. NSE/NYSE dual listing

## Decisions Made
- Kept CODE-ONLY / DEFER-VERIFICATION mode (established in Phase 1) since this environment still has no Docker and no live Supabase project — nothing was fabricated as "passing" against a real DB.
- Used the Supabase CLI's filesystem-only `migration new` scaffold (no Docker required) for all three files, preserving CLI-authentic timestamps rather than hand-picking them, matching the pattern documented in 01-01-SUMMARY.md.

## Deviations from Plan

None - plan executed exactly as written. All three migrations match the plan's specified SQL verbatim; all task-level `<verify>` commands were run and passed as specified.

## Issues Encountered

None.

## Done (authored, static-verified)

- [x] `supabase/migrations/20260714160720_instruments_transactions.sql` — `grep -c "ENABLE ROW LEVEL SECURITY"` = 2, `grep -c "CREATE POLICY"` = 5. Balanced statements confirmed by eye (15 semicolons, all matched CREATE/ALTER statements).
- [x] `supabase/migrations/20260714160803_watchlist_instrument_identity.sql` — `DROP TABLE IF EXISTS public.holdings` present; `grep -c "instrument_id"` = 5 (>= 3 required).
- [x] `supabase/migrations/20260714160838_seed_instruments.sql` — 1 `INSERT INTO public.instruments` statement; `'NYSE'` row present (dual listing proof).
- [x] `git diff --stat` on both Phase 1 migration files (`20260714032952_initial_schema.sql`, `20260714032957_rls_fixes.sql`) returns empty — byte-for-byte unchanged.
- [x] `ls supabase/migrations/` shows exactly 5 files (2 Phase 1 + 3 new Phase 2), all CLI-timestamped.
- [x] FK ordering reviewed by eye: `instruments` created before `transactions` (same file); `watchlist_items.instrument_id` FK references `instruments` created in an earlier-timestamped migration; seed INSERT runs after `instruments` exists (later-timestamped migration).

## Deferred/unverified (needs live DB)

This project has no Docker and no live/hosted Supabase project (carried forward from Phase 1's CODE-ONLY / DEFER-VERIFICATION decision, see `.planning/STATE.md`). The following are explicitly **not** verified and **not** fabricated as passing:

- Applying all 5 migrations (2 Phase 1 + 3 new) against a real Postgres instance in order, confirming no syntax or FK-ordering errors at apply time.
- Confirming RLS actually rejects cross-account reads/writes on `transactions` and `watchlist_items` for a second authenticated user (extend `scripts/rls-isolation-test.ts` in a later plan, or re-run once a DB exists).
- Confirming the 16 seed rows insert cleanly and the `(isin, exchange)` UNIQUE constraint holds against real data (e.g. that the `ON CONFLICT (isin, exchange) DO NOTHING` clause behaves as intended on re-run).
- Confirming `ALTER TABLE ... ALTER COLUMN instrument_id SET NOT NULL` succeeds (only guaranteed safe because the table is empty in this environment — never verified against an actual empty/non-empty table).

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| Every instrument resolves to exactly one row keyed by (isin, exchange); NSE vs NYSE INFY are distinct rows | Code written and seeded (2 INFY rows, different ISIN/currency/price_source_symbol); UNIQUE constraint enforcement DEFERRED (no live DB) |
| Holdings have no snapshot table to go stale — Phase 1 `holdings` is gone | Done — `DROP TABLE IF EXISTS public.holdings` authored; drop DEFERRED until applied to a live DB |
| A SPLIT/BONUS row (price NULL) can coexist with BUY/SELL (price required) without violating a CHECK constraint | CHECK constraint authored (`price_required_for_buy_sell`); enforcement DEFERRED (no live DB) |
| A second user's transactions/watchlist rows are invisible/unwritable to a different authenticated user (RLS) | RLS policies authored matching Phase 1 pattern; enforcement DEFERRED until `scripts/rls-isolation-test.ts` re-run against a live DB |

## User Setup Required

None - no external service configuration required. (Applying these migrations to a live Supabase project remains DEFERRED per the environment's CODE-ONLY mode, same as Phase 1.)

## Next Phase Readiness

- Schema for plan 02-02 (`derive-holdings.ts`) is in place: `transactions` ledger with `instrument_id` FK is ready to be queried and reduced into a holdings view in application code.
- `watchlist_items.instrument_id` is ready for plan 02-02/02-03 UI work to resolve watchlist entries against real instrument identity instead of free-text symbols.
- Blocker carried forward (not new to this plan): the same live-DB verification debt from Phase 1 (`npx supabase start`, apply migrations, capture real keys, run `scripts/rls-isolation-test.ts`) now also covers these 3 new migrations. Nothing in Phase 2 can be runtime-verified until that is cleared.

---
*Phase: 02-schema-persistence-hydration*
*Completed: 2026-07-14*

## Self-Check: PASSED

- All created files exist: `20260714160720_instruments_transactions.sql`, `20260714160803_watchlist_instrument_identity.sql`, `20260714160838_seed_instruments.sql`, `02-01-SUMMARY.md`.
- All three per-task commits exist in git history: `fc0c582`, `fa1b686`, `73ad28b`.
- Phase 1 migrations confirmed byte-for-byte unchanged (`git diff --stat` empty).
- Honest status: live-DB apply, RLS enforcement, and seed-insert behavior remain DEFERRED/unverified (no fabrication).
