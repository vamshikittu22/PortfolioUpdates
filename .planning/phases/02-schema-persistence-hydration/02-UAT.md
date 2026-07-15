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

## Follow-up: 2026-07-15 Phase 1-3 live review (external agent, reported by user)

The reviewer passed Phase 3 (real prices visible, P&L math independently correct)
and listed 5 "non-blocking observations". Orchestrator investigation found TWO of
them were real defects, both since fixed. Recording the pattern: this is the
SECOND review where an item filed as "unrelated / dev artifact / natural
enhancement" turned out to be a genuine bug. Observations dismissed without
inspection are not evidence of absence.

- truth: "No fabricated or mismatched values are rendered to the user"
  status: resolved
  reason: "Reviewer: '1 Issue red badge at bottom-left ... appears to be a Next.js dev overlay indicator, not a user-facing error ... it's a dev-mode artifact.'"
  severity: minor
  root_cause: "NOT a dev artifact. A real React hydration error firing on every page load: StalenessBadge used toLocaleString(undefined, ...), which resolves to the RUNTIME's default locale. Server rendered 'Jul 15, 12:01 AM'; browser rendered '15 Jul, 12:01 am'. React discarded the server HTML for that subtree and re-rendered client-side. Pinning locale alone would still break in production, where the server runs UTC (Vercel) and the browser is IST — timezone had to be pinned too."
  artifacts:
    - path: "src/components/dashboard/StalenessBadge.tsx"
      issue: "toLocaleString(undefined, ...) — non-deterministic across server/client"
  resolution: "Fixed in a8872a9 — DISPLAY_LOCALE='en-IN' + DISPLAY_TIME_ZONE='Asia/Kolkata' (correct for an INR/NSE product, not arbitrary). Verified: 0 hydration errors after reload."

- truth: "Held AND WATCHED tickers show real prices with an 'as of' timestamp (Phase 3 success criterion 1)"
  status: resolved
  reason: "Reviewer: watchlist prices still show em-dash — 'a natural Phase 3+ enhancement, not a bug'."
  severity: major
  root_cause: "It was a gap against Phase 3's own success criterion, not a future enhancement. Nuance: PRICE-01 as literally worded ('system FETCHES ... into a shared price cache') WAS met — refresh-service already fetched watchlist instruments and AAPL's price was sitting in price_cache. But the roadmap's Phase 3 criterion 1 says held and watched tickers SHOW real prices. getWatchlist never joined price_cache and WatchlistTable hardcoded an em-dash behind a now-stale comment ('no live feed until Phase 3' — we were IN Phase 3)."
  artifacts:
    - path: "src/lib/supabase/portfolio.ts"
      issue: "getWatchlist did not join price_cache"
    - path: "src/components/dashboard/WatchlistTable.tsx"
      issue: "hardcoded em-dash + stale 'until Phase 3' comment"
  resolution: "Fixed in the 03-05 watchlist commit — added getPricedWatchlist + PricedWatchlistItem reusing the SAME computeStaleness and a shared readPriceCache helper (so holdings/watchlist can never disagree about 'stale'), extracted formatCurrency to src/utils/format.ts instead of duplicating it, and wired Dashboard + News. Verified live: AAPL price=317.31 USD, chg=+0.63%, staleness=fresh, asOf=2026-07-15T06:21:08Z. Null price still renders an honest em-dash, never 0."

Reviewer observations that were correct and need no action: Day P&L is computed
on current market value (standard); staleness thresholds (30min/6h) match the ~3h
cadence; Actions column is present but clipped at narrow viewports (cosmetic,
open).

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
