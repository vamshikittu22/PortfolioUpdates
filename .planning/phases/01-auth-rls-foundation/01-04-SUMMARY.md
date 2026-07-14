---
phase: 01-auth-rls-foundation
plan: 04
subsystem: auth
tags: [supabase, auth, getUser, api-route, 401, settings]
mode: code-only / defer-verification

requires:
  - phase: 01-02
    provides: service-role admin client + RLS isolation test (context for the auth surface)
  - phase: 01-03
    provides: real Supabase auth (proxy getUser() validation, login/signout) the gate relies on
provides:
  - src/app/api/settings/keys/route.ts — getUser() 401 gate on GET and POST (AUTH-06)
affects: [settings-ui, api-route-guards]

key-files:
  modified:
    - src/app/api/settings/keys/route.ts

key-decisions:
  - "Added requireUser() helper (createClient from @/utils/supabase/server + getUser()); both GET and POST return 401 before their logic when there is no user."
  - "Existing fs-based .env.local write logic left untouched and marked as deferred debt (per-user encrypted storage / Supabase Vault) — this plan only gates access, per plan Task 1."
  - "Task 2 (six-step human-verify E2E) DEFERRED — requires a live Supabase + browser; no Docker / placeholder keys."

patterns-established:
  - "API-route auth guard: `if (!(await requireUser())) return new Response(null, { status: 401 })` at the top of each handler."

requirements-completed: [AUTH-06]

duration: ~8min
completed: 2026-07-14
---

# Phase 1 Plan 04: Settings Endpoint Gate + Auth E2E Summary

**Gated `/api/settings/keys` behind `getUser()` — both GET and POST return 401 when unauthenticated (AUTH-06), authenticated behavior unchanged. Code authored, committed, and typecheck-verified. The six-step browser human-verify (Task 2) is DEFERRED — no live Supabase.**

## Performance

- **Duration:** ~8 min (executed by orchestrator; session limit blocked spawning a fresh executor)
- **Completed:** 2026-07-14
- **Tasks:** 2 (Task 1 code done; Task 2 human-verify DEFERRED)

## Done — code authored, static-verified

1. **AUTH-06 — settings endpoint gate** (`src/app/api/settings/keys/route.ts`, commit `d79c746`)
   - `requireUser()` helper: `createClient()` from `@/utils/supabase/server` → `supabase.auth.getUser()` → returns the user (or null).
   - `GET()`: `if (!(await requireUser())) return new Response(null, { status: 401 })` before the provider-flags JSON.
   - `POST()`: same guard before the existing key-write logic.
   - Deferred-debt comment added: keys remain global + written to `.env.local` via fs; move to per-user encrypted storage / Supabase Vault later. This phase only gates access.
   - **Verified:** `grep` confirms `getUser`/`requireUser` in both handler paths and `401` in both; `npx tsc --noEmit` passes clean across the whole project.

## DEFERRED / Unverified (blocked on a live DB + browser)

Per the coordinator's CODE-ONLY / DEFER-VERIFICATION decision. Nothing below was executed; nothing fabricated.

- **Task 2 — six-step human-verify E2E DEFERRED.** Requires `npx supabase status` (running stack) + `npm run dev` + a browser. The steps to run once a DB + real keys exist:
  1. Sign up at `/login` → lands on dashboard.
  2. Log out → redirect to `/login`.
  3. Log in → dashboard, profile shows real email (not `abc@g.com`).
  4. Refresh → stays logged in.
  5. Forge an `sb-...-auth-token` cookie → bounced to `/login` (getUser() rejects it).
  6. `curl -i http://127.0.0.1:3000/api/settings/keys` with no session → HTTP 401.
- **Runtime 401 NOT exercised** — the gate is structurally correct and typechecks; the actual 401 response was not curl-verified against a running server.

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| /api/settings/keys returns 401 for unauthenticated GET and POST | Code authored + static-verified (grep + tsc); runtime curl DEFERRED |
| Authenticated user still gets provider-flags and can save keys | Code unchanged behind the gate; runtime DEFERRED |
| Full auth flow works in a browser (sign up, login, refresh, forged-cookie, logout) | DEFERRED — human-verify blocked on live DB |

## Task Commits

1. **Task 1: settings gate** — `d79c746`
2. **Task 2: human-verify** — no code artifact; DEFERRED.

Also committed alongside: `a21a6c4` fix(01-02) — made `scripts/rls-isolation-test.ts` typecheck under the project's tsconfig (replaced `new URL(import.meta.url)` with a `process.cwd()` path) so the deferred isolation test is actually runnable once a DB exists.

## Deviations from Plan

**1. [Coordinator decision] CODE-ONLY / DEFER-VERIFICATION mode** — Task 2 human-verify not run; curl 401 check DEFERRED. No results fabricated.

**2. [Environment] Executed by orchestrator, not a fresh executor** — the session limit (reset 2:40am America/Chicago) blocked spawning a gsd-executor for Wave 3. The change is small and fully specified by the plan, so the orchestrator applied it directly and verified via grep + tsc.

**3. [Bug fix, cross-plan] Fixed a latent type error in 01-02's isolation test** — `npx tsc --noEmit` (run as this plan's verification) surfaced `TS2351` in `scripts/rls-isolation-test.ts`. Fixed so the script typechecks and is genuinely runnable-ready.

## Next Phase Readiness

- The last Phase 1 security hole (AUTH-06) is closed in code.
- **Phase 1 verification cannot pass until the deferred live-DB work is done:** stand up Supabase (Docker `npx supabase start` or a hosted project), apply migrations, write real keys into `.env.local`, then run `npm run test:rls` (must print PASS), `npx supabase db lint` (clean), and the six-step browser E2E above.

---
*Phase: 01-auth-rls-foundation*
*Completed: 2026-07-14*
