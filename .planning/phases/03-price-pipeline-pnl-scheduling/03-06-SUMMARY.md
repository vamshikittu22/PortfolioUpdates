---
phase: 03-price-pipeline-pnl-scheduling
plan: 06
subsystem: prices
tags: [checkpoint, human-verify, deferred, live-db]
mode: DEFERRED — blocked on migration push (user declined)

requires:
  - phase: 03-04
    provides: refreshAllPrices orchestration + secret-guarded route + refreshPricesNow Server Action
  - phase: 03-05
    provides: price/P&L/staleness/corporate-action UI + Refresh now button
provides:
  - (nothing — verify-only plan, not executed)

key-decisions:
  - "NOT EXECUTED. User explicitly declined applying 03-01's two migrations to the live DB (2026-07-14). Without fx_cache and the re-keyed price_cache, no live price refresh can run, so the 8-step checkpoint is impossible. No result fabricated."

requirements-completed: []

duration: 0min (not executed)
completed: n/a
---

# Phase 3 Plan 06: Live Price Checkpoint — NOT EXECUTED (DEFERRED)

**This plan is a verify-only, blocking human-verify checkpoint. It was NOT run. The user declined to push 03-01's two migrations to the live Supabase project, so the schema the price pipeline writes to (`fx_cache`, re-keyed `price_cache`) does not exist in the database. Nothing was verified and nothing was fabricated.**

## Why it could not run

The live DB (project `ozkorwkhtamyaavuphhm`) currently has only the 5 Phase 1 + Phase 2 migrations applied. Phase 3's two migrations remain authored-but-unapplied:

- `20260714220333_price_fx_schema.sql` — creates `fx_cache`; re-keys `price_cache` to `instrument_id`; makes `price`/`source` nullable; adds `fetch_error`, `corporate_action_flag`.
- `20260714220438_price_refresh_cron.sql` — pg_cron/pg_net 3-hourly refresh schedule.

`refreshAllPrices` writes to those columns/tables. Against the current live schema it cannot succeed.

## Blocking prerequisite

Apply the two migrations (orchestrator push, requires explicit user consent):

```
npx supabase db push --db-url "postgresql://postgres:<pw>@db.ozkorwkhtamyaavuphhm.supabase.co:5432/postgres"
```

Dry-run confirmed (2026-07-14) that exactly these two would apply, and that `price_cache` holds no rows — so the re-key is non-destructive.

## Known environment limitations (independent of the push)

1. **Scheduled refresh (PRICE-02) is NOT verifiable locally.** `price_refresh_cron.sql` has Supabase's cloud pg_cron POST to the refresh endpoint via pg_net. Supabase's cloud cannot reach `localhost:3000`. The 3-hourly schedule can only be genuinely verified once the app is deployed to a publicly reachable URL (e.g. Vercel), with the DB settings for URL + `PRICE_REFRESH_SECRET` configured. The **on-demand "Refresh now"** path IS locally verifiable once migrations are applied.
2. **FX is broken upstream.** `exchangerate.host`'s free `/convert` now returns `missing_access_key` (confirmed live during 03-03; 03-RESEARCH.md's "free, no key" claim is stale). Until an API key or provider swap happens, `fetchFXRate` will honestly record a `fetch_error` on every run, and `getPortfolioPnL` excludes non-base-currency holdings from the cross-currency total rather than converting at a fabricated rate. Multi-currency P&L (PRICE-04) therefore cannot be fully verified yet.

## The 8-step checkpoint, when unblocked

1. Apply migrations; confirm `fx_cache` exists and `price_cache` is re-keyed with nullable price.
2. `npm run dev`, sign in, add a holding (e.g. INFY·NSE).
3. Click **Refresh now** → real Yahoo price appears for INFY.NS (confirmed reachable in 03-03).
4. Staleness badge shows a real "as of" timestamp; age increases over time.
5. Per-holding + total P&L compute from the real price (day-change and total-change).
6. FX effect visible on the combined total — or honestly marked unavailable (expected, given the FX key gap).
7. Force a failed fetch (bad symbol / offline) → stale-with-warning badge retains last-known price; NEVER a fabricated value; `fetch_error` recorded.
8. Corporate-action flag: a >40% overnight move flags rather than showing a huge gain/loss.

## Requirements status (deliberately NOT claimed)

| Requirement | Status | Why |
| ----------- | ------ | --- |
| PRICE-03 (refresh now / on-demand) | Pending | Code-complete + static-verified; no live run |
| PRICE-04 (staleness badge, never fabricated) | Pending | Needs live run AND the FX key gap resolved |
| PRICE-02 (scheduled refresh) | Pending | Needs deployment — cron cannot reach localhost |

---
*Phase: 03-price-pipeline-pnl-scheduling*
*Status: NOT EXECUTED — deferred, blocked on live migration push*
