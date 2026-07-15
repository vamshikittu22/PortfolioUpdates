---
status: paused
phase: 01-auth-rls-foundation
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md]
started: 2026-07-14T00:00:00Z
updated: 2026-07-14T21:05:00Z
---

## Current Test

[PAUSED at user's direction — 2026-07-14: "auth can be dealt at last", website
functionality prioritised over auth UAT. Resume with `/gsd:verify-work 1`;
testing continues from test 2.]

## Environment Notes (hosted Supabase, ozkorwkhtamyaavuphhm)

- "Confirm email" was ON by default (hosted projects). Phase 1's
  `enable_confirmations = false` applies only to the LOCAL stack, so it never
  took effect here. User toggled it OFF in the dashboard mid-session.
- Accounts created BEFORE that toggle remain permanently unconfirmed and can
  never sign in (e.g. `abcd@dc.com`). Not a code defect. Toggling confirmations
  off is not retroactive.
- An early `test:rls` run (pre-fix) called anon `signUp` twice, sending 2
  confirmation emails and exhausting the free tier's default 2-emails/hour
  limit → browser sign-up briefly returned 429. Resolved by the toggle
  (no email is sent when confirmations are off).
- Automated RLS proof PASSES against this live DB:
  `npm run test:rls` → "PASS: cross-user read/write blocked and
  price_cache/news_items writes rejected".

## Tests

### 1. Sign Up With Email/Password
expected: At /login, signing up with a fresh email + password lands you on the dashboard. No "sign-up disabled" block, no demo abc@g.com credentials on the page.
result: pass
note: Verified with a fresh account after "Confirm email" was disabled; user confirmed sign-up lands on the dashboard.

### 2. Real Email Shown (No Demo Account)
expected: On the dashboard, the profile/sidebar shows YOUR real signed-up email — never abc@g.com — and there is no "Demo Account Details" banner anywhere.
result: [pending]

### 3. Refresh Persistence
expected: Reload the dashboard (F5). You stay logged in and land back on the dashboard, not /login.
result: [pending]

### 4. Log Out
expected: Use Sign Out (sidebar/profile). You are redirected to /login and can no longer reach the dashboard by navigating to /.
result: [pending]

### 5. Log Back In
expected: Sign in again with the same credentials. You reach the dashboard and your real email is shown.
result: [pending]

### 6. Forged Cookie Rejected
expected: DevTools > Application > Cookies > localhost. Edit an `sb-...-auth-token` cookie value to garbage, then reload. You are bounced to /login — NOT left logged in. (This proves the proxy revalidates via getUser() instead of trusting the raw cookie.)
result: [pending]

### 7. Settings Endpoint Gated (401)
expected: With no session (private window, or after logout), visiting http://localhost:3000/api/settings/keys returns HTTP 401 / an unauthorized response — not the provider-flags JSON.
result: pass
note: |
  FOUND A REAL BUG, then fixed it (commit cb21967). First live curl returned
  HTTP 307 (redirect to /login), NOT 401 — so AUTH-06's stated criterion was
  never actually met, and 01-04-SUMMARY's claim that the gate returns 401 was
  wrong in practice. Cause: proxy.ts matched ALL non-static paths including
  /api/*, and redirected unauthenticated requests to /login before the route's
  getUser() 401 gate could ever execute. The gate was effectively dead code.

  Severity was higher than a wrong status code: /api/prices/refresh is guarded
  by a BEARER SECRET (pg_cron has no cookie), and it was 307'd to /login even
  WITH the correct secret. Once deployed, the 3-hourly scheduled refresh
  (PRICE-02) would have silently never run, surfacing no error.

  Fix: proxy.ts now skips the login redirect for /api/* (session refresh still
  applies); each route enforces its own auth. This matches proxy.ts's own stated
  contract ("OPTIMISTIC check only — real authorization lives at the data layer").

  Verified live after fix:
    /api/settings/keys        unauth         -> 401
    /api/youtube/analyze      unauth         -> 401
    /api/prices/refresh       wrong secret   -> 401
    /api/prices/refresh       correct secret -> 200 {"succeeded":2,"fxUpdated":true}
    /holdings                 unauth         -> 307 -> /login (pages still redirect)
  tsc clean; test:rls and test:price-pnl still pass.

## Summary

total: 7
passed: 1
issues: 0
pending: 6
skipped: 0

Tests 2-7 (real email shown, refresh persistence, logout, log back in, forged
cookie rejection, settings 401) are NOT yet exercised — paused, not passed.
The automated RLS isolation proof for this phase does pass (see Environment
Notes above); the browser-observable auth checks remain outstanding.

## Gaps

[none yet]
