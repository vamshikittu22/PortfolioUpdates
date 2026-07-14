---
phase: 03-price-pipeline-pnl-scheduling
plan: 04
subsystem: prices
tags: [orchestration, route-handler, server-action, admin-client, honest-failure, price-cache, fx-cache]

# Dependency graph
requires:
  - phase: 03-price-pipeline-pnl-scheduling
    provides: "parseYahooChartResponse/shouldSkipRefresh/isAuthorizedRefreshRequest/detectCorporateAction (03-02) and fetchPrices/fetchFXRate (03-03) — this plan wires them together, reimplements none"
provides:
  - "refreshAllPrices(admin) — single orchestration function that discovers instruments across ALL users, applies dedup, fetches prices/FX, and writes honestly to price_cache/fx_cache"
  - "POST /api/prices/refresh — secret-guarded route for pg_cron"
  - "refreshPricesNow() — auth-gated on-demand Server Action for the UI"
affects: [03-05-pnl-ui, 03-06-live-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single orchestration function accepts an already-constructed SupabaseClient — caller decides admin vs cookie-bound, orchestration file never constructs a client itself"
    - "Update-fetch_error-only-or-insert-null-row pattern for honest failure writes on both price_cache and fx_cache — never clobbers a good value, never fabricates a new one"
    - "Two entry points (cron route, Server Action) converge on one write path so there is exactly one place price_cache/fx_cache upsert logic lives"

key-files:
  created:
    - src/lib/prices/refresh-service.ts
    - src/app/api/prices/refresh/route.ts
    - src/server-actions/prices.ts
  modified:
    - .env.local

key-decisions:
  - "FX (fetchFXRate) is called unconditionally on every refreshAllPrices invocation, not dedup'd like per-instrument prices — a single cheap extra request, avoids a second dedup timer, per 03-RESEARCH.md's Open Question 4 recommendation."
  - "Instrument discovery queries transactions and watchlist_items separately (two SELECTs + JS Set dedup) rather than a single raw SQL UNION, matching the plan's explicit preference and avoiding a raw-SQL RPC just for this."
  - "PRICE_REFRESH_SECRET generated locally via node crypto.randomBytes and appended to .env.local under a new '# Price refresh (Phase 3)' block — no external dashboard exists for this value, unlike the Supabase/Gemini/etc. keys above it."

patterns-established:
  - "recordPriceFetchFailure / refreshFx helpers: UPDATE fetch_error only first, INSERT a null-value row only if the UPDATE affected zero rows (never-before-priced instrument or never-before-fetched FX pair) — this is the project's one canonical 'honest partial failure' write pattern for shared cache tables, reusable by future cache tables if any are added."

requirements-completed: [PRICE-01, PRICE-02, PRICE-07]

# Metrics
duration: 13min
completed: 2026-07-14
---

# Phase 3 Plan 4: Price refresh orchestration + route + Server Action Summary

**refreshAllPrices(admin) orchestration function wired to a secret-guarded pg_cron route and an auth-gated refreshPricesNow Server Action, both writing price_cache/fx_cache exclusively through the service-role admin client with a strict never-clobber/never-fabricate discipline on every failure path — static verification only (tsc clean, test:price-pnl passing), no live Supabase call made.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-14T22:08:00Z (approx)
- **Completed:** 2026-07-14T22:21:31Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified — `.env.local` is gitignored, not part of any commit)

## Accomplishments

- `refreshAllPrices(admin: SupabaseClient)` discovers every instrument referenced by ANY user's `transactions` or `watchlist_items` (two admin-client SELECTs + JS `Set` dedup, joined to `instruments` for `price_source_symbol`), applies 03-02's `shouldSkipRefresh` 60s dedup guard per instrument, fetches the remaining subset via 03-03's `fetchPrices`, and writes results honestly: successes go through a single batch `.upsert(..., { onConflict: 'instrument_id' })` with `fetch_error: null` explicitly reset; failures update ONLY `fetch_error` on the existing row (or insert a `price: null` row if the instrument has genuinely never been priced before — the only case a null price row is ever written).
- FX (`fetchFXRate('USD', 'INR')`) is refreshed unconditionally every call using the identical update-error-only-or-insert-null pattern against `fx_cache`, preserving the last-known-good rate on failure — never a fabricated fallback, consistent with 03-03's documented `exchangerate.host` `missing_access_key` finding (still unresolved; this plan does not attempt to fix that upstream issue, it just guarantees the orchestration degrades honestly around it).
- `POST /api/prices/refresh` checks `isAuthorizedRefreshRequest` against the bearer header BEFORE constructing an admin client or calling Supabase at all (verified by grep — the guard's `return NextResponse.json(...)` on line 13 precedes `createAdminClient()` on line 18).
- `refreshPricesNow()` Server Action: resolves the cookie-bound client, calls `auth.getUser()`, rejects unauthenticated callers with `{ success: false, error: 'Unauthorized' }` before ever touching the admin client, then delegates to the same `refreshAllPrices` used by the cron route and revalidates `/` and `/holdings`.
- `PRICE_REFRESH_SECRET` generated via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and appended to `.env.local` (64-char hex, non-placeholder) under a new `# Price refresh (Phase 3)` block.
- `npx tsc --noEmit` clean across the whole project. `npm run test:price-pnl` still passes unchanged (12/12 case groups) — this plan touched zero files in the pure-logic layer.

## Task Commits

Each task was committed atomically:

1. **Task 1: refresh-service.ts orchestration** - `5746aa4` (feat)
2. **Task 2: secret-guarded route + PRICE_REFRESH_SECRET** - `2a3a914` (feat)
3. **Task 3: refreshPricesNow Server Action** - `9111c53` (feat)

**Plan metadata:** (this commit, below)

## Files Created/Modified

- `src/lib/prices/refresh-service.ts` — `refreshAllPrices(admin)`, `RefreshSummary` type; the single place `price_cache`/`fx_cache` are written; accepts a client, never constructs one.
- `src/app/api/prices/refresh/route.ts` — `POST` handler, secret-guarded via `isAuthorizedRefreshRequest`, delegates to `refreshAllPrices(createAdminClient())`.
- `src/server-actions/prices.ts` — `refreshPricesNow()`, `'use server'`, auth-gated via `getUser()`, delegates to the same `refreshAllPrices`.
- `.env.local` — added `PRICE_REFRESH_SECRET` (gitignored, not committed to the repo; local-only per existing `.env*` ignore rule).

## Decisions Made

- Discovery queries `transactions` and `watchlist_items` as two separate admin-client SELECTs with JS-side `Set` dedup rather than a raw SQL `UNION`/RPC, per the plan's explicit "no need for raw SQL" guidance — keeps the query surface simple and debuggable through the standard Supabase client.
- `recordPriceFetchFailure` uses `UPDATE ... .select('instrument_id')` to detect zero-row updates (rather than a separate existence-check SELECT before the UPDATE) — one round-trip instead of two, and the returned row count is the ground truth for "did this instrument already have a row."
- FX failure/success writes reuse the exact same update-or-insert shape as price failures (`refreshFx` mirrors `recordPriceFetchFailure`'s structure) rather than inventing a second pattern, keeping the "honest partial failure" discipline visually consistent across both cache tables.

## Deviations from Plan

None - plan executed exactly as written. All three function/file signatures (`refreshAllPrices(admin): Promise<RefreshSummary>`, the route's guard-before-Supabase ordering, `refreshPricesNow()`'s auth-then-delegate shape) match the plan's `<action>` sections verbatim, including the exact upsert/update/insert semantics described for both `price_cache` and `fx_cache`.

## Issues Encountered

None. `npx tsc --noEmit` was clean on the first pass (no follow-up type fixes needed against the Supabase-generated row shapes, which are untyped `any` from the generic client — acceptable per the project's existing pattern of not maintaining generated DB types elsewhere in `src/server-actions/portfolio.ts` either). `npm run test:price-pnl` was unaffected since this plan added zero files under the pure-logic layer.

## User Setup Required

None new beyond what 03-01/03-03 already flagged (registering `app.settings.price_refresh_url`/`...secret` directly against the live Supabase project once it exists with a deployed domain, and resolving the `exchangerate.host` free-tier key issue) — both remain deferred to 03-06's live checkpoint, unchanged by this plan.

## Next Phase Readiness

- 03-05 (Dashboard/Holdings UI) can now import `refreshPricesNow` from `@/server-actions/prices` directly for its "refresh button" — the Server Action is fully authored and statically verified but **not yet wired to any UI element** (no component currently calls it — confirmed via grep, zero matches outside `src/server-actions/prices.ts` itself). That wiring is 03-05's job, not this plan's.
- 03-06's live checkpoint can exercise both entry points once the two 03-01 migrations are pushed and a deployed domain exists: `curl -i -X POST https://<domain>/api/prices/refresh` with/without the correct `Authorization: Bearer <PRICE_REFRESH_SECRET>` header (401 path already exercisable locally against `npm run dev` even pre-migration, since `isAuthorizedRefreshRequest` never reaches Supabase on a bad/missing secret), and `refreshPricesNow()` from a signed-in session.
- **Carried-forward concern (unchanged from 03-03):** `exchangerate.host`'s free `/convert` endpoint still returns `missing_access_key` in practice — `refreshAllPrices`'s FX step will record an honest `fetch_error` on every real invocation until a key is obtained or the provider is swapped (e.g. Frankfurter, open.er-api.com). Price refresh itself is unaffected — FX failure never blocks or fails the price half of `refreshAllPrices` (verified by code structure: `refreshFx` is called after the price loop completes and its own thrown errors, if any, would only come from a genuine Supabase write failure, not from `fetchFXRate`'s honest-error return value).

## Requirements Status Note

This plan's frontmatter listed `[PRICE-01, PRICE-02, PRICE-03, PRICE-07]`. `PRICE-01`, `PRICE-02`, and `PRICE-07` were already marked complete by prior plans (03-01/03-02) and remain so — this plan's orchestration is consistent with and depends on that prior work but doesn't newly complete them. **`PRICE-03` ("User can trigger an on-demand refresh now") is intentionally left Pending in `REQUIREMENTS.md`**: the backend (`refreshPricesNow` Server Action) is code-complete and statically verified, but there is no UI trigger calling it yet (that's 03-05's scope) and no live-database verification has occurred (that's 03-06's scope, and it's also blocked on the still-unresolved `exchangerate.host` key for the FX half of a full refresh). Marking it complete now would over-claim.

---
*Phase: 03-price-pipeline-pnl-scheduling*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/lib/prices/refresh-service.ts
- FOUND: src/app/api/prices/refresh/route.ts
- FOUND: src/server-actions/prices.ts
- FOUND commit: 5746aa4
- FOUND commit: 2a3a914
- FOUND commit: 9111c53
