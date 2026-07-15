---
status: complete
phase: 02-schema-persistence-hydration
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md, 02-07-SUMMARY.md]
started: 2026-07-14T21:00:00Z
updated: 2026-07-14T21:15:00Z
tester: external automated browser agent (Antigravity), reported by user
environment: localhost:3000, live hosted Supabase (ozkorwkhtamyaavuphhm), user abcdew@dc.com
---

## Current Test

[testing complete]

## Tests

### 1. Dashboard Empty State
expected: Dashboard shows honest empty state — no mock rows, no fabricated numbers. Pending prices show em-dash.
result: pass
note: Total Invested ₹0; Live Pricing "—" with "Phase 3 / Price feed not connected yet"; Holdings 0; Watchlist 0; "No holdings yet — add your first position to get started."; allocation chart empty; news feed honest empty state.

### 2. Add a Holding (instrument search → save)
expected: Instrument search returns real seeded instruments; INFY resolves distinctly on NSE vs NYSE (ISIN+exchange identity); saving persists the position and updates KPIs.
result: pass
note: INFY appeared on BOTH NSE and NYSE — the ISIN+exchange identity decision working as designed. Added INFY·NSE qty 10 @ ₹1500 → holdings row shows Infosys Ltd. / ₹1,500.00 / NSE; KPIs updated to ₹15,000 invested, 1 holding; allocation chart shows single NSE slice; Current Price + Total Return correctly render "—" (Phase 3 not built).

### 3. Persistence After F5 Refresh
expected: Holding survives a full page reload — data round-trips through real Supabase, not client state.
result: pass
note: PHASE 2 HEADLINE CRITERION — proven for the first time. After F5, INFY intact in holdings table; dashboard KPIs unchanged (₹15,000 / 1 holding); allocation chart intact.

### 4. Watchlist Add/Remove
expected: Add and remove watchlist entries against real rows; prices show em-dash (Phase 3).
result: pass
note: Added TCS·NSE and AAPL·NASDAQ via instrument search; removed TCS; AAPL remained. Prices "—". Signal column reads "Sentiment available after Phase 6" (honest). Research deep-link (WIRE-01) visible on each row.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

Note: the 4 UAT tests passed. Two follow-up defects were found by orchestrator
code inspection of the tester's "non-blocking observations" (see Gaps) — these
were NOT surfaced as test failures because the tester classified them as
unrelated. One was fixed immediately; one remains open.

## Gaps

- truth: "No fabricated values are shown to the user (PORT-07 honest empty states)"
  status: resolved
  reason: "Tester observed sidebar Alerts badge showing '3' while the alerts page renders an empty list. Dismissed by the tester as 'from a prior phase and unrelated', but it is a fabricated count contradicting PORT-07."
  severity: minor
  test: 1
  root_cause: "src/app/(dashboard)/layout.tsx:56 hardcoded `badge: 3` on the Alerts nav item; survived 02-06's mock-store deletion because it was a literal in the nav config, not a mock-store import (so the repo-wide `grep mock-portfolio` check could not catch it)."
  artifacts:
    - path: "src/app/(dashboard)/layout.tsx"
      issue: "hardcoded badge: 3 on Alerts nav item"
  missing:
    - "Remove the hardcoded badge until a real alerts count exists (Phase 5/6)"
  resolution: "Fixed in commit 3e6d0e5 — badge removed, tsc clean, `grep 'badge: 3'` returns nothing."

- truth: "The YouTube module operates on the user's real holdings, not mock data"
  status: resolved
  reason: "Orchestrator inspection: src/app/api/youtube/analyze/route.ts imports MOCK_HOLDINGS from src/lib/mock-youtube-data.ts, so the analyze endpoint reasons about fabricated holdings rather than the signed-in user's real positions."
  severity: minor
  test: 4
  root_cause: "02-06 deleted src/lib/mock-portfolio.ts and src/store/usePortfolioStore.ts, but src/lib/mock-youtube-data.ts is a separate file that the repo-wide grep for 'mock-portfolio|usePortfolioStore' did not match. MOCK_HOLDINGS inside it remained wired into the analyze route."
  artifacts:
    - path: "src/app/api/youtube/analyze/route.ts"
      issue: "imports MOCK_HOLDINGS instead of querying real holdings via getHoldings()"
    - path: "src/lib/mock-youtube-data.ts"
      issue: "still exports MOCK_HOLDINGS; also supplies mock video data (arguably legitimate until the YouTube/AI phase)"
  missing:
    - "Point the analyze route at real holdings (getHoldings) instead of MOCK_HOLDINGS"
    - "Decide whether mock video data stays until the YouTube/AI phase, or goes now"
  resolution: "Fixed 2026-07-14 in commit ecf939a. api/youtube/analyze/route.ts now resolves the signed-in user's real, RLS-scoped holdings via getAccountId + getHoldings and maps them to tickers; the `holdings = MOCK_HOLDINGS` body default is gone. The route also gained a getUser() 401 gate (it previously had NO auth check at all — a second, unnoticed defect). The caller (youtube/page.tsx) no longer sends a client-supplied holdings list, and MOCK_HOLDINGS was deleted from mock-youtube-data.ts. Repo-wide grep now returns only its own removal comment. tsc clean; both test suites still pass. Mock VIDEO/CHANNEL fixtures remain (legitimately deferred to the YouTube/AI phase)."

## Deferred (still not verified)

Not covered by this UAT — the tester exercised add/persist/watchlist only:

- Partial-sell against a live DB (avg cost must stay unchanged). Math IS proven
  by `npm run test:derive-holdings` (7/7), but never exercised through the UI.
- Split/bonus against a live DB (avg cost dilutes, NO false loss). Same status.
- Edit / delete holding round-trips.
- RLS isolation in the browser (a second user seeing none of it). NOTE: this IS
  proven at the API level by `npm run test:rls` against this same live DB.
- Research deep-link click-through (WIRE-01) — link visible, click not exercised.
- YouTube channel add/toggle/remove persistence (WIRE-02).
