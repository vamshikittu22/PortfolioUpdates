# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** The user opens the app (or gets a Telegram message) and immediately knows what's happening with *their* stocks — real holdings, real prices, real news — without digging through noise.
**Current focus:** Phase 4 — CSV Import

## Current Position

Phase: 4 of 7 (CSV Import)
Plan: 4 of 7 in current phase complete (04-01, 04-02, 04-03, 04-04 — all SUMMARY-complete); Phase 3 (03-01 through 03-06) is fully complete per ROADMAP.md.
Status: 04-01/04-02/04-03 CODE-COMPLETE and STATIC-VERIFIED as previously recorded (see Decisions below). 04-04 CODE-COMPLETE and STATIC-VERIFIED: `src/server-actions/import.ts` (previewImport + commitImport) and `next.config.ts` (body-size limit) — the Server Action trust boundary where the pure lib/import pipeline meets Supabase under RLS. Both actions are cookie-bound (never the admin client), re-parse the uploaded File server-side, and commitImport writes atomically (batch insert -> single bulk transactions insert -> compensating delete on failure) with instrument creation ONLY via the find_or_create_instrument SECURITY DEFINER RPC. `npx tsc --noEmit` clean, every plan-specified grep check passes. Live write behavior against the DB remains deferred to 04-07 (04-01's migration not yet pushed).
Last activity: 2026-07-15 — 04-04 (previewImport/commitImport Server Actions + next.config.ts body-size limit) completed, committed as three atomic task commits (79e3ae4 chore, 37e65ed feat, c39c74b feat). Earlier this session: 04-03 (broker parsers + instrument matching + duplicate detection) completed, committed as three atomic TDD commits (chore fixtures/RED/GREEN — no REFACTOR needed); 04-02 (import parsing primitives) completed as four atomic TDD commits; 04-01 (CSV import storage + controlled-write foundation) completed as three atomic commits.

Progress: [████..] ~57% (4/7 plans in Phase 4 code-complete/static-verified: 04-01 storage + controlled-write foundation, 04-02 import parsing primitives, 04-03 broker parsers + matching + dedup, 04-04 previewImport/commitImport Server Actions. See each plan's own SUMMARY for detail.)

### Verification status (rewritten 2026-07-14 after live DB + blocker clearing)

**A live hosted Supabase EXISTS** — project `ozkorwkhtamyaavuphhm`, real credentials in `.env.local` (gitignored). No Docker; Docker is permanently out of scope per user direction.

**CLEARED (genuinely verified against the live DB):**
1. ✅ The 5 Phase 1 + Phase 2 migrations are APPLIED to the live DB.
2. ✅ Real anon + service-role keys are in `.env.local` (no placeholders).
3. ✅ `npm run test:rls` → PASS (cross-user read/write blocked; price_cache/news_items write holes rejected). NOTE: this test was STALE — it referenced the `holdings` table Phase 2 dropped. Rewritten against `transactions`; only found because a live DB finally existed.
4. ✅ Phase 2 UAT 4/4 PASS (dashboard empty state, add holding, **persistence survives F5** — the headline criterion, watchlist add/remove). Seed instruments + `(isin, exchange)` identity confirmed live: INFY resolves distinctly on NSE and NYSE.
5. ✅ `npm run test:derive-holdings` 7/7 and `npm run test:price-pnl` 12/12 (pure logic, no DB needed).
6. ✅ Fabricated-value defects found and fixed: hardcoded Alerts `badge: 3` (3e6d0e5); `MOCK_HOLDINGS` in the YouTube analyze route, which also had NO auth gate (ecf939a).
7. ✅ FX provider fixed — `exchangerate.host` went key-only; swapped to Frankfurter/ECB (no key). Verified live: USD→INR 96.2, INR→USD 0.01039 (self-consistent), bad currency → honest HTTP 404, never a fabricated rate (bac8107).
8. ✅ Branch drift resolved — `master` fast-forwarded to contain all work (rollback point: cbf6b19). 66 commits unpushed to origin.

9. ✅ **Phase 3 schema migration APPLIED** (`price_fx_schema.sql`, 2026-07-14, explicit user consent). `fx_cache` exists; `price_cache` re-keyed to `instrument_id` with nullable price/source + `fetch_error` + `corporate_action_flag`.
10. ✅ **PRICE PIPELINE PROVEN LIVE.** `refreshAllPrices` against the hosted DB returned `{instrumentsConsidered:2, instrumentsFetched:2, succeeded:2, failed:0, fxUpdated:true}`. Real rows landed: `INFY.NSE = 1082.40`, `AAPL.NASDAQ = 317.31` (both `fetch_error: null`, `corporate_action_flag: false`), and `fx_cache USD_INR = 96.2`. Confirms end-to-end: Yahoo fetch for both Indian + US tickers, honest upsert, Frankfurter FX inside the real pipeline, and correct scoping (only held/watchlisted instruments fetched, not all 16 seeds).

**STILL OPEN:**
1. ⛔ **`price_refresh_cron.sql` deliberately NOT applied.** Held back on purpose (not an oversight): it is authored and sitting in `supabase/migrations/` as the only pending migration. Applying it while running locally would schedule a pg_cron job that silently fails every 3 hours, because Supabase's cloud cannot reach `localhost:3000`. Apply it ONLY when deploying — see item 2.
2. ⛔ **PRICE-02 (scheduled refresh) is DEPLOY-GATED, not just migration-gated.** `price_refresh_cron.sql` has Supabase's cloud pg_cron POST via pg_net to the refresh endpoint. Supabase's cloud CANNOT reach `localhost:3000`. The 3-hourly schedule can NEVER be verified locally — it requires deploying to a publicly reachable URL (e.g. Vercel) AND setting the DB config for the endpoint URL + `PRICE_REFRESH_SECRET`. Applying the cron migration while only running locally will schedule a job that silently fails every 3 hours. The on-demand "Refresh now" path IS locally verifiable once migrations land.
3. ⛔ Phase 1 browser auth UAT paused at user direction — 1/7 passed (sign-up→dashboard), 6 outstanding: real email shown, refresh persistence, logout, log back in, forged-cookie rejection, settings 401. NOTE: `/api/settings/keys` 401 and RLS isolation are proven at the API level; only the browser-observable checks are outstanding.
4. ⛔ `npx supabase db lint --level warning` (Security Advisor) never run against the live DB.
5. ⛔ Phase 2 UI round-trips never exercised: partial-sell, split/bonus, edit/delete through the dialogs (the underlying math IS proven by unit tests), research deep-link click-through, YouTube channel persistence.

Resume: all 7 plans in Phase 2 (02-01 through 02-07) are now SUMMARY-complete. A live Supabase now exists and the DEFERRED items above involving the 5 Phase 1/2 migrations (test:rls, test:derive-holdings) are confirmed passing against it. Phase 3 is now underway: plan 03-01 (schema) is code-complete; plan 03-02 also has a SUMMARY from a concurrent run. Next: continue Phase 3 plans 03-03 onward, then push the accumulated new migrations (03-01's two files plus any from later plans) to the live DB with explicit user consent before Phase 3's live-verification checkpoint (03-06).

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 17 min
- Total execution time: ~0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 1 | 4 | 17 min |

**Recent Trend:**
- Last 5 plans: 01-01 (17 min, 3 tasks, 6 files)
- Trend: —

*Updated after each plan completion*

**Plan detail:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 01-01 | 17 min | 3 | 6 |
| Phase 02 P01 | 12min | 3 tasks | 3 files |
| Phase 02 P03 | 12min | 2 tasks | 2 files |
| Phase 02 P02 | 15min | 1 tasks | 5 files |
| Phase 02 P04 | 15min | 2 tasks | 2 files |
| Phase 02 P06 | 25min | 3 tasks | 6 files |
| Phase 02 P07 | 7min | 2 tasks | 3 files |
| Phase 03 P01 | 2min | 3 tasks | 2 files |
| Phase 03 P02 | 10min | 2 tasks | 4 files |
| Phase 03 P03 | 15min | 2 tasks | 2 files |
| Phase 03 P04 | 13min | 3 tasks | 4 files |
| Phase 03 P05 | 20min | 3 tasks | 6 files |
| Phase 04 P01 | 12min | 3 tasks | 2 files |
| Phase 04 P02 | 10min | 1 TDD task (4 sub-commits) | 6 files |
| Phase 04 P03 | 20min | 1 tasks | 7 files |
| Phase 04 P04 | 15min | 3 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 7-phase strict-downward dependency order (auth → schema → prices → import/alerts → news → digest), converged on by all four research files.
- [Roadmap]: Two hardest-to-reverse choices front-loaded — instrument identity is ISIN+exchange (Phase 2) and holdings modeled as a transactions ledger (Phase 2), before import/prices build on them.
- [Roadmap]: ALRT-04 (significant-news Telegram alert) mapped to Phase 6, not Phase 5 — it needs news matching and reuses the Phase 5 outbox.
- [Roadmap]: AI (Gemini) is always a second pass — price/news pipelines must work on raw data before summarization is layered on.
- [Phase 01]: Phase 1 runs in CODE-ONLY / DEFER-VERIFICATION mode: no Docker and no live Supabase, so stack start, live migration apply, and real-key capture are deferred; .env.local holds labeled placeholders.
- [Phase 02]: Continued CODE-ONLY / DEFER-VERIFICATION mode: instruments/transactions/watchlist migrations authored and statically verified only, live apply deferred (no Docker/live Supabase).
- [Phase 02]: Data access layer (02-04): reads via injected SupabaseClient reusing deriveHoldings; 8 Server Actions mutate only via cookie-bound client (never admin), revalidate / /holdings /news
- [Phase 02]: [Phase 02, plan 07]: Research deep-link entry point (WIRE-01) — ticker param read once on mount; useSearchParams() required a Suspense boundary in research/page.tsx, confirmed by running next build.
- [Phase 02]: [Phase 02, plan 06]: Mock portfolio store (usePortfolioStore.ts, mock-portfolio.ts) deleted outright, closing out PORT-07 — layout.tsx uses a static single-account label instead of a fetched name (smaller diff, matches the single-account-per-user scope decision); News/Alerts pages pass honest empty arrays for not-yet-built Phase 5/6 data instead of any mock fallback.
- [Phase 03]: price_cache re-keyed from symbol to instrument_id; price/source made nullable to represent honest never-fetched state
- [Phase 03]: Price ingestion + P&L pure logic isolated in src/lib/prices/* with zero I/O; never-fabricate-a-value discipline (parse failures -> null, unpriced holdings -> status:'pending' with null fields, not 0); proven by npm run test:price-pnl (node:assert/strict, no jest/vitest)
- [Phase 03]: fetchPrices/fetchFXRate (03-03) are pure network wrappers keyed only by symbol/currency-pair strings — no Supabase/instrument_id awareness; caller (03-04) owns symbol->instrument_id mapping and preserving last-known-good fx_cache/price_cache rows on failure
- [Phase 03]: Live finding (03-03): exchangerate.host's free /convert endpoint now returns missing_access_key in production — the "free, no key" FX source assumed in 03-RESEARCH.md is stale. fetchFXRate degrades correctly (honest error, no fabricated rate) but 03-04/later must register a key or swap FX providers before fx_cache can populate for real.
- [Phase 03]: refreshAllPrices (03-04) is the single write path for price_cache/fx_cache, accepts an already-constructed admin client rather than building one itself; cron route (secret-guarded, checked before any Supabase call) and refreshPricesNow Server Action (auth-gated via getUser()) both call it identically. PRICE-03 left Pending — backend done but not yet wired to a UI button (03-05) or live-verified (03-06).
- [Phase 03]: [Phase 03, plan 05] getPortfolioPnL (src/lib/prices/get-portfolio-pnl.ts) is the sole place a Supabase client meets the pure P&L math — reads only (cookie-bound client safe), reuses getHoldings/calculateHoldingPnL/calculatePortfolioTotals unchanged. When a non-base-currency holding exists but no FX rate is cached, that holding is excluded from the cross-currency portfolio total (never converted at a fabricated 1:1) while its own row still shows real native price/P&L. PRICE-03/PRICE-04 left Pending — UI wiring (RefreshPricesButton, StalenessBadge) is code-complete but live rendering against real cached rows is deferred to 03-06 (migrations not yet pushed).
- [Phase 04, plan 01]: One new migration (`supabase/migrations/20260715230011_csv_import.sql`) is the only schema/RLS-posture-touching plan in Phase 4 — import_batches + symbol_mappings (account-ownership RLS, identical EXISTS-subquery shape to transactions), transactions.import_batch_id/import_row_hash + partial UNIQUE idempotency index, and find_or_create_instrument SECURITY DEFINER RPC as the sole controlled write path into the closed instruments table (authenticated-only, no admin client, no permissive INSERT policy). file_hash on import_batches deliberately left non-unique — idempotency enforcement lives at the row level via the partial index. scripts/rls-isolation-test.ts extended to cover both new tables; typechecks clean. Live migration apply + live test:rls run explicitly DEFERRED to 04-07 (matches the Phase 2/3 CODE-COMPLETE/STATIC-VERIFIED pattern); confirmed the deferred state is real by actually running npm run test:rls against the live hosted DB and getting an honest "table not found" failure, not a placeholder-credentials skip.
- [Phase 04, plan 02]: `src/lib/import/*` is a zero-I/O pure layer (types.ts + normalize.ts + row-hash.ts + detect-broker.ts), TDD'd via `scripts/import-primitives-test.ts` (node:assert/strict, no jest/vitest — same pattern as price-pnl-test.ts). Every normalization function returns `null` on unparseable input, never a fabricated `0` (project's cardinal sin per 04-RESEARCH). `computeRowHashes` hashes normalized strings (not raw floats) with a 1-based occurrence index, proven stable across repeated calls and drift-free against float round-tripping — the IMPT-05 idempotency linchpin. `xlsx` pinned to SheetJS's CDN tarball 0.20.3 (confirmed via `node_modules/xlsx/package.json`, zero `0.18.5` references in package-lock.json — the npm-registry version carries open CVEs). Both `test:import-primitives` and `test:import-parse` npm scripts registered now so 04-03 (parsers) needs no `package.json` edit.
- [Phase 04, plan 03]: `src/lib/import/{parse-groww,parse-robinhood,match-instruments,detect-duplicates}.ts` complete the pure import pipeline (zero I/O). `parseGroww` header-scans (never positional) and models each equity holding as ONE synthetic opening BUY, preserving cost basis exactly through `deriveHoldings` (proven by test, not just claimed) — MF (`INF...`) rows reported `unsupported`, an unrecognizable sheet throws `ImportParseError` echoing the first rows seen. `parseRobinhood` is header-name-driven (proven identical across 9- and 11-column fixtures), maps Buy/Sell/SPL to ledger txn types, routes every other Trans Code to `unsupported` with a reason. `matchInstruments` implements the locked broker-disambiguation decision (Groww ISIN auto-picks NSE>BSE, Robinhood ticker filtered to US exchanges+USD auto-picks NASDAQ>NYSE>OTHER, saved mapping short-circuits both). `detectDuplicates` implements hash/field-match/Groww-already-held rules in priority order. `scripts/import-parse-test.ts` (7 case groups, node:assert/strict) proves all of it against synthetic fixtures (`scripts/fixtures/groww-holdings-sample.xlsx`, `robinhood-activity-sample.csv`) — `npm run test:import-parse` passes, re-run twice for identical output, `npx tsc --noEmit` clean. TDD'd as 3 commits (chore fixtures / RED stubs+test / GREEN real implementation) — no REFACTOR needed. IMPT-01/IMPT-02/IMPT-04/IMPT-05 re-confirmed Complete; IMPT-03 deliberately left Pending — this plan supplies the validation/dedup machinery IMPT-03 needs, but the actual preview flow (Server Action + UI with skip/override) is 04-04 through 04-06's scope, not yet built.
- [Phase 04]: [Phase 04, plan 04] previewImport/commitImport Server Actions are thin orchestrators over the pure lib/import pipeline; commitImport hashes only the final imported subset (not the full eligible set), so a forced re-import of duplicates collides with the partial unique index as intended

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- REQUIREMENTS.md header stated "36 total" but the enumerated v1 IDs total **39** (AUTH 6, PORT 7, PRICE 7, IMPT 5, NEWS 5, ALRT 5, DGST 2, WIRE 2). Traceability count corrected to 39/39; header wording left for the user to confirm.
- [Phase 03, plan 03] exchangerate.host's free FX endpoint now requires a paid access key (`missing_access_key` error confirmed live) — 03-RESEARCH.md's "free, no key" assumption is stale. Must be resolved (API key or provider swap, e.g. Frankfurter/open.er-api.com) before 03-06's live FX refresh can populate `fx_cache` end-to-end. Does not block 03-03/03-04 (honest-failure contract fully met in both — refreshAllPrices records fetch_error and preserves the last-known-good rate, never blocks price refresh on FX failure).
- [Phase 03, plan 04] `refreshPricesNow` Server Action exists and is statically verified but has no UI caller yet (grep confirms zero references outside `src/server-actions/prices.ts`) — wiring a "refresh now" button is 03-05's scope. PRICE-03 left Pending in REQUIREMENTS.md accordingly.
- [Phase 03, plan 05] `RefreshPricesButton`/`StalenessBadge`/`getPortfolioPnL` are now code-complete and statically verified (tsc clean, greps confirm wiring), but zero live rendering has occurred — 03-01's two migrations remain unpushed, so `price_cache`/`fx_cache` cannot be queried against the new schema shape yet. PRICE-03 and PRICE-04 both left Pending in REQUIREMENTS.md; live verification is 03-06's scope.
- Research flags for phase-time verification: Vercel Hobby function-duration + pg_cron→pg_net ergonomics (Phase 3), Groww XLSX / Robinhood CSV real layouts (Phase 4), exact Gemini free-tier RPD + Finnhub US-only (Phase 6).
- [RESOLVED via decision] Plan 01-01 Task 3 was blocked by missing Docker. Superseded by the CODE-ONLY / DEFER-VERIFICATION decision — no Docker/live DB used. DEFERRED work carried forward: `supabase start`, applying migrations against a live DB, verifying RLS enforcement, and capturing real anon/service-role keys. Must be done before Phase 1 verification can pass.
- [Phase 04, plan 01] `supabase/migrations/20260715230011_csv_import.sql` is authored and statically verified but NOT yet pushed to the live hosted DB — `find_or_create_instrument` cannot be called live and `npm run test:rls`'s new import_batches/symbol_mappings checks cannot pass until 04-07's live-apply checkpoint (explicit user consent required, matching the 03-01→03-06 pattern). IMPT-04/IMPT-05 marked Complete in REQUIREMENTS.md in the code-complete/static-verified sense used throughout this project; live-behavior confirmation is 04-07's scope.
- Pre-existing uncommitted working-tree changes unrelated to Phase 4 were observed at the start of this session (`.planning/REQUIREMENTS.md` PORT-08/PORT-09 additions and a "Phase 3.1" reference, plus modified `src/components/dashboard/HoldingFormDialog.tsx`/`HoldingsTable.tsx`, `src/lib/supabase/portfolio.ts`, `src/lib/types.ts`, `src/server-actions/portfolio.ts`, and untracked `src/components/dashboard/LotEditDialog.tsx`). These were left untouched and uncommitted by 04-01's executor — out of scope for this plan. Whoever owns that work should commit or stash it separately.

## Session Continuity

Last session: 2026-07-15
Stopped at: 04-04 (previewImport/commitImport Server Actions + next.config.ts body-size limit) completed and SUMMARY-complete. `src/server-actions/import.ts` created with `previewImport` (re-derives file bytes/hash server-side, detects/accepts an override broker, parses via the pure lib, loads instrument universe + saved mappings + dedup inputs in parallel, returns a full classified ImportPreview, writes nothing) and `commitImport` (re-parses the same file, resolves user mapping/create choices via the find_or_create_instrument RPC only, re-runs matching + dedup, writes atomically with a compensating batch delete on insert failure, persists resolved mappings non-fatally, revalidates `/` and `/holdings`). Neither action imports the admin client; both share a `requireAuthedContext` helper copied from `src/server-actions/portfolio.ts`'s pattern. `next.config.ts` raises `experimental.serverActions.bodySizeLimit` to `'4mb'`. `npx tsc --noEmit` clean, every plan-specified grep check passes. Committed as three atomic task commits (79e3ae4 chore, 37e65ed feat previewImport, c39c74b feat commitImport). IMPT-01 through IMPT-05 marked Complete in REQUIREMENTS.md (code-complete/static-verified sense). Live write behavior (compensating delete firing, partial unique index rejecting a forced duplicate re-commit, find_or_create_instrument creating a real instrument) is explicitly DEFERRED to 04-07 — 04-01's migration is still not pushed to the live DB. Next: 04-05 (import preview UI) can now call previewImport directly — check 04-05-PLAN.md's depends_on field before starting.
Previously stopped at: 04-03 (broker parsers + instrument matching + duplicate detection) completed and SUMMARY-complete. `src/lib/import/{parse-groww,parse-robinhood,match-instruments,detect-duplicates}.ts` + `scripts/import-parse-test.ts` + synthetic fixtures (`scripts/fixtures/groww-holdings-sample.xlsx`, `robinhood-activity-sample.csv`) — full TDD cycle (chore fixtures -> RED stubs+failing test -> GREEN real implementation; no REFACTOR needed), all 7 case groups passing, `npx tsc --noEmit` clean, re-run twice for identical output (purity proven). Committed as three atomic commits (f7cb477 chore, 8286d06 test, b20f619 feat). IMPT-01/IMPT-02/IMPT-04/IMPT-05 re-confirmed Complete in REQUIREMENTS.md; IMPT-03 deliberately left Pending (this plan supplies the validation/dedup machinery but the actual preview flow is 04-04 through 04-06's scope). Next: 04-04 (previewImport/commitImport Server Actions) can now build directly on this pure pipeline plus 04-01's schema — check 04-04-PLAN.md's depends_on field before starting. Earlier this session: 04-02 (import parsing primitives) completed and SUMMARY-complete, executed concurrently with 04-01 in this same session on disjoint files. `src/lib/import/{types,normalize,row-hash,detect-broker}.ts` + `scripts/import-primitives-test.ts` — full TDD cycle (Setup install -> RED -> GREEN -> REFACTOR), all 6 case groups passing, `npx tsc --noEmit` clean, re-run twice for identical output (purity proven). `xlsx` pinned to SheetJS CDN tarball 0.20.3, `papaparse`/`@types/papaparse` installed, both import npm scripts registered. Committed as four atomic commits (10734e7 chore, 06a2749 test, 909e8f3 feat, 1f8c55a refactor). IMPT-01/IMPT-02/IMPT-05 marked Complete in REQUIREMENTS.md in the code-complete/static-verified sense (this plan has zero DB/network dependency by design). Also this session: 04-01 (CSV import storage + controlled-write foundation) completed and SUMMARY-complete. One new migration (`supabase/migrations/20260715230011_csv_import.sql`): import_batches + symbol_mappings tables (account-ownership RLS), transactions.import_batch_id/import_row_hash + partial idempotency index, find_or_create_instrument SECURITY DEFINER RPC. scripts/rls-isolation-test.ts extended for the two new tables. All statically verified (tsc clean, migration greps pass, git diff --stat confirms one new file / zero existing migrations touched); live apply + live test:rls deferred to 04-07. IMPT-04/IMPT-05 marked Complete in REQUIREMENTS.md. Committed as three atomic task commits (2d2321a, 5d27e40, e192909). Next: continue Phase 4 with the next unblocked plan per ROADMAP.md's wave ordering (check 04-*-PLAN.md depends_on fields — 04-03's parser plan can now build on both 04-01's schema and 04-02's primitives). Earlier this session: Phase 4 context gathered via /gsd:discuss-phase (04-CONTEXT.md), then /gsd:plan-phase 4 produced all 7 plans across 6 waves (0163a17). Previous session (2026-07-14): Completed 03-05 (Dashboard/Holdings pricing UI). `getPortfolioPnL` (src/lib/prices/get-portfolio-pnl.ts) combines Phase 2's getHoldings with price_cache/fx_cache reads and 03-02's pure calculateHoldingPnL/calculatePortfolioTotals — the sole place a Supabase client meets the P&L math, read-only, cookie-bound client. Dashboard and Holdings pages render real price/day-change/total-change gated on status==='priced' (Phase 2's em-dash pending path preserved, now correctly conditional), a shared StalenessBadge (fresh/stale/very-stale/error/pending) per row, a corporate-action warning pill that never hides the row, and an FX-breakdown-visible portfolio total that excludes non-base holdings from the aggregate (rather than fabricating a 1:1 conversion) when no FX rate is cached. RefreshPricesButton client island wired into holdings/page.tsx calls refreshPricesNow (03-04); relies on that action's existing revalidatePath, confirmed against this Next.js version's docs and Phase 2's own server-actions/portfolio.ts precedent — no manual router.refresh() needed. `npx tsc --noEmit` clean, `npm run test:price-pnl` (12/12) and `npm run test:derive-holdings` (7/7) both still pass unchanged. No live Supabase call was made — 03-01's two migrations remain unpushed, so none of this UI has rendered against real cached data yet. PRICE-03 and PRICE-04 intentionally left Pending in REQUIREMENTS.md (code-complete, live-verification deferred to 03-06). Previously: 03-04 (refreshAllPrices orchestration + secret-guarded POST /api/prices/refresh route + refreshPricesNow Server Action), 03-03 (fetchPrices + fetchFXRate network wrappers, surfaced the exchangerate.host missing_access_key issue — see Blockers/Concerns), 03-01 (fx_cache + price_cache re-key + pg_cron scheduling migrations, authored/statically verified, live push still deferred), 03-02 (price ingestion + P&L pure logic layer, fully TDD'd and passing).
Resume file: .planning/phases/04-csv-import/04-CONTEXT.md
