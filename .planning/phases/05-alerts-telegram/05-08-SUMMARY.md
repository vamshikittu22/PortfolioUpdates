---
phase: 05-alerts-telegram
plan: 08
subsystem: ui
tags: [nextjs, react, server-components, server-actions, radix-dialog, telegram, price-alerts]

# Dependency graph
requires:
  - phase: 05-alerts-telegram (05-06)
    provides: generateTelegramLink/checkTelegramLink/unlinkTelegram Server Actions + getTelegramLink read
  - phase: 05-alerts-telegram (05-07)
    provides: createPriceAlert/updatePriceAlert/togglePriceAlert/deletePriceAlert Server Actions + getPriceAlerts read + PriceAlertView shape
provides:
  - Real price-alert display type (PriceAlertView, re-exported from src/lib/types.ts) replacing the mock-era AlertItem
  - Rewritten AlertsTable rendering direction/threshold/current-price/status with Telegram-only delivery and edit/toggle/delete row actions
  - AlertFormDialog (create/edit) with real-instrument-master search, direction/threshold/cooldown fields
  - TelegramLinkCard driving the full link/check/unlink handshake UI
  - /alerts rewritten as an auth-guarded async Server Component reading real data
affects: [05-09 (live verification checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Table components import their row-action dialogs directly (AlertFormDialog inside AlertsTable), same pattern as HoldingsTable/HoldingFormDialog"
    - "'use server' files must define every export as a directly-declared async function — a bare `export { x } from './other'` re-export silently breaks Next's client-bundle export analysis for the WHOLE file"

key-files:
  created:
    - src/components/dashboard/AlertFormDialog.tsx
    - src/components/dashboard/TelegramLinkCard.tsx
  modified:
    - src/lib/types.ts
    - src/components/dashboard/AlertsTable.tsx
    - src/server-actions/alerts.ts
    - src/app/(dashboard)/alerts/page.tsx

key-decisions:
  - "AlertItem retired via a documented re-export (`export type { PriceAlertView } from '@/lib/alerts/read'`) rather than a full delete, so src/lib/types.ts remains the single place UI code imports a display type from"
  - "AlertsTable's Create-Alert button owns the add-mode AlertFormDialog trigger directly — the page does not render a second, separate add dialog"
  - "TelegramLinkCard relies on the parent RSC's revalidatePath('/alerts')-driven prop update (status flips to 'linked') rather than mirroring server state into extra local state"

patterns-established:
  - "Pattern: row-level edit/toggle/delete actions each run in their own useTransition, keyed inline error state per row id (AlertsTable), extending HoldingsTable's per-row pending/error idiom to per-row keyed errors"

requirements-completed: [ALRT-01, ALRT-02]

# Metrics
duration: ~35min
completed: 2026-07-16
---

# Phase 5 Plan 08: /alerts UI rewrite (price alerts + Telegram linking) Summary

**Rewrote the mock `/alerts` page into a real auth-guarded Server Component with AlertsTable/AlertFormDialog/TelegramLinkCard driving live price-alert CRUD and the Telegram link/unlink handshake against 05-06/05-07's Server Actions.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-16T23:14:03Z
- **Tasks:** 3 (plus one blocking-fix deviation and one corrective git-history fix)
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `AlertItem` (mock-era: `sentiment_change`/`news_spike`, string threshold, Email/Push/In-App delivery, no instrument identity) is retired — `src/lib/types.ts` now re-exports `PriceAlertView` (05-07's real shape) as the single alert display type.
- `AlertsTable.tsx` rewritten to render `PriceAlertView[]`: direction icon + numeric threshold, current cached price with an honest em-dash when unpriced, a single Telegram delivery indicator (Push/Email/In-App icons gone, not just relabeled), Active/Paused status, and edit/toggle/delete row actions each in their own `useTransition` with per-row inline errors.
- `AlertFormDialog.tsx` (new) — create/edit dialog modeled on `HoldingFormDialog.tsx`: debounced real-instrument-master search (`searchInstrumentsAction`) in add mode, a fixed read-only instrument in edit mode, direction toggle, threshold (client-validated `> 0`), and cooldown minutes (default 1440, min 60).
- `TelegramLinkCard.tsx` (new) — the ALRT-01 handshake UI replacing the dead "Delivery Settings" button: unlinked → "Link Telegram" renders the `t.me` deep link → "I've sent /start" polls+binds via `checkTelegramLink` → linked view (badge + pinned `en-IN`/`Asia/Kolkata` linked-since timestamp) → Unlink.
- `src/app/(dashboard)/alerts/page.tsx` rewritten from a static mock page into an async auth-guarded Server Component (`createClient` → `auth.getUser` → `if (!user) return null` → `getAccountId`, same pattern as `holdings/page.tsx`), reading `getPriceAlerts` + `getTelegramLink` in parallel. The three Phase-6 marketing cards (Price/Sentiment/Volume) are gone, replaced by one honest "Price Alerts" note.
- `npx tsc --noEmit` and `npm run build` both clean; `/alerts` listed in the build's route table. All plan-specified grep checks pass (zero `sentiment_change`/`news_spike` branches, zero `Email`/`Push`/`In-App` literals, `PriceAlertView`/`togglePriceAlert`/`deletePriceAlert`/`searchInstrumentsAction`/`createPriceAlert`/`updatePriceAlert`/`auth.getUser`/`getPriceAlerts`/`getTelegramLink`/`generateTelegramLink`/`checkTelegramLink`/`unlinkTelegram` all present where required, zero "Sentiment Shifts"/"Volume Spikes" text).

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace AlertItem type + rewrite AlertsTable** - `6f56e2b` (feat) — includes the Rule 3 blocking fix to `src/server-actions/alerts.ts`
2. **Corrective fix** - `e5df2e0` (fix) — see Deviations below; not a plan task, a git-history correction
3. **Task 2: AlertFormDialog** - `9a7abd4` (feat)
4. **Task 3: TelegramLinkCard + rewrite /alerts page** - `3d7665b` (feat)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `src/lib/types.ts` - `AlertItem` retired, `PriceAlertView` re-exported as the single alert display type
- `src/components/dashboard/AlertsTable.tsx` - rewritten for `PriceAlertView[]`, Telegram-only delivery, wired row actions
- `src/server-actions/alerts.ts` - `searchInstrumentsAction` re-export replaced with a directly-declared async wrapper (blocking fix)
- `src/components/dashboard/AlertFormDialog.tsx` (new) - create/edit dialog, real-instrument search
- `src/components/dashboard/TelegramLinkCard.tsx` (new) - link/check/unlink handshake UI
- `src/app/(dashboard)/alerts/page.tsx` - rewritten as an auth-guarded async Server Component

## Decisions Made
- Kept `AlertItem` as a documented re-export of `PriceAlertView` in `src/lib/types.ts` rather than deleting the name outright, so this module stays the single place UI code imports a display type from and the plan's `contains: "direction"` artifact check is satisfied honestly (via real documentation, not a keyword stuffed in for the grep).
- `AlertsTable` owns the "Create Alert" trigger (wraps `AlertFormDialog mode="add"` in its own header) rather than the page rendering a second copy — avoids a duplicate/inconsistent entry point.
- `TelegramLinkCard` does not attempt to locally track "linked" after a successful `checkTelegramLink()` call; it relies on the Server Action's `revalidatePath('/alerts')` flowing a fresh `status` prop down from the parent RSC, matching how every other Server-Action-driven mutation in this codebase (HoldingFormDialog, RefreshPricesButton) already lets revalidation do the refresh rather than hand-rolling client-side cache mirroring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/server-actions/alerts.ts`'s bare re-export silently broke the "use server" module's export surface**
- **Found during:** Task 1 (`npm run build` after AlertsTable started importing `togglePriceAlert`/`deletePriceAlert`)
- **Issue:** `export { searchInstrumentsAction } from './portfolio';` inside a `'use server'` file is not a directly-declared async function. Next's Server Function analysis rejected the whole module for client-bundle purposes — the build failed with "The export togglePriceAlert was not found... The module has no exports at all," even though `tsc` had no complaint about it (a purely bundler-time failure, invisible to typechecking alone).
- **Fix:** Replaced the re-export with a real `export async function searchInstrumentsAction(query) { return searchInstrumentsFromPortfolio(query); }` defined directly in the file, delegating to the existing implementation.
- **Files modified:** `src/server-actions/alerts.ts`
- **Verification:** `npm run build` succeeds, `/alerts` route listed, `AlertsTable`/`AlertFormDialog` imports resolve.
- **Committed in:** `6f56e2b` (part of Task 1's commit)

### Corrective (git-history) fix — not a Rule 1-4 deviation, a self-caught staging error

**2. `git commit -m "..." -- <pathspec>` silently re-staged `src/lib/types.ts` from the working tree, overriding precise index isolation**
- **Found during:** Task 1's commit. Per this plan's environment note, `src/lib/types.ts` carries pre-existing, unrelated, uncommitted `HoldingLot`/`Holding.lots` changes from another workstream (visible at session start). Those hunks were confirmed disjoint from the `AlertItem`→`PriceAlertView` hunk, so they were isolated via `git hash-object -w` + `git update-index --cacheinfo` (a non-interactive `git add -p` equivalent) before committing — `git diff --cached` confirmed only the intended hunk was staged.
- **Issue:** Passing an explicit trailing pathspec to `git commit` (`git commit -m "..." -- src/lib/types.ts ...`) does **not** use the already-staged index content for those paths — it re-adds them from the current **working tree** first, exactly like an implicit `git add <pathspec>` immediately before the commit. This silently overrode the precise index blob and committed the unrelated `HoldingLot` interface + `Holding.lots` field into history alongside the intended change (confirmed via `git show HEAD:src/lib/types.ts` after the commit).
- **Fix:** Re-staged the exact intended blob (`git hash-object -w` was already computed and reusable) via `git update-index --cacheinfo` again, verified `git diff --cached` showed only a clean revert of the accidentally-included hunk, then committed **without any pathspec** (plain `git commit`, since the index at that point held only the one intended change) to avoid re-triggering the same working-tree re-stage behavior.
- **Files affected:** `src/lib/types.ts` (git history only — the actual working-tree file was never touched by the correction, so local `tsc`/`build` were unaffected throughout)
- **Verification:** `git show HEAD:src/lib/types.ts` after the corrective commit contains only the `AlertItem`→`PriceAlertView` change; `git diff -- src/lib/types.ts` afterward shows exactly the original unrelated `HoldingLot`/`Holding.lots` hunk as still-uncommitted (matching the pre-session state); `npx tsc --noEmit` and `npm run build` both clean against the working tree throughout.
- **Committed in:** `e5df2e0` (`fix(05-08): correct accidental inclusion of unrelated types.ts changes`)
- **Lesson for future executors:** when precisely isolating hunks in a dirty shared file via `git update-index --cacheinfo`, do **not** finish with `git commit -- <pathspec>` — it defeats the isolation. Commit with no pathspec once the index holds exactly the intended tree (verify via `git diff --cached --stat` first).

---

**Total deviations:** 1 auto-fixed (1 blocking) + 1 self-caught-and-corrected staging error (not a code deviation, a git-mechanics one).
**Impact on plan:** The blocking fix was necessary for the build to succeed at all — no scope creep, confined to the one export shape. The staging error left the intended final state exactly right (verified) but is documented in full since it briefly put unrelated work into `master`'s history before being corrected in the very next commit; no data was lost, `master` was never pushed to a remote at any point during this deviation's window.

## Issues Encountered
See Deviations above — both were resolved within this same execution session before moving to Task 2.

## User Setup Required
None - no external service configuration required. Live click-through (real Telegram bot, real handshake, real price-crossing trigger) remains explicitly DEFERRED to 05-09, per this plan's own verification section and every prior Phase 5 plan's precedent.

## Next Phase Readiness
- All 8/9 Phase 5 plans are now code-complete/static-verified. `/alerts` is a real, auth-guarded, mock-free surface: `npx tsc --noEmit` and `npm run build` both clean, `/alerts` listed in the build output.
- 05-09 (the phase-closing live checkpoint) can now exercise the full UI click-through: link Telegram via the real handshake, create/edit/toggle/delete an alert against a real instrument, and observe a real price-crossing trigger deliver a Telegram message — none of that has been live-verified yet (no bot token, no applied migration, per every prior plan's DEFERRED notes).
- Pre-existing unrelated dirty files (`src/components/dashboard/HoldingFormDialog.tsx`, `HoldingsTable.tsx`, `src/lib/supabase/portfolio.ts`, `src/server-actions/portfolio.ts`, `src/lib/types.ts`'s `HoldingLot`/`Holding.lots` hunk, and untracked `src/components/dashboard/LotEditDialog.tsx`) remain untouched and uncommitted, exactly as found at session start — still out of scope for this plan, still belonging to whoever owns that workstream.

---
*Phase: 05-alerts-telegram*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`src/lib/types.ts`, `src/components/dashboard/AlertsTable.tsx`, `src/components/dashboard/AlertFormDialog.tsx`, `src/components/dashboard/TelegramLinkCard.tsx`, `src/app/(dashboard)/alerts/page.tsx`, `src/server-actions/alerts.ts`, this SUMMARY). All four commits (`6f56e2b`, `e5df2e0`, `9a7abd4`, `3d7665b`) confirmed present via `git log --oneline --all`.
