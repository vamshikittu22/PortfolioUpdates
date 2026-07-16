---
phase: 04-csv-import
plan: 06
subsystem: ui
tags: [nextjs, react, server-actions, csv-import, xlsx]

# Dependency graph
requires:
  - phase: 04-csv-import (04-04)
    provides: previewImport/commitImport Server Actions
  - phase: 04-csv-import (04-05)
    provides: ImportDropzone, PreviewTable, SymbolMappingSection, ImportSummary leaf components
provides:
  - Auth-guarded /import route
  - ImportPage client container wiring the full progressive import flow to the Server Actions
  - Discoverable Import entry point on the Holdings page
affects: [04-07 (end-to-end functional verification / live-verify checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Progressive single-page state machine (idle -> previewing -> preview -> committing -> done) instead of a multi-step wizard, matching the locked 04-CONTEXT decision"
    - "Container/leaf composition: ImportPage owns all state and Server Action calls; the four 04-05 components stay pure presentational props/callbacks"
    - "Same File object re-sent to both previewImport and commitImport so the server re-parses identically both times — no client-parsed row data ever crosses the trust boundary"

key-files:
  created:
    - src/app/(dashboard)/import/page.tsx
    - src/components/import/ImportPage.tsx
  modified:
    - src/app/(dashboard)/holdings/page.tsx

key-decisions:
  - "Commit gating computed as preview.unmatchedSymbols minus choices.mappings — every unmatched symbol must be resolved (mapped or created) before commit enables, since none of the leaf components offer a per-symbol skip"
  - "Manual broker-override retry (Groww/Robinhood buttons) implemented for the previewImport 'could not detect broker' failure path, re-calling previewImport with an explicit broker field on the same File"
  - "Dropzone hidden once phase reaches 'done' — ImportSummary's 'Import another file' button calls reset() to return to idle, at which point the dropzone reappears; avoids showing an active dropzone next to a completed result"

patterns-established:
  - "Import route auth guard mirrors holdings/page.tsx exactly (createClient -> auth.getUser -> return null), keeping the auth-guard idiom consistent across all dashboard routes"

requirements-completed: [IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05]

# Metrics
duration: 25min
completed: 2026-07-16
---

# Phase 04 Plan 06: Import Page Assembly Summary

**Wires the four 04-05 leaf components into a single progressive `/import` page: auth-guarded Server Component shell, an `ImportPage` client container owning the idle->previewing->preview->committing->done state machine, and a discoverable "Import" link in the Holdings header.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-16T05:05:00Z
- **Completed:** 2026-07-16T05:30:00Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 edited)

## Accomplishments
- `/import` is now a real, auth-guarded route rendering a titled shell + the client container
- `ImportPage` is the sole place the import UI touches `previewImport`/`commitImport` — both calls re-send the same `File`, and commit additionally sends `JSON.stringify(choices)`, honoring the "server re-parses, client never supplies row data" trust boundary from 04-04
- Commit is provably gated: disabled while any symbol in `preview.unmatchedSymbols` lacks a corresponding entry in `choices.mappings`, so nothing importable is silently dropped
- Result screen replaces the preview area in place on success (no `router.push`, no auto-redirect) — matches the locked single-progressive-page + result-summary decisions
- Holdings header now has a discoverable "Import" link next to "Refresh now" / "Add Asset", with zero unrelated diff to the rest of the file

## Task Commits

Each task was committed atomically:

1. **Task 1: /import Server Component shell (auth-guarded)** - `31f9f92` (feat)
2. **Task 2: ImportPage client container (progressive state machine)** - `f025ce1` (feat)
3. **Task 3: Import entry point in the Holdings header** - `d21a675` (feat)

_Note: no TDD tasks in this plan — all three are `type="auto"`._

## Files Created/Modified
- `src/app/(dashboard)/import/page.tsx` - Auth-guarded Server Component; renders a glass-card header (Upload icon, title, subtitle) and `<ImportPage />`
- `src/components/import/ImportPage.tsx` - `'use client'` container: state machine, `previewImport`/`commitImport` orchestration, broker-override retry, `growwIsinBySymbol` derivation for `SymbolMappingSection`, commit-gating logic, composition of all four 04-05 leaf components
- `src/app/(dashboard)/holdings/page.tsx` - Added `Link`/`Upload` import and one `<Link href="/import">` button in the header actions cluster; no other change

## Decisions Made
- Commit-gate logic treats "unresolved" strictly as `preview.unmatchedSymbols` not present in `choices.mappings` — there's no partial "skip this unmatched symbol" affordance in `SymbolMappingSection`, so full resolution is required by construction, matching the IMPT-04 "nothing silently dropped" guarantee.
- `growwIsinBySymbol` is derived via `useMemo` from `preview.rows` (unmatched rows carrying a non-null Groww ISIN), never fabricated for Robinhood — consistent with 04-05's ISIN honesty policy in `SymbolMappingSection`.
- The optional manual broker-override UI (plan Task 2, "Optionally expose...") was implemented: on a "could not detect broker" `previewError`, two small buttons re-call `previewImport` with an explicit `broker` field using the same stored `File`.

## Deviations from Plan

None - plan executed exactly as written. All three tasks match their `must_haves`/`key_links`/verify blocks; no Rule 1-4 triggers encountered.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Static verification complete: `npx tsc --noEmit` clean, `npm run build` succeeds and lists `/import` as a dynamic route (`ƒ /import`), and `git diff` on `holdings/page.tsx` confirmed the change is scoped to only the header addition.
- Functional/E2E verification (click-through: select file -> preview -> resolve symbols -> commit -> summary -> Holdings shows imported holdings with live P&L -> idempotent re-import) remains explicitly DEFERRED to 04-07's checkpoint, per this plan's own `<verification>` block — no live DB/migration apply has occurred in this plan.
- This closes out Phase 4's UI-assembly scope; 04-07 is the final plan in the phase (live migration apply + end-to-end human-verify checkpoint).

---
*Phase: 04-csv-import*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created files confirmed on disk (`src/app/(dashboard)/import/page.tsx`, `src/components/import/ImportPage.tsx`, `src/app/(dashboard)/holdings/page.tsx`); all three task commits confirmed in `git log` (`31f9f92`, `f025ce1`, `d21a675`).
