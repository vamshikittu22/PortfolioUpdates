# Deferred Items — Phase 7 (Daily Digest)

## 07-01: Transient tsc error from concurrent 07-02 executor (out of scope)

**Observed during:** Task 3 (`npx tsc --noEmit` verification) of 07-01.

**Issue:** `npx tsc --noEmit` reported errors in `scripts/digest-compose-test.ts`:
- `Cannot find module '../src/lib/digest/compose'`
- `Cannot find module '../src/lib/digest/types'`
- Several `implicitly has an 'any' type` on parameter `m`

**Cause:** A concurrent 07-02 executor (owns `src/lib/digest/*` + `package.json` +
presumably `scripts/digest-compose-test.ts` per this session's disjoint-file wave
plan) has this file mid-flight, referencing modules it has not yet created.

**Scope check:** 07-01 owns only `supabase/migrations/*` (two new digest files)
and `scripts/rls-isolation-test.ts`. `scripts/digest-compose-test.ts` and
`src/lib/digest/*` are untouched by this plan. Confirmed via
`npx tsc --noEmit 2>&1 | grep -i "rls-isolation"` returning no matches — this
plan's own file (`scripts/rls-isolation-test.ts`) is clean.

**Action:** Not fixed (out of scope per the executor scope-boundary rule).
Logged here, matching the STATE.md precedent (05-06's transient `DispatchSummary`
observation from a concurrent 05-05 executor, which self-resolved once that
executor completed). Expected to self-resolve once 07-02 finishes.
