---
phase: 01-auth-rls-foundation
plan: 02
subsystem: auth
tags: [supabase, rls, service-role, isolation-test, tsx, security]
mode: code-only / defer-verification

requires:
  - phase: 01-01
    provides: RLS-fix migration (price_cache/news_items write-holes dropped), server-only SUPABASE_SERVICE_ROLE_KEY env scaffolding, handle_new_user default-account trigger
provides:
  - src/utils/supabase/admin.ts — server-only service-role admin client (AUTH-05)
  - scripts/rls-isolation-test.ts — runnable two-user RLS isolation + shared-table write-hole proof (AUTH-04)
  - package.json test:rls script + tsx dev dependency
affects: [price-pipeline, news-pipeline, cron-jobs, phase-2-portfolio]

tech-stack:
  added:
    - tsx ^4.20.6 (dev, TypeScript script runner for test:rls)
    - server-only ^0.0.1 (build-time guard for admin client)
  patterns:
    - service-role client is a distinct @supabase/supabase-js factory (never @supabase/ssr) so a user cookie can never override it
    - RLS proven through the real anon-key + JWT request path (two-client Node script), not app redirect logic
    - shared-table writes (price_cache/news_items) reserved for service role; authenticated users are SELECT-only

key-files:
  created:
    - src/utils/supabase/admin.ts
    - scripts/rls-isolation-test.ts
  modified:
    - package.json (test:rls script + tsx + server-only deps)

key-decisions:
  - "Isolation test loads .env.local via an inline parser (self-contained) so `npm run test:rls` works on any Node version without extra flags."
  - "Test authored to run against a live local stack but NOT executed — no Docker / no live Supabase (CODE-ONLY / DEFER-VERIFICATION). Isolation-proof truths and AUTH-04/AUTH-05 runtime verification are DEFERRED."

patterns-established:
  - "Three-client rule enforced: admin client is server-only and cookie-free."
  - "RLS write-hole regression guard: authenticated INSERT into price_cache/news_items must error (code 42501)."

requirements-completed: [AUTH-04, AUTH-05]

duration: 12min
completed: 2026-07-14
---

# Phase 1 Plan 02: Service-Role Admin Client + RLS Isolation Proof Summary

**Server-only service-role admin client (createAdminClient, supabase-js, persistSession:false) plus a runnable two-user RLS isolation + price_cache/news_items write-hole proof script wired as `npm run test:rls`. Code authored and committed; live-DB verification DEFERRED (no Docker / no live Supabase).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-14T03:50:50Z
- **Completed:** 2026-07-14
- **Tasks:** 3 (2 code, 1 doc/verification — verification portion deferred)
- **Files modified/created:** 3 (admin.ts, rls-isolation-test.ts, package.json)

## Done — code authored, filesystem-verified

1. **AUTH-05 — service-role admin client** (`src/utils/supabase/admin.ts`)
   - `createAdminClient()` built on `createClient` from `@supabase/supabase-js` (NOT `createServerClient` from `@supabase/ssr`), so a user cookie session can never override the service role (research Pitfall #2 / project Pitfall #5).
   - `import 'server-only'` first line → any accidental client-side import fails the build; the browser can never receive the client or the `SUPABASE_SERVICE_ROLE_KEY`.
   - `{ auth: { autoRefreshToken: false, persistSession: false } }`.
   - Uses `process.env.NEXT_PUBLIC_SUPABASE_URL!` + `process.env.SUPABASE_SERVICE_ROLE_KEY!`.
   - Doc comment marks it as RLS-BYPASSING, cron/admin-only.
   - `server-only` package installed. Grep-verified: `server-only`, `@supabase/supabase-js`, `persistSession: false` all present.

2. **AUTH-04 — two-user isolation + write-hole test** (`scripts/rls-isolation-test.ts`)
   - Anon-key-only; two independent authed sessions (real JWTs) via `signUp` (ignore-exists) → `signInWithPassword`.
   - User A reads its trigger-created `investment_accounts` row and inserts an INFY holding.
   - Asserts: B reads 0 holdings (`RLS read leak`), B insert into A's account errors (`RLS write leak`), authenticated INSERT into `price_cache` errors (`price_cache write hole open`), authenticated INSERT into `news_items` errors (`news_items write hole open`).
   - Sanity: authenticated SELECT on both shared tables must still succeed (read policies kept).
   - Prints `PASS: cross-user read/write blocked and price_cache/news_items writes rejected` and exits 0 on success; throws + non-zero on any failure.
   - Guards against placeholder env: exits with a clear message if URL/anon key are missing or still `PLACEHOLDER_*`.

3. **Runner wiring** (`package.json`)
   - `"test:rls": "tsx scripts/rls-isolation-test.ts"` added.
   - `tsx` added as devDependency; `server-only` added as dependency.

## DEFERRED / Unverified (blocked on a live DB)

Per the coordinator's CODE-ONLY / DEFER-VERIFICATION decision, nothing below was executed and no result was fabricated. There is no Docker and `.env.local` holds placeholders only.

- **`npm run test:rls` NOT run** — the script is authored and ready but was not executed against a live stack. It cannot pass while `.env.local` holds placeholder URL/anon key.
- **AUTH-04 isolation-proof truths DEFERRED** — that a second user actually cannot read/write the first user's holdings is not runtime-verified.
- **Shared-table write-hole runtime proof DEFERRED** — that authenticated INSERTs into `price_cache`/`news_items` are actually rejected (code 42501) is not runtime-verified; only the structural fix (dropped policies, plan 01-01) plus this runnable guard exist.
- **AUTH-05 runtime behavior DEFERRED** — that the admin client bypasses RLS and is not cookie-overridden is not runtime-verified (structurally correct by construction).
- **Task 3 — `npx supabase db lint` / Security Advisor NOT run** — requires a running local stack (Docker). No advisor output captured; success criterion 5 ("Security Advisor clean") remains DEFERRED. The durable proof artifact (`scripts/rls-isolation-test.ts`) is in place to satisfy it once a DB exists.

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| Dedicated service-role admin client that bypasses RLS and is never importable into the browser | Code authored + filesystem-verified (`server-only` guard); runtime bypass DEFERRED |
| Service-role client built from @supabase/supabase-js (not @supabase/ssr) so a user cookie can never override it | Code authored + verified (grep) |
| A second user cannot READ the first user's holdings rows | Test authored; runtime proof DEFERRED (no live DB) |
| A second user cannot WRITE into the first user's account | Test authored; runtime proof DEFERRED (no live DB) |
| Authenticated user cannot INSERT into price_cache or news_items | Test authored; runtime proof DEFERRED (no live DB) |

## Task Commits

1. **Task 1: service-role admin client** — folded into `6d3020f` (see Deviation 1 — concurrent-executor index race). admin.ts + `server-only` dep landed in history under a neighboring 01-03 commit rather than a dedicated 01-02 commit.
2. **Task 2: isolation test + runner** — `PENDING_TASK2_HASH`
3. **Task 3: security advisor** — no code artifact (doc-only); advisor run DEFERRED, recorded here.

## Files Created/Modified

- `src/utils/supabase/admin.ts` — server-only service-role client factory (AUTH-05).
- `scripts/rls-isolation-test.ts` — two-user RLS isolation + shared-table write-hole proof (AUTH-04).
- `package.json` — `test:rls` script, `tsx` devDependency, `server-only` dependency.

## Decisions Made

- Inline `.env.local` parsing inside the test script (self-contained, no `--env-file` flag dependency).
- Manually added `tsx`/`test:rls` to `package.json` (deterministic) rather than relying solely on `npm install` during a concurrent-writer window.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `import 'server-only'` from the test script (self-caught)**
- **Found during:** Task 2 (writing scripts/rls-isolation-test.ts)
- **Issue:** I initially added `import 'server-only'` to the standalone script. The `server-only` package throws when imported outside a React Server bundler; under `tsx`/plain Node it would crash `npm run test:rls` immediately.
- **Fix:** Removed the import — that guard belongs only in the Next.js `admin.ts` module, not a Node script.
- **Files modified:** scripts/rls-isolation-test.ts
- **Verification:** Static review; runtime run DEFERRED (no live DB).
- **Committed in:** Task 2 commit.

### Environment / process deviations

**2. [Coordinator decision] CODE-ONLY / DEFER-VERIFICATION mode**
- Task 2's `npm run test:rls` run and Task 3's `supabase db lint` were NOT executed (no Docker, `.env.local` placeholders). No results fabricated. All runtime proofs DEFERRED to when a DB exists.

**3. [Environment] Concurrent-executor index race folded Task 1 into commit `6d3020f`**
- **Found during:** Task 1 commit
- **Issue:** A parallel wave executor (plan 01-03, middleware→proxy migration) was committing to the same working tree/index concurrently. When it ran `git commit`, my staged `admin.ts` + `server-only` package.json change were swept into its commit `6d3020f` ("feat(01-03): migrate middleware to proxy...") instead of a dedicated 01-02 commit. An earlier stray commit of mine that had accidentally included the other agent's staged middleware deletions was undone via `git reset --soft` before the race resolved.
- **Impact:** Code is correct and present in history (admin.ts in HEAD, `server-only` in package.json); only the commit attribution is imperfect. No code lost, no history rewrite attempted (would race the live concurrent writer). Subsequent commits use `git commit -- <paths>` (worktree-scoped) to avoid re-sweeping the shared index.
- **Files affected:** src/utils/supabase/admin.ts, package.json, package-lock.json.

---

**Total deviations:** 3 (1 self-caught bug, 1 coordinator-mode, 1 environment/concurrency).
**Impact on plan:** No scope creep. All planned code authored. Runtime verification honestly DEFERRED.

## Issues Encountered

- **Concurrent executor sharing the working tree** — see Deviation 3. Mitigated by pathspec-scoped commits.
- **Bash classifier intermittently unavailable** — some `npm install` / commit steps were retried; package.json edits applied deterministically via the editor to stay resilient.

## User Setup Required

None new. Live verification of this plan (and the deferred plan-01 items) requires: Docker Desktop running, `npx supabase start`, real anon/service-role keys written into `.env.local`, then `npm run test:rls` (must print PASS) and `npx supabase db lint --level warning` (must be clean on the shared tables).

## Next Phase Readiness

- AUTH-05 admin client is ready for future cron/price/news jobs.
- AUTH-04 proof artifact is ready to run the moment a live DB + real keys exist — it is the phase's key verification gate.
- Carried-forward DEFERRED work (must clear before Phase 1 verification passes): start the local stack, apply migrations, capture real keys, run `test:rls` (green) and `supabase db lint` (clean).

---
*Phase: 01-auth-rls-foundation*
*Completed: 2026-07-14*
