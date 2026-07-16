---
phase: 04-csv-import
plan: 07
subsystem: import
tags: [checkpoint, human-verify, deferred, live-db, groww, robinhood]
mode: DEFERRED — checkpoint reached, user deferred (no real broker files yet; no migration-push consent yet)

requires:
  - phase: 04-01
    provides: csv_import migration (import_batches, symbol_mappings, provenance columns, partial unique index, find_or_create_instrument RPC) — authored, NOT pushed
  - phase: 04-03
    provides: Groww/Robinhood parsers + instrument matching + duplicate detection, proven against synthetic fixtures only
  - phase: 04-06
    provides: /import progressive page wired to previewImport/commitImport
provides:
  - (nothing — verify-only plan; checkpoint reached and honestly deferred, not executed)

key-decisions:
  - "DEFERRED, not fabricated. The blocking human-verify checkpoint was reached and presented (2026-07-16); the user responded 'defer': they have no real Groww XLSX or Robinhood CSV export files yet (will upload later), and consent to push the 04-01 migration to the live DB was not given (no supabase login/link performed). Matches the Phase 1/2/3 deferral precedent (see 03-06-SUMMARY.md)."

requirements-completed: []  # IMPT-01..05 remain in their prior code-complete/static-verified state; live-behavior confirmation is what this plan defers

duration: ~10min (pre-checkpoint honest-state checks only; live verification not executed)
completed: n/a (deferred)
---

# Phase 4 Plan 07: Live Import Verification Checkpoint — DEFERRED

**The phase-closing human-verify checkpoint was reached and honestly deferred: the user has no real Groww/Robinhood export files yet and did not consent to pushing the csv_import migration, so the 8-step live E2E could not run — nothing was fabricated, and the environment's true state was re-proven before stopping.**

## What actually happened

This plan's single task is a blocking `checkpoint:human-verify`. Execution reached the checkpoint, presented it, and the user responded **"defer"**. Per the plan's own contract ("never a fabricated pass — record the whole checkpoint DEFERRED"), this SUMMARY records the deferral.

## Honestly verified NOW (no live DB, no real files — all re-run 2026-07-16)

| Check | Result | Meaning |
| ----- | ------ | ------- |
| `npx tsc --noEmit` | clean | Whole import feature still typechecks after 04-06 |
| `npm run test:import-parse` | PASS | Both parsers, matching, dedup correct against SYNTHETIC fixtures (`scripts/fixtures/groww-holdings-sample.xlsx`, `robinhood-activity-sample.csv`) |
| `npm run test:rls` | honest FAIL — `Could not find the table 'public.import_batches' in the schema cache` | Confirms the 04-01 migration is genuinely unapplied on the live DB; not a masked skip |
| `npx supabase migration list` | `LegacyProjectNotLinkedError` | Project not linked — no accidental live-DB linkage exists |
| `npx supabase projects list` | `LegacyPlatformAuthRequiredError` | CLI not authenticated — no `supabase login` was run (consent-gated) |
| `scripts/fixtures/` contents | synthetic fixtures only | No real broker files exist in the environment; none were fabricated |

No live-DB writes occurred. No files were written by this plan other than this SUMMARY.

## Deferred items (the entire live checkpoint)

1. **Real-file parser validation** — user's real Groww holdings-statement `.xlsx` and real Robinhood activity-report `.csv` run through the parsers (the LOW-confidence Groww layout from 04-RESEARCH Open Question 1 confirmed, or the loud `ImportParseError` pinpointing what differs).
2. **`supabase login` + `supabase link --project-ref ozkorwkhtamyaavuphhm`** — CLI auth gate, requires the user's browser.
3. **`supabase db push` of `20260715230011_csv_import.sql`** — live schema change, requires explicit user consent (NOT given). Until pushed: `import_batches`, `symbol_mappings`, `transactions.import_batch_id`/`import_row_hash`, the partial unique idempotency index, and `find_or_create_instrument` do not exist live.
4. **`npm run test:rls` green** — the two-user isolation checks for import_batches/symbol_mappings can only pass post-push.
5. **The 8-step live E2E** (plan Task 1 how-to-verify): real-file parse → migration apply → RLS green → preview gates commit (IMPT-03) → mapping-not-dropping incl. real-ISIN instrument creation (IMPT-04) → commit + live P&L via the summary's Holdings link (IMPT-01/02, success criterion 4) → idempotent re-import adds ZERO transactions (IMPT-05) → loud honest failure on a malformed file.

## Resume path

When the user has the real export files and grants migration-push consent:

- Re-run `/gsd:execute-phase 4` (or execute `04-07-PLAN.md` directly). The plan is unchanged and remains the single source of truth for the 8 steps.
- Drop the real files into `scripts/fixtures/` (personal exports can stay uncommitted; a sanitized copy may be committed).
- Sequence: `supabase login` → `supabase link --project-ref ozkorwkhtamyaavuphhm` → `supabase db push` (NOTE: `20260714220438_price_refresh_cron.sql` is ALSO pending and deliberately held back until deployment — push selectively or be aware it will apply too; see STATE.md STILL OPEN item 1) → `npm run test:rls` → 8-step browser E2E.

## Requirements status (deliberately NOT upgraded)

| Requirement | Status | Why |
| ----------- | ------ | --- |
| IMPT-01/02 (Groww/Robinhood import) | Code-complete/static-verified | Real-file + live-commit behavior unproven |
| IMPT-03 (preview gates commit) | Code-complete/static-verified | Browser flow + zero-writes-before-commit unproven live |
| IMPT-04 (map, don't drop) | Code-complete/static-verified | Live `find_or_create_instrument` RPC call unproven |
| IMPT-05 (idempotent re-import) | Code-complete/static-verified | Partial unique index behavior unproven live |

Phase 4 is NOT claimed live-verified. All 7 plans are closed (6 executed + this checkpoint deferred); the live-verification debt carries in STATE.md's STILL OPEN list.

---
*Phase: 04-csv-import*
*Status: DEFERRED — checkpoint reached 2026-07-16, user deferred (no broker files yet, no migration consent)*
