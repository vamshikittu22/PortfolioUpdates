---
phase: 04-csv-import
plan: 04
subsystem: api
tags: [server-actions, supabase, rls, next.js, csv-import]

# Dependency graph
requires:
  - phase: 04-csv-import (plan 01)
    provides: import_batches/symbol_mappings schema, transactions.import_batch_id/import_row_hash + partial idempotency index, find_or_create_instrument SECURITY DEFINER RPC (authored, not yet live-applied)
  - phase: 04-csv-import (plan 03)
    provides: pure src/lib/import/{parse-groww,parse-robinhood,match-instruments,detect-duplicates}.ts pipeline
provides:
  - "previewImport(formData) Server Action — parses the uploaded file server-side, matches instruments, detects duplicates, returns a full classified ImportPreview, writes nothing"
  - "commitImport(formData) Server Action — re-parses the same file, resolves user mapping/create choices via the find_or_create_instrument RPC, writes atomically (batch insert -> single bulk transactions insert -> compensating delete on failure), persists resolved mappings, revalidates pages"
  - "next.config.ts Server Action body-size limit raised to 4mb"
affects: [04-05 (import preview/commit UI), 04-06, 04-07 (live-verification checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action file-upload trust boundary: both actions re-derive bytes/hash from the File itself via a shared deriveFileBytes() helper — never trust client-parsed JSON"
    - "Single-query duplicate-input loading (loadDuplicateInputs) — one transactions SELECT derives existingHashes + existingManualTxns + alreadyHeldInstrumentIds, no N+1"
    - "Compensating delete on partial-commit failure (insert import_batches row -> bulk insert transactions -> delete batch row if insert fails)"
    - "SECURITY DEFINER RPC as the sole controlled write path into a closed reference table (find_or_create_instrument), called only via the cookie-bound client, never the admin client"

key-files:
  created:
    - src/server-actions/import.ts
  modified:
    - next.config.ts

key-decisions:
  - "commitImport computes import_row_hash via computeRowHashes over only the final imported subset (not the full eligible set) per the plan's literal instruction — this means a user-forced re-import of already-committed duplicates reproduces the SAME hashes and collides with the partial unique index, which is the intended backstop behavior (surfaced as a hard insert error + compensating delete, not silently absorbed)."
  - "import_batches.duplicate_count/skipped_count are computed independent of the user's importDuplicates choice (skippedCount = total - validCount - duplicateCount, using post-rematch status counts) so the audit trail reports what was DETECTED, while imported_count reports what was actually WRITTEN — these can diverge (e.g. duplicates detected=3, imported=3 if the user chose to force-import them)."
  - "commitImport re-loads saved symbol_mappings from the DB and layers the user's choice-resolved mappings on top (choices first, so matchInstruments' .find() picks them) rather than relying solely on the choices payload — keeps commit's matching decision consistent with what preview would show on a fresh re-preview."
  - "Robinhood row notes are derived from the CSV's raw 'Description' column (e.g. 'Apple Inc'); Groww row notes reuse the snapshot marker parse-groww.ts already writes into rawFields.notes — no new normalization logic needed in this file."

requirements-completed: [IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05]

# Metrics
duration: 15min
completed: 2026-07-15
---

# Phase 4 Plan 4: Import Server Actions Summary

**previewImport (read-only classified preview) and commitImport (atomic, idempotent, mapping/creation-aware write) as thin orchestrators over the pure src/lib/import/* pipeline, cookie-bound and admin-client-free, with the Server Action body-size limit raised to 4mb.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-15
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `src/server-actions/import.ts` created: `previewImport` re-derives file bytes/hash server-side, detects/accepts an override broker, parses via the pure lib, loads the instrument universe + saved mappings + existing-transaction dedup inputs (all read-only, no N+1), and returns a full classified `ImportPreview` — zero writes.
- `commitImport` re-parses the same file, resolves the user's per-symbol mapping/create choices (instrument creation ONLY via the `find_or_create_instrument` SECURITY DEFINER RPC), re-runs matching + duplicate detection so it agrees deterministically with preview, then writes atomically: insert `import_batches` row → single bulk `transactions.insert()` (each row carrying `import_batch_id` + `import_row_hash`) → compensating batch delete on insert failure → non-fatal `symbol_mappings` upsert → `revalidatePath('/')` / `revalidatePath('/holdings')`.
- `next.config.ts` raises `experimental.serverActions.bodySizeLimit` to `'4mb'` so a multi-year broker export doesn't fail with an opaque 1MB body error at preview OR commit time, preserving the existing `devIndicators: false`.
- Neither action imports `@/utils/supabase/admin` — both are cookie-bound via a `requireAuthedContext` helper copied verbatim from `src/server-actions/portfolio.ts`'s pattern.

## Task Commits

Each task was committed atomically:

1. **Task 1: Raise Server Action body-size limit** - `79e3ae4` (chore)
2. **Task 2: previewImport Server Action (parse + classify, zero writes)** - `37e65ed` (feat)
3. **Task 3: commitImport Server Action (atomic, idempotent write with mapping/creation)** - `c39c74b` (feat)

_No TDD tasks in this plan — all `type="auto"`._

## Files Created/Modified
- `src/server-actions/import.ts` - `previewImport`/`commitImport` Server Actions plus shared helpers (`requireAuthedContext`, `deriveFileBytes`, `resolveBroker`, `parseByBroker`, `loadInstrumentUniverse`, `loadSavedMappings`, `loadDuplicateInputs`, `buildNotes`)
- `next.config.ts` - `experimental.serverActions.bodySizeLimit: '4mb'` added, `devIndicators: false` preserved

## Decisions Made
- See `key-decisions` in frontmatter — most notably: import_row_hash is computed over only the final imported subset (matches the plan's literal Task 3 Step 4 instruction), which means a user-forced re-import of exact duplicates will collide with the DB's partial unique index rather than silently succeeding a second time — this is the intended idempotency backstop, not a bug.

## Deviations from Plan

None — plan executed exactly as written. One transient false alarm during Task 1 verification: an initial `npx tsc --noEmit` run surfaced stale `.next/dev/types` / `.next/types` route-validator errors unrelated to `next.config.ts`; a second run (after the TypeScript incremental build cache settled) was clean with no code changes needed. Confirmed via `git stash` that these errors were not caused by the `next.config.ts` edit (baseline without the edit was already clean on the first try) — not logged as a deviation since no fix was applied, and not logged to deferred-items.md since it self-resolved and produced zero actual errors in the final state.

## Issues Encountered
None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/server-actions/import.ts` exposes both Server Actions the 04-05 (preview UI) and 04-06 (commit/mapping UI) plans need to call directly.
- Live behavior (actual DB writes, the compensating delete firing on a forced failure, the partial unique index rejecting a duplicate re-commit, `find_or_create_instrument` creating an instrument for an authenticated caller) remains explicitly DEFERRED to 04-07 — the 04-01 migration (`supabase/migrations/20260715230011_csv_import.sql`) is authored and statically verified but not yet pushed to the live hosted DB.
- No blockers for 04-05/04-06 — both Server Actions are code-complete, `npx tsc --noEmit` is clean, and every plan-specified grep check passes.

---
*Phase: 04-csv-import*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: src/server-actions/import.ts
- FOUND: next.config.ts
- FOUND: .planning/phases/04-csv-import/04-04-SUMMARY.md
- FOUND: commit 79e3ae4 (Task 1)
- FOUND: commit 37e65ed (Task 2)
- FOUND: commit c39c74b (Task 3)
