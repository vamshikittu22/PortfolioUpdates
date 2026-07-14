---
phase: 01-auth-rls-foundation
plan: 03
subsystem: auth
tags: [supabase, auth, proxy, middleware, getUser, login, signout, nextjs16]
mode: code-only / defer-verification

requires:
  - phase: 01-01
    provides: local Supabase config + env scaffolding (placeholder keys) for the browser/server clients to read
provides:
  - src/proxy.ts — Next.js 16 proxy that refreshes the session and revalidates via getUser() (AUTH-02)
  - src/app/login/page.tsx — real Supabase email/password sign-in + sign-up (AUTH-01)
  - src/app/auth/signout/route.ts — server-side signOut endpoint (AUTH-03)
  - src/app/(dashboard)/layout.tsx — real getUser() email + supabase.auth.signOut() logout
affects: [all-authenticated-routes, phase-2-portfolio, api-route-guards]

tech-stack:
  patterns:
    - session validated server-side via supabase.auth.getUser() (network-revalidated), never trusting the raw cookie
    - Next.js 16 proxy.ts replaces the legacy middleware.ts for session refresh
    - browser client created once via useState(() => createClient()) to keep effect deps stable

key-files:
  created:
    - src/proxy.ts
    - src/app/auth/signout/route.ts
  modified:
    - src/app/login/page.tsx
    - src/app/(dashboard)/layout.tsx

key-decisions:
  - "Migrated legacy middleware.ts to Next.js 16 proxy.ts (this repo is NOT standard Next.js — proxy conventions differ from mainline). Session refresh + getUser() revalidation live in the proxy."
  - "Demo auth fully removed: no abc@g.com fallback, no sign-up-disabled block, no foliointel-session cookie anywhere in src/ (grep-verified 0 matches)."
  - "Interactive browser verification (login/refresh/logout/forged-cookie rejection) DEFERRED to plan 01-04's human-verify — no live Supabase (no Docker / placeholder keys)."

patterns-established:
  - "getUser()-first: server-side revalidation immediately after createServerClient in the proxy; unauthenticated requests redirect to /login."
  - "Logout is real: supabase.auth.signOut() (client) plus a server-side POST /auth/signout route."

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

duration: ~15min
completed: 2026-07-14
---

# Phase 1 Plan 03: Real Email/Password Auth Flow Summary

**Replaced the demo auth (abc@g.com / disabled sign-up / foliointel-session cookie) with real Supabase Auth: email/password sign-in + sign-up on the login page, a Next.js 16 proxy that refreshes the session and revalidates via getUser(), a real getUser()-sourced email in the dashboard, and both client and server-side signout paths. Code authored and committed; interactive browser verification DEFERRED (no live Supabase).**

## Performance

- **Duration:** ~15 min (interrupted by session limit before the SUMMARY/STATE step; finalized by orchestrator)
- **Completed:** 2026-07-14
- **Tasks:** 3 (all code authored + committed)

## Done — code authored, filesystem/static-verified

1. **AUTH-02 — proxy session refresh + getUser() revalidation** (`src/proxy.ts`, commit `6d3020f`)
   - Migrated legacy `middleware.ts` → Next.js 16 `proxy.ts`.
   - Refreshes the Supabase session and calls `supabase.auth.getUser()` server-side immediately after `createServerClient` — the session is trusted only when getUser() validates it. Unauthenticated requests redirect to `/login`.

2. **AUTH-01 — real email/password login + signup** (`src/app/login/page.tsx`, commit `e56e3d2`)
   - Uses `supabase.auth.signInWithPassword` and `signUp` via the browser client from `@/utils/supabase/client`.
   - Demo `abc@g.com` credentials and the sign-up-disabled block removed.

3. **AUTH-03 — logout, both paths** (`src/app/auth/signout/route.ts` + `src/app/(dashboard)/layout.tsx`, commit `39f7843`)
   - Server-side `POST /auth/signout`: getUser()-guarded `supabase.auth.signOut()`, redirects to `/login` (303).
   - Dashboard layout: real `supabase.auth.getUser()` email (no mock fallback), `handleLogout` calls `supabase.auth.signOut()`; the `foliointel-session` cookie read/delete removed.
   - Grep-verified: **0** occurrences of `foliointel-session` or `abc@g.com` remain in `src/`.

## Task Commits

1. **Task 1: middleware → proxy migration** — `6d3020f`
2. **Task 2: real login/signup page** — `e56e3d2`
3. **Task 3: signout route + dashboard layout** — `39f7843` (committed by orchestrator after the executor was cut off by the session limit)

## DEFERRED / Unverified (blocked on a live DB + browser)

Per the coordinator's CODE-ONLY / DEFER-VERIFICATION decision — no live Supabase (no Docker, `.env.local` placeholders). Nothing below was executed; nothing fabricated.

- **Interactive sign up / log in NOT exercised** — real credentials cannot authenticate against placeholder Supabase env.
- **"Refresh stays logged in only when getUser() validates" NOT runtime-verified** — structurally implemented in the proxy; browser proof DEFERRED.
- **Forged-cookie rejection NOT runtime-verified** — DEFERRED to plan 01-04 human-verify.
- **Logout end-to-end NOT runtime-verified** — code paths present (client + server); browser proof DEFERRED.

### Must-Have Truths status

| Truth | Status |
| ----- | ------ |
| User can sign up and log in with email/password via Supabase Auth | Code authored (signInWithPassword/signUp); runtime DEFERRED |
| Demo abc@g.com creds, sign-up-disabled block, and foliointel-session cookie no longer exist anywhere | Verified (grep: 0 matches in src/) |
| Refreshed browser stays logged in only when getUser() validates server-side | Code authored (proxy getUser()); runtime DEFERRED |
| User can log out from any page, clearing the Supabase session | Code authored (client signOut + server route); runtime DEFERRED |

## Deviations from Plan

**1. [Coordinator decision] CODE-ONLY / DEFER-VERIFICATION mode** — no browser/live-auth run; runtime proofs DEFERRED to plan 01-04.

**2. [Environment] Session limit + commit-classifier outage** — the executor completed all Task 3 code but was terminated by the session limit before committing the tail or writing this SUMMARY. The orchestrator committed the tail (`39f7843`) and authored this SUMMARY from the verified working-tree diff. No code lost.

## Next Phase Readiness

- The real auth surface (login, proxy revalidation, signout) is in place for plan 01-04 to gate `/api/settings/keys` and run the consolidated human-verify.
- Carried-forward DEFERRED (must clear before Phase 1 verification passes): live Supabase + real keys, then browser E2E — sign up, log in, refresh persistence, forged-cookie rejection, log out.

---
*Phase: 01-auth-rls-foundation*
*Completed: 2026-07-14*
