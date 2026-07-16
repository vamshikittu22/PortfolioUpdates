---
phase: 04-csv-import
plan: 05
subsystem: ui
tags: [react, nextjs, client-components, tailwind, lucide-react, import-preview]

# Dependency graph
requires:
  - phase: 04-csv-import
    provides: "previewImport/commitImport Server Actions (04-04) and ImportPreview/PreviewRow/RowStatus/CommitChoices types (04-02's src/lib/import/types.ts) that these components' props are typed against"
provides:
  - "ImportDropzone.tsx — drag-drop/click file input for .xlsx/.csv with a 4MB client-side size guard, pure view (no Server Action calls)"
  - "PreviewTable.tsx — compact expandable preview rows, per-category chips, and the bulk-only (no per-row) category toggle bound to CommitChoices"
  - "SymbolMappingSection.tsx — one entry per unique unmatched broker symbol, resolved via reused searchInstrumentsAction search or a create-new-instrument form with an honest (never-fabricated) ISIN policy"
  - "ImportSummary.tsx — audit-trail result screen (imported/skipped/duplicate counts), Holdings link with no auto-redirect, and a one-time fire-and-forget refreshPricesNow() call"
affects: ["04-06 (import page container/state machine)", "04-07 (live human-verify checkpoint)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leaf client components take only typed props/callbacks and hold local view state — no Server Action calls of their own except ImportSummary's fire-and-forget refreshPricesNow (04-RESEARCH Pattern 5)"
    - "Bulk-only category-level import controls (IMPT-03 locked decision) — row expansion is view state, never a selection input"
    - "Instrument search UI (debounced searchInstrumentsAction, 250ms) reused verbatim from HoldingFormDialog rather than rebuilt"

key-files:
  created:
    - src/components/import/ImportDropzone.tsx
    - src/components/import/ImportSummary.tsx
    - src/components/import/PreviewTable.tsx
    - src/components/import/SymbolMappingSection.tsx
  modified: []

key-decisions:
  - "unsupported rows get no bulk-toggle in PreviewTable — verified against src/server-actions/import.ts that commitImport never reads choices.importUnsupported and unsupported rows are unconditionally excluded from finalRows, so a toggle would be a working-looking control that does nothing"
  - "Row expansion in PreviewTable uses local useState<Set<number>> keyed by rowIndex — explicitly documented as view-only state, never an import selection, to keep the bulk-only IMPT-03 decision unambiguous"
  - "SymbolMappingSection's create-new form validates ISIN shape client-side (^[A-Z]{2}[A-Z0-9]{9}[0-9]$) before enabling submit; this is a UX pre-check only — the find_or_create_instrument RPC (04-01/04-04) still validates server-side"

patterns-established:
  - "Category chip + bulk toggle palette reuses StalenessBadge's success/warning/danger/muted tone convention rather than introducing new color semantics"

requirements-completed: [IMPT-03, IMPT-04]

# Metrics
duration: 15min
completed: 2026-07-16
---

# Phase 04 Plan 05: Import Preview UI Leaf Components Summary

**Four presentational client components (dropzone, compact-expandable preview table with bulk-only category toggles, unmatched-symbol resolver, and audit-trail result summary) implementing every locked Phase 4 UX decision, ready for 04-06 to wire into a page-level state machine.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-16T04:56:00Z
- **Completed:** 2026-07-16T05:11:30Z
- **Tasks:** 3
- **Files modified:** 4 (all newly created)

## Accomplishments

- Verified and adopted four already-drafted components from a prior uncommitted session, cross-checking each against the plan's `must_haves` and against the actual `src/server-actions/import.ts`/`src/lib/import/types.ts` code (not just the plan text) before committing
- Confirmed the "no toggle for unsupported rows" design choice in `PreviewTable.tsx` is factually correct by grepping `commitImport`'s row-filtering logic, rather than trusting the code comment at face value
- All plan-specified grep gates, `npx tsc --noEmit`, and `npm run build` pass clean

## Task Commits

Each task was committed atomically:

1. **Task 1: ImportDropzone + ImportSummary** - `4d65fac` (feat)
2. **Task 2: PreviewTable — compact expandable rows + category chips + bulk toggles** - `df113ae` (feat)
3. **Task 3: SymbolMappingSection — resolve unmatched symbols (search + create)** - `9fd4e80` (feat)

**Plan metadata:** (this commit, following SUMMARY/STATE/ROADMAP update)

## Files Created/Modified

- `src/components/import/ImportDropzone.tsx` - Drag-drop/click file input, `.xlsx`/`.csv` accept, 4MB client-side size guard mirroring `next.config.ts`'s `bodySizeLimit`, reports the chosen `File` via `onFile`; no Server Action calls
- `src/components/import/ImportSummary.tsx` - Explicit imported/skipped/duplicate stat cards (audit trail, not a toast), "View Holdings" link + "Import another file" button, one-time `useEffect`-fired `refreshPricesNow()` inside `startTransition`, result swallowed deliberately
- `src/components/import/PreviewTable.tsx` - Per-`RowStatus` category chips from `preview.categories`, a single bulk `importDuplicates` `Switch` (the only control affecting what commits), and compact rows (symbol/type/quantity/status) that expand on click to show every `rawFields` entry, normalized values, resolved instrument, and `statusReason`
- `src/components/import/SymbolMappingSection.tsx` - One entry per unique unmatched broker symbol; each entry offers a debounced `searchInstrumentsAction` search (reused from `HoldingFormDialog`) or a create-new-instrument form that prefills Groww's ISIN and requires (never fabricates) Robinhood's, gated by client-side ISIN shape validation

## Decisions Made

- Adopted the pre-existing drafted files as-is after verifying each against the plan spec and the real Server Action code, rather than rewriting — they matched exactly, including a subtle correctness claim (unsupported rows are unconditionally excluded from `commitImport`'s import set) that was independently confirmed via `grep` before trusting it
- No new UI primitives were introduced; `Switch` and `Select` (already in `src/components/ui/`) were reused as-is

## Deviations from Plan

None - plan executed exactly as written. The four target files already existed in the working tree (two staged, two untracked) from a prior session; this execution's value-add was verifying they precisely matched every `must_haves` truth/artifact/key_link in the plan (including tracing the "no unsupported toggle" design rationale back to `commitImport`'s actual filtering logic) before committing them as three atomic task commits.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four leaf components are code-complete, typed against `src/lib/import/types.ts`, and compile cleanly (`tsc` + `next build`) — 04-06 can now import them directly into the page-level state machine that wires `previewImport`/`commitImport`
- Visual/functional verification (rows actually expanding, toggles changing commit behavior, live search results, the price-refresh firing) remains deferred to 04-07's human-verify checkpoint, consistent with this project's CODE-COMPLETE/STATIC-VERIFIED pattern (no Docker/live-DB rendering during this plan)
- No blockers for 04-06

---
*Phase: 04-csv-import*
*Completed: 2026-07-16*

## Self-Check: PASSED

All 4 created component files and the SUMMARY.md itself confirmed present on disk; all 3 task commit hashes (4d65fac, df113ae, 9fd4e80) confirmed present in git log.
