---
phase: 04-csv-import
plan: 01
subsystem: database
tags: [supabase, postgres, rls, security-definer, migration, idempotency]

# Dependency graph
requires:
  - phase: 02-portfolio-schema
    provides: investment_accounts/instruments/transactions tables, ISIN+exchange instrument identity, account-ownership RLS EXISTS-subquery pattern
  - phase: 03-price-pipeline
    provides: price_fx_schema (sorts earlier by timestamp; no direct coupling but confirms migration ordering assumption)
provides:
  - import_batches table (audit trail + idempotency anchor per committed import, account-ownership RLS)
  - symbol_mappings table (persisted broker-symbol -> instrument resolutions, account-ownership RLS)
  - transactions.import_batch_id / import_row_hash provenance columns
  - partial UNIQUE index (account_id, import_row_hash) WHERE import_row_hash IS NOT NULL — DB-level idempotent-reimport backstop
  - find_or_create_instrument SECURITY DEFINER RPC — the sole controlled write path into the closed instruments table, authenticated-only
  - extended scripts/rls-isolation-test.ts covering two-user isolation for import_batches + symbol_mappings
affects: [04-02, 04-03, 04-04, 04-05, 04-06, 04-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPC as the controlled-write escape hatch into a closed/service-role-only table, instead of opening a permissive RLS policy or reaching for the admin client"
    - "Partial UNIQUE index (WHERE col IS NOT NULL) as an idempotency backstop that is scoped only to rows that opt in (imported rows), leaving manual rows completely unaffected"

key-files:
  created:
    - supabase/migrations/20260715230011_csv_import.sql
  modified:
    - scripts/rls-isolation-test.ts

key-decisions:
  - "One new migration file only (npx supabase migration new csv_import scaffolded the timestamp; no hand-picked timestamp, no edits to any existing migration)."
  - "file_hash on import_batches is deliberately NOT unique — idempotency enforcement lives at the row level (partial unique index on transactions), not the file level; a unique file hash would break the orphan-batch compensation edge case."
  - "find_or_create_instrument is idempotent via ON CONFLICT (isin, exchange) DO NOTHING with a re-read fallback for the concurrent-insert race, and validates ISIN/exchange/currency against the exact same CHECK domains the instruments table itself enforces before ever writing."
  - "Live migration apply and live RLS test run are explicitly DEFERRED to plan 04-07 (no Docker/local Supabase; hosted DB exists but pushing schema changes needs explicit user consent per project convention) — never fabricated as passing."

patterns-established:
  - "Any future 'controlled privileged write into an otherwise-closed table' need should follow the find_or_create_instrument shape: SECURITY DEFINER + SET search_path = public + REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated + input validation mirroring the target table's own CHECK constraints."

requirements-completed: [IMPT-04, IMPT-05]

# Metrics
duration: 12min
completed: 2026-07-15
---

# Phase 4 Plan 1: CSV Import Storage Foundation Summary

**One new migration (import_batches + symbol_mappings tables, transactions provenance columns, partial idempotency index, find_or_create_instrument SECURITY DEFINER RPC) plus an extended two-user RLS isolation test — schema and privileged-write foundation for CSV import, statically verified, live apply deferred to 04-07.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `import_batches` and `symbol_mappings` tables created with account-ownership RLS (identical EXISTS-subquery shape to `transactions`) — the audit trail and re-import-mapping-memory backbone for IMPT-05.
- `transactions.import_batch_id` / `import_row_hash` provenance columns added, backed by a partial UNIQUE index `(account_id, import_row_hash) WHERE import_row_hash IS NOT NULL` — the DB-level idempotency backstop that leaves manual (non-imported) transactions completely untouched.
- `find_or_create_instrument` SECURITY DEFINER RPC — validated, idempotent, authenticated-only controlled write path into the closed `instruments` table (no admin client, no permissive INSERT policy opened) for IMPT-04.
- `scripts/rls-isolation-test.ts` extended with two new checks (5 & 6) proving the same two-user isolation guarantee for `import_batches` and `symbol_mappings` that already existed for `transactions` — owner can write, a second user can neither read nor write.

## Task Commits

Each task was committed atomically:

1. **Task 1: import_batches + symbol_mappings tables, transactions provenance columns, idempotency index** - `2d2321a` (feat)
2. **Task 2: find_or_create_instrument SECURITY DEFINER RPC** - `5d27e40` (feat)
3. **Task 3: extend the two-user RLS isolation test to import_batches + symbol_mappings** - `e192909` (test)

**Plan metadata:** (this commit, following SUMMARY/STATE/ROADMAP updates)

## Files Created/Modified

- `supabase/migrations/20260715230011_csv_import.sql` - New migration: import_batches, symbol_mappings, transactions provenance columns + partial unique index, find_or_create_instrument SECURITY DEFINER RPC
- `scripts/rls-isolation-test.ts` - Extended with two-user isolation checks 5 & 6 for import_batches/symbol_mappings (owner-write succeeds, cross-user read/write rejected)

## Decisions Made

- `file_hash` on `import_batches` is NOT unique — enforcement lives at the row level (the partial unique index on `transactions`), matching the plan's explicit rationale (avoids breaking the orphan-batch compensation edge case; a unique file hash would add nothing the row constraint doesn't already guarantee).
- `find_or_create_instrument` derives `price_source_symbol` by the exact seed-data/Phase-3 convention (`NSE→.NS`, `BSE→.BO`, US exchanges→bare symbol) and validates ISIN/exchange/currency against the same CHECK domains as the `instruments` table before any write — fail loudly, never fabricate.
- Live migration apply (`npx supabase db push`) and live `npm run test:rls` run remain explicitly DEFERRED to plan 04-07, consistent with the project's no-Docker / hosted-DB-needs-consent convention documented in STATE.md.

## Deviations from Plan

None — plan executed exactly as written. One minor note: the plan's Task 2 verify step expected `grep -c "SECURITY DEFINER" ... → 1`, but the actual count is 2 because the plan's own supplied inline comment text ("A SECURITY DEFINER function is the standard Supabase pattern...") also contains the literal string, in addition to the real `SECURITY DEFINER` keyword on the function definition. This is an artifact of the plan's own verbatim SQL/comment text, not a code defect — eyeball confirms exactly one function is actually defined as SECURITY DEFINER, with correct `SET search_path = public` hardening, matching REVOKE/GRANT pair, and no permissive `instruments` INSERT policy anywhere in the file.

## Issues Encountered

None. `npx tsc --noEmit` passed clean on first run after the Task 3 edit. `npm run test:rls` was run as the plan's own verify step 4 anticipates — it correctly fails, but for a slightly more precise reason than the plan's generic wording ("script exits with a clear message when .env.local lacks real credentials"): this project actually has real hosted Supabase credentials in `.env.local` (per STATE.md), so the script ran the real request path and failed with `Could not find the table 'public.import_batches' in the schema cache` — the honest, expected failure mode since this migration has not been pushed to the live DB yet. This is the correct DEFERRED state, not a credentials problem, and requires no fix; it will resolve when 04-07 applies the migration with explicit user consent.

## User Setup Required

None — no external service configuration required. (Live migration apply in 04-07 will require the user's explicit consent to push against the hosted Supabase project, per existing project convention; no new setup beyond that.)

## Next Phase Readiness

- Schema and the single privileged write path (`find_or_create_instrument`) are locked in and statically verified — subsequent CSV-import plans (parser, Server Actions, UI in 04-02 onward) can now build against a stable, reviewed shape.
- `scripts/rls-isolation-test.ts` is ready to prove import_batches/symbol_mappings isolation live the moment the migration is applied — no further test authoring needed for these two tables.
- Blocker carried forward (not introduced by this plan): the migration is authored but NOT yet applied to the live hosted DB; `find_or_create_instrument` cannot be exercised live, and `npm run test:rls` cannot pass, until 04-07's live-apply checkpoint. IMPT-04 and IMPT-05 requirements are marked complete here in the code-complete sense (schema/RPC authored and statically verified); live-behavior confirmation is 04-07's scope, matching the same code-complete/live-verify-deferred pattern used throughout Phases 2 and 3.

---
*Phase: 04-csv-import*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260715230011_csv_import.sql
- FOUND: scripts/rls-isolation-test.ts
- FOUND: .planning/phases/04-csv-import/04-01-SUMMARY.md
- FOUND commit: 2d2321a
- FOUND commit: 5d27e40
- FOUND commit: e192909
