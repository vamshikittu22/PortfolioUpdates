---
phase: 02-schema-persistence-hydration
plan: 04
subsystem: data-access
tags: [supabase, server-actions, server-components, rls, transactions, watchlist]
mode: code-only / defer-verification

# Dependency graph
requires:
  - phase: 02-schema-persistence-hydration
    plan: "02-01"
    provides: "public.instruments / public.transactions / public.watchlist_items schema + RLS"
  - phase: 02-schema-persistence-hydration
    plan: "02-02"
    provides: "deriveHoldings(transactions) pure function + src/lib/types.ts shared domain types"
provides:
  - "src/lib/supabase/portfolio.ts — getAccountId/getHoldings/getWatchlist/searchInstruments read queries"
  - "src/server-actions/portfolio.ts — 8 'use server' mutations (add/sell/edit/delete holding, split, bonus, watchlist add/remove)"
affects: [02-05, 02-06, 02-07 (page hydration / wave 3, which will call this layer)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read layer accepts an injected SupabaseClient (server client only, never admin) — RLS is the sole authorization boundary, no duplicate permission checks in application code"
    - "getHoldings joins transactions+instruments in one query (no N+1), maps rows to Transaction[], and delegates aggregation to the already-tested deriveHoldings() rather than reimplementing it"
    - "Every Server Action: getUser() defense-in-depth check -> resolve accountId -> mutate via cookie-bound client -> revalidatePath('/'), ('/holdings'), ('/news')"
    - "editHolding/deleteHolding are Phase 2 MVP simplifications (documented inline): position-reset via delete-then-insert, not per-lot editing"

key-files:
  created:
    - src/lib/supabase/portfolio.ts
    - src/server-actions/portfolio.ts
  modified: []

key-decisions:
  - "Continued CODE-ONLY / DEFER-VERIFICATION mode (no Docker, no live Supabase) — all code authored and statically verified only (tsc + grep checks), no live-DB calls made or fabricated as passing."
  - "revalidatePath calls written inline (3 literal calls per action) rather than factored into a shared helper, so the plan's own grep-based verification (revalidatePath count >= 8) reflects real per-action revalidation rather than an indirect helper call that a literal grep would miss."
  - "addToWatchlist catches Postgres unique-violation (code 23505) and returns a friendly `{ success: false, error: 'Already on watchlist' }` instead of throwing, per plan instruction."

requirements-completed: [PORT-01, PORT-02, PORT-03, PORT-05, PORT-06]

# Metrics
duration: 15min
completed: 2026-07-14
---

# Phase 2 Plan 04: Server-Side Data Access Layer (Reads + Mutations) Summary

**Server-side data access layer for the portfolio domain: read queries in `src/lib/supabase/portfolio.ts` that join `transactions`+`instruments` in one query per call and delegate aggregation to the tested `deriveHoldings()`, plus 8 `'use server'` mutations in `src/server-actions/portfolio.ts` covering add/sell/edit/delete holding, split, bonus, and watchlist add/remove — all authored and statically verified (tsc clean, grep checks pass), live-DB exercise DEFERRED (no Docker/live Supabase in this environment).**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 2 (both new)

## Accomplishments

- `src/lib/supabase/portfolio.ts`: `getAccountId`, `getHoldings`, `getWatchlist`, `searchInstruments` — all accept an injected `SupabaseClient` (server client, never admin), one `.select()` per function (no N+1), and `getHoldings` reuses `deriveHoldings` from plan 02-02 rather than re-implementing the weighted-average-cost math.
- `src/server-actions/portfolio.ts`: 8 exported Server Actions (`addHolding`, `sellHolding`, `editHolding`, `deleteHolding`, `recordSplit`, `recordBonus`, `addToWatchlist`, `removeFromWatchlist`), each authenticated (`getUser()` defense-in-depth), RLS-scoped (mutations go through the cookie-bound client only — no admin client anywhere in the file), input-validated (`quantity > 0`, `price >= 0` for BUY/SELL, friendlier than a raw Postgres CHECK violation), and revalidating `/`, `/holdings`, `/news` on success.
- Phase 2 MVP simplifications documented inline as intentional, not oversights: `editHolding` resets a position (delete-then-insert) rather than editing one historical lot; `deleteHolding` closes a position entirely and is explicitly distinct from `sellHolding` (a recorded market exit).

## Task Commits

Each task was committed atomically:

1. **Task 1: Read queries — src/lib/supabase/portfolio.ts** - `748aabf` (feat)
2. **Task 2: Server Action mutations — src/server-actions/portfolio.ts** - `12b48fd` (feat)

_Plan metadata commit follows this summary._

## Files Created/Modified

- `src/lib/supabase/portfolio.ts` - read queries: `getAccountId`, `getHoldings` (deriveHoldings-backed), `getWatchlist`, `searchInstruments`
- `src/server-actions/portfolio.ts` - 8 `'use server'` mutation actions for holdings/watchlist/split/bonus

## Decisions Made

- Kept CODE-ONLY / DEFER-VERIFICATION mode (no Docker, no live Supabase in this environment) — nothing was run against a real Postgres instance, and nothing is claimed as live-verified.
- Wrote `revalidatePath('/')` / `revalidatePath('/holdings')` / `revalidatePath('/news')` inline in each of the 8 actions (24 literal call sites) rather than via a shared helper function, so the plan's grep-based verification measures real per-action behavior.
- `addToWatchlist` catches Postgres error code `23505` (unique violation on `(account_id, instrument_id)`) and returns `{ success: false, error: 'Already on watchlist' }` rather than throwing, matching the plan's specified UX.

## Deviations from Plan

None — plan executed exactly as written. All type signatures, exports, and mutation semantics match the plan's specification (including the documented Phase 2 MVP simplifications for `editHolding`/`deleteHolding`, which the plan itself calls out as intentional).

## Issues Encountered

None.

## Done (authored, static-verified)

- [x] `npx tsc --noEmit` — clean, no errors, across the whole project (not just these two files).
- [x] `grep "deriveHoldings" src/lib/supabase/portfolio.ts` — matches (import + call site); aggregation is reused, not reimplemented.
- [x] `grep -c "\.select(" src/lib/supabase/portfolio.ts` = 4 — one `.select()` per exported function (`getAccountId`, `getHoldings`, `getWatchlist`, `searchInstruments`), no query-in-a-loop / N+1 pattern.
- [x] `head -n 1 src/server-actions/portfolio.ts` = `'use server';` — first line of the file.
- [x] `grep "createAdminClient" src/server-actions/portfolio.ts` — no matches; mutations only ever use the cookie-bound server client, never the service-role client, so RLS applies to every write.
- [x] `grep -c "revalidatePath" src/server-actions/portfolio.ts` = 26 (>= 8 required) — every one of the 8 actions calls `revalidatePath` for `/`, `/holdings`, and `/news`.
- [x] Both files committed individually (`748aabf`, `12b48fd`).

## Deferred/unverified (needs live DB)

This project has no Docker and no live/hosted Supabase project (carried forward from Phase 1/02-01's CODE-ONLY / DEFER-VERIFICATION decision, see `.planning/STATE.md`). The following are explicitly **not** verified and **not** fabricated as passing:

- Actually calling `getHoldings`/`getWatchlist`/`searchInstruments` against a running Postgres and confirming the returned shapes match `Holding[]`/`WatchlistItem[]`/`Instrument[]` exactly, including the nested `instruments` join resolving as expected (object vs. array — this file defensively normalizes both, but the real shape returned by this Supabase version against this schema has not been observed).
- Confirming `deriveHoldings` output, once fed real DB rows through `getHoldings`, matches hand-computed expectations for a real partial-sell/split sequence (the pure-function math itself was already verified in 02-02; only the DB-row-mapping glue here is unverified).
- Confirming RLS actually rejects a cross-account `instrumentId` reference on insert (e.g., a user trying to `addHolding` against another account's `instrument_id` — the FK will resolve since `instruments` is a shared table, so this specifically tests the `transactions` RLS `WITH CHECK` policy from 02-01, not instrument visibility).
- Confirming the `addToWatchlist` unique-constraint catch (Postgres code `23505`) fires as designed against the real `(account_id, instrument_id)` constraint from 02-01, rather than some other error code/shape.
- Confirming `revalidatePath` actually triggers a re-render of `/`, `/holdings`, `/news` once those pages exist and read from this layer (wave 3, plans 02-05 through 02-07) — this plan only builds the data layer, it does not touch any page.
- This is exercised end-to-end in plan 02-06's checkpoint once a live DB exists, per the plan's own `<verification>` section.

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| A Server Component can fetch a user's holdings (derived, priced-pending) and watchlist in one query per table, joined to instrument display data, with RLS doing the authorization | Code written (`getHoldings`/`getWatchlist`, one `.select()` each, no app-layer permission re-check); live-DB confirmation DEFERRED |
| Adding a holding requires picking a real instrument from the ISIN+exchange master (searchInstruments), not a free-text ticker | `searchInstruments` implemented against `public.instruments`; `addHolding`/`sellHolding`/etc. all take `instrumentId` (FK), never a free-text symbol — enforced at the mutation boundary; live-DB confirmation DEFERRED |
| A SPLIT/BONUS action inserts a price-less ledger row via the same mutation path as BUY/SELL, so deriveHoldings sees it correctly | `recordSplit`/`recordBonus` insert via the same `transactions` table with `price: null`; `getHoldings` feeds all rows (including SPLIT/BONUS) through the same `deriveHoldings` call — code-level correctness confirmed by inspection, live aggregation DEFERRED |
| Every mutation calls revalidatePath so the UI reflects the change without a manual refresh | Confirmed via grep (26 call sites across 8 actions); actual page re-render behavior DEFERRED until pages exist (wave 3) |

## User Setup Required

None — no external service configuration required. (Applying/exercising this layer against a live Supabase project remains DEFERRED per the environment's CODE-ONLY mode, same as Phase 1 and 02-01.)

## Next Phase Readiness

- `src/lib/supabase/portfolio.ts` and `src/server-actions/portfolio.ts` are ready for wave 3 (02-05 through 02-07) to import directly into Server Components and Client Component forms — no further data-layer work is needed before page hydration begins.
- `searchInstruments` is ready to back an instrument-picker UI component (PORT-06 enforcement point).
- Blocker carried forward (not new to this plan): the same live-DB verification debt from Phase 1/02-01/02-02 now also covers this data layer. Nothing here can be runtime-verified until `npx supabase start` (or a hosted project), migrations applied, and real keys captured — tracked in `.planning/STATE.md`.

---
*Phase: 02-schema-persistence-hydration*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: src/lib/supabase/portfolio.ts
- FOUND: src/server-actions/portfolio.ts
- FOUND commit: 748aabf
- FOUND commit: 12b48fd
- `npx tsc --noEmit` re-confirmed clean at self-check time.
- Honest status: live-DB read/write behavior, RLS write-hole enforcement, and revalidatePath's actual page-render effect remain DEFERRED/unverified (no fabrication).
