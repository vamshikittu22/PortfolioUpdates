# Phase 1: Auth + RLS Foundation - Research

**Researched:** 2026-07-13
**Domain:** Supabase Auth (email/password) + Postgres Row-Level Security + Next.js 16 App Router SSR auth
**Confidence:** HIGH on stack, codebase state, and RLS fixes (read directly from source); HIGH on the Next.js `middleware`→`proxy` rename (verified in installed docs); MEDIUM on `getClaims()` vs `getUser()` currency (verify against local instance)

## Summary

This phase replaces a fake, forgeable cookie login with real Supabase Auth and makes Row-Level Security actually protect per-user data — verified by a runnable two-user test, not assumed. The codebase already has the `@supabase/ssr` scaffolding (browser client, cookie-based server client, a "middleware" session refresher) and a 10-table RLS schema, but the auth path is entirely mock: `login/page.tsx` checks hardcoded `abc@g.com`/`asdfg` and sets a plaintext `foliointel-session` cookie; the session "refresher" only reads that mock cookie and never calls Supabase; the dashboard layout parses the cookie and falls back to `abc@g.com`. None of the real Supabase auth calls are wired in yet.

**Two findings dominate the plan.** First — **this is a modified Next.js 16.** The `middleware` file convention is **deprecated and renamed to `proxy`** (verified in `node_modules/next/dist/docs/`). The existing `src/middleware.ts` will emit a deprecation warning and AGENTS.md says to heed those; the work must land in `proxy.ts`, and Next.js's own auth guide now warns that Proxy is for *optimistic* checks only — real authorization must live close to the data (Server Components / Route Handlers / RLS). Second — the **service-role/SSR trap** (Pitfall #5): an `@supabase/ssr` client created with the service-role key is silently overridden by the user's cookie session and runs as the user. AUTH-05 requires a *separate* plain `@supabase/supabase-js` admin client with no cookie integration.

The schema is mostly correct (holdings/accounts/brokers have proper four-policy RLS with `WITH CHECK` on insert), but has **two real holes**: `price_cache` and `news_items` grant `authenticated` users full write access (`FOR ALL ... WITH CHECK (TRUE)` / `INSERT ... WITH CHECK (TRUE)`), meaning any logged-in user can poison the shared cache. These must become SELECT-only for users, with writes reserved for the service role. Add `user_id`/`account_id` indexes and wrap `auth.uid()` as `(select auth.uid())` for RLS performance. The project has zero tests and runs Supabase locally in dev (CLI 2.109.1 is installed but not initialized — no `config.toml` yet).

**Primary recommendation:** Wire the existing `@supabase/ssr` scaffolding to real Supabase Auth (email/password via Server Actions), migrate `middleware.ts` → `proxy.ts` calling `getUser()`, add a dedicated server-only service-role admin client, drop the two permissive shared-table write policies, gate `/api/settings/keys` behind `getUser()`, and prove isolation with a plain-Node two-user script run against a locally-initialized Supabase.

<user_constraints>
## User Constraints

No `*-CONTEXT.md` exists for this phase (research is running ahead of / without `/gsd:discuss-phase`). The binding constraints therefore come from ROADMAP.md and the project-wide rules in REQUIREMENTS.md / STATE.md. Treat these as locked:

### Locked Decisions (from ROADMAP + STATE)
- **Supabase runs locally in dev** (recorded decision, commit `9ee8370`: "Supabase-first (local in dev) storage decision"). Plan for `supabase` CLI + Docker local stack, not a hosted-only flow.
- **Auth must come first, before any per-user data exists** — retrofitting `user_id` isolation later is a data migration. RLS is a Phase-1 success criterion, not later hardening.
- **Fail loudly, never silently fall back to mock — a feature is not done until its mock module is deleted.** For this phase: the demo credential/cookie login and the `abc@g.com` fallback must be *deleted*, not left behind a flag.
- **Existing stack stays** — Next.js 16.2.9, React 19, `@supabase/ssr` 0.12.0, `@supabase/supabase-js` 2.108.2. No auth-library swap (no NextAuth/Clerk).

### Claude's Discretion
- Login UX shape (Server Action + `useActionState` vs client `signInWithPassword`), error copy, whether sign-up needs email confirmation in dev.
- Exact test harness for AUTH-04 (plain Node script vs test runner) — recommendation below.
- Whether to gate-only vs partially rework `/api/settings/keys` this phase (recommendation below).

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- OAuth / social logins, MFA, password reset flows (email/password is the requirement).
- Encrypted per-user API-key storage / Supabase Vault migration for `/api/settings/keys` (this phase only *gates* it; deeper rework flagged for later).
- Any per-user portfolio data model work (that is Phase 2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Sign up + log in with email/password via Supabase Auth; demo cookie login removed | `signUp` / `signInWithPassword` on the SSR clients (Standard Stack); delete `login/page.tsx` demo creds + `foliointel-session` set (Codebase Changes). Next.js Server-Action login pattern verified in installed docs. |
| AUTH-02 | Session persists across refresh and is validated **server-side** (not cookie presence) | `proxy.ts` must call `supabase.auth.getUser()` (network-revalidated) — replaces the current cookie-presence check. `getUser()`/`getClaims()` over `getSession()` (Architecture Patterns, Pitfall: server-side session trust). |
| AUTH-03 | Log out from any page, fully clearing session | `supabase.auth.signOut()` in a Server Action / route + client `createClient().auth.signOut()`; replace `document.cookie` deletion in dashboard layout (Codebase Changes). |
| AUTH-04 | Per-user RLS isolation, proven by a two-user isolation test | Schema RLS audit + fixes (Don't Hand-Roll / Schema Fixes); runnable two-user Node script (Code Examples: AUTH-04 test). |
| AUTH-05 | Dedicated service-role client for cron/admin, never browser-exposed, not overridden by cookies | Separate `createClient` from `@supabase/supabase-js` with `persistSession:false` in a `server-only` module (Standard Stack + Pitfall #5 SSR/service-role trap). |
| AUTH-06 | Secure the unauthenticated `/api/settings/keys` endpoint | `getUser()` gate returning 401 in the route handler (Code Examples); note the endpoint's fs-write design is deeper debt (Open Questions). |
</phase_requirements>

## Standard Stack

Everything needed is already installed — this phase adds **zero new runtime dependencies**. It wires existing scaffolding and (optionally) adds the Supabase CLI as a dev tool.

### Core (already installed — verified in package.json + node_modules)
| Library | Installed | Purpose | Notes |
|---------|-----------|---------|-------|
| `next` | 16.2.9 | App Router, Server Actions, Proxy (was Middleware) | **`middleware` deprecated → `proxy` in v16** (see State of the Art) |
| `react` / `react-dom` | 19.2.4 | Server Actions + `useActionState` for login form | |
| `@supabase/ssr` | 0.12.0 | Cookie-bound browser + server clients for App Router | `createBrowserClient`, `createServerClient` with `getAll`/`setAll` — current API, matches installed code |
| `@supabase/supabase-js` | 2.108.2 | Underlying client; used *directly* for the service-role admin client | `getClaims()` available at this version (verify locally) |

### Supporting (dev tooling)
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `supabase` CLI | 2.109.1 (available via `npx supabase`) | Local Postgres + Auth + Studio; apply migrations | **Not yet initialized** — no `supabase/config.toml`. Needs `supabase init` + `supabase start` (Docker required) |
| Docker Desktop | latest | Runs the local Supabase stack | Prerequisite for `supabase start` on Windows |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain-Node two-user RLS script | pgTAP (in-DB SQL tests) | pgTAP proves policies at the SQL layer but tests as a DB superuser/role, not through the anon key + real JWT — it can miss the exact "authenticated user via PostgREST" path this app uses. A two-client Node script exercises the real request path. Prefer the Node script; pgTAP is optional depth. |
| Server Action login | Client `signInWithPassword` in `'use client'` page | Client call is simpler and works with `@supabase/ssr` browser client (cookies set via the browser client). Server Action is more aligned with Next.js 16 guidance and keeps logic server-side. Either is acceptable — see Discretion. |
| `getUser()` (network revalidation) | `getClaims()` (local JWT verify) | `getClaims()` is the newer, faster recommendation (verifies JWT signature locally, no round-trip) but depends on the project using JWT signing keys / a supabase-js version exposing it. `getUser()` always works and always revalidates. **Recommend `getUser()` as the baseline; adopt `getClaims()` only after verifying it against the local instance.** |

**Installation (dev tooling only):**
```bash
# One-time local Supabase init (creates supabase/config.toml)
npx supabase init
# Start local stack (requires Docker Desktop running) — prints local URL + anon/service_role keys
npx supabase start
```

## Architecture Patterns

### Recommended file layout (extends existing)
```
src/
├── proxy.ts                      # RENAMED from src/middleware.ts (Next 16); calls session refresh
├── utils/supabase/
│   ├── client.ts                 # exists — browser client (keep)
│   ├── server.ts                 # exists — cookie server client (keep)
│   ├── middleware.ts  → proxy-session.ts   # rewrite: real getUser() refresh, drop mock cookie
│   └── admin.ts                  # NEW — service-role client (server-only, no cookies)  [AUTH-05]
├── app/
│   ├── login/page.tsx            # rewrite: real Supabase auth, delete demo creds  [AUTH-01]
│   ├── auth/
│   │   ├── callback/route.ts     # exists (OAuth code exchange) — keep; not primary for pw login
│   │   └── signout/route.ts      # NEW (optional) — POST signOut  [AUTH-03]
│   └── (dashboard)/layout.tsx    # rewrite user email source + logout  [AUTH-02/03]
supabase/
├── config.toml                   # NEW (supabase init) — disable email confirm for dev
├── migrations/                   # NEW — move schema.sql here as timestamped migration + an RLS-fix migration
└── schema.sql                    # exists — becomes the initial migration source
scripts/
└── rls-isolation-test.ts         # NEW — two-user isolation proof  [AUTH-04]
```

### Pattern 1: Three distinct Supabase clients — never mix them
**What:** Each execution context gets its own client factory. This is the load-bearing structural decision of the phase.
- **Browser** (`createBrowserClient`, anon key) — Client Components. Cookies via browser.
- **Server-cookie** (`createServerClient`, anon key, `getAll`/`setAll`) — Server Components, Route Handlers, Server Actions. Runs *as the user* under RLS.
- **Service-role admin** (`createClient` from `@supabase/supabase-js`, service-role key, `persistSession:false`, **no cookies**) — cron/admin only. Bypasses RLS. **Must be a `server-only` module.**

**When to use:** Anything user-facing → server-cookie client. Anything writing shared/global data or acting across users (future price/news jobs) → admin client. Never reach for the admin client to "make a query work."

### Pattern 2: Session refresh in `proxy.ts` (optimistic) + verify at the data (secure)
**What:** `proxy.ts` refreshes the session cookie and does a coarse logged-in/redirect check. **Real authorization is RLS + per-route `getUser()`**, not the proxy. Next.js 16's own auth guide is explicit: "Proxy... should not be used as a full session management or authorization solution," and a matcher change can silently remove proxy coverage — so verify auth inside each Server Action / Route Handler.
**When to use:** Always for Supabase SSR. The proxy keeps tokens fresh; RLS is the actual security boundary.

### Pattern 3: RLS is the security boundary, not the app code
**What:** Because RLS enforces isolation in Postgres, the UI can use the anon-key server client freely — a user physically cannot read another user's rows even if app code is wrong. This is why AUTH-04 tests the *database*, through the anon key, not the app's redirect logic.

### Anti-Patterns to Avoid
- **Using the proxy/middleware as the auth wall.** Cookie presence ≠ authenticated (the current bug). Always `getUser()` server-side.
- **Creating the service-role client with `@supabase/ssr`.** The cookie session silently overrides it → it runs as the user (Pitfall #5). Use `@supabase/supabase-js` directly.
- **`FOR ALL ... USING (TRUE)` on shared tables for `authenticated`.** That is the current `price_cache` hole — any logged-in user can write.
- **Trusting `getSession()` in server code.** Not guaranteed to revalidate; use `getUser()`/`getClaims()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session tokens | The current plaintext `foliointel-session` email cookie | Supabase Auth JWT + `@supabase/ssr` cookie handling | Forgeable, unsigned, unexpiring; a whole class of session bugs Supabase already solves |
| "Is this user allowed to see this row?" | App-layer `if (row.user_id === me)` filters | Postgres RLS policies (`(select auth.uid()) = user_id`) | Enforced in the DB, immune to app bugs, is the AUTH-04 requirement |
| Cross-user admin writes | An SSR client with the service key | Separate `@supabase/supabase-js` admin client | SSR service-key client is silently downgraded to the user session |
| Password hashing / storage | Anything | Supabase Auth (`auth.users`) | Never store credentials in app tables |
| Session-refresh plumbing | Manual cookie parsing (current `middleware.ts`) | `createServerClient` `getAll`/`setAll` + `getUser()` in proxy | The installed scaffolding already does this correctly once wired |

**Key insight:** Almost all of Phase 1 is *deleting* hand-rolled auth and *activating* code that already exists. The risk is not building new machinery; it's leaving a mock fallback that masks a broken integration.

## Common Pitfalls

### Pitfall 1: RLS that exists but doesn't protect (project Pitfall #5)
**What goes wrong:** Policies present but ineffective — here specifically the `price_cache`/`news_items` `WITH CHECK (TRUE)` write grants, and (perf, not security) missing `user_id` indexes.
**Why it happens:** Single-user dev never exercises a second user; the shared-cache write policy looks harmless until a second account exists.
**How to avoid:** Drop the permissive write policies (writes become service-role only); keep SELECT-only for `authenticated`; add indexes; run **Supabase Security Advisor** after migrating; run the two-user script.
**Warning signs:** A second user's insert into `price_cache` succeeds; Security Advisor flags "RLS enabled but permissive policy."

### Pitfall 2: The @supabase/ssr service-role override (project Pitfall #5, SSR-specific)
**What goes wrong:** Admin/cron code "works" but is silently RLS-scoped to whatever user's cookie is present, or returns no data.
**Why it happens:** The SSR client attaches the cookie session's Authorization header over the service-role key.
**How to avoid:** Dedicated `createClient` (supabase-js) admin factory, `persistSession:false`, `autoRefreshToken:false`, no cookie wiring, `import 'server-only'`, key in `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`).
**Warning signs:** An admin query returns 0 rows where you expected all rows, or respects RLS you expected it to bypass.

### Pitfall 3: Building auth on the deprecated `middleware` convention
**What goes wrong:** Code lands in `src/middleware.ts`, emits a Next 16 deprecation warning, and drifts from the new `proxy` ergonomics AGENTS.md tells you to follow.
**Why it happens:** Training data and most Supabase tutorials still say "middleware."
**How to avoid:** Use `proxy.ts` (root or `src/`), exported `proxy` function; run `npx @next/codemod@canary middleware-to-proxy .` to migrate. Proxy is Node.js runtime by default (`runtime` config is disallowed there).
**Warning signs:** Deprecation warning on `next dev`/`next build` mentioning middleware→proxy.

### Pitfall 4: Cookie-presence auth surviving the rewrite
**What goes wrong:** Refresh "stays logged in" because something still trusts a cookie's existence rather than validating it (AUTH-02 fails against a forged cookie).
**Why it happens:** The current `middleware.ts` and dashboard layout both do exactly this today.
**How to avoid:** Server-side `getUser()` everywhere the answer matters; delete every `foliointel-session` read/write and the `abc@g.com` fallback.
**Warning signs:** Hand-editing the session cookie value keeps you logged in.

### Pitfall 5: Local sign-up blocked by email confirmation
**What goes wrong:** `signUp` succeeds but login fails locally because the user must confirm an email that never arrives.
**How to avoid:** In `supabase/config.toml` set `[auth.email] enable_confirmations = false` for local dev (or use Inbucket, which the local stack ships). Document this so the AUTH-01 flow is testable end-to-end.

## Code Examples

> Sources: verified against installed `node_modules/next/dist/docs/` (Next 16) and Supabase official SSR guide (`supabase.com/docs/guides/auth/server-side/nextjs`) + service-role troubleshooting doc.

### Service-role admin client (AUTH-05)
```ts
// src/utils/supabase/admin.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

// NOTE: createClient from supabase-js, NOT createServerClient from @supabase/ssr.
// No cookie integration => the user session can never override the service role.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only env, never NEXT_PUBLIC_
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

### Proxy session refresh (replaces src/utils/supabase/middleware.ts + src/middleware.ts)
```ts
// src/proxy.ts  (was src/middleware.ts)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        },
      },
    }
  )

  // IMPORTANT: do not run code between createServerClient and getUser().
  // getUser() revalidates the token server-side (AUTH-02) — not just cookie presence.
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = path.startsWith('/login') || path.startsWith('/auth')
  if (!user && !isPublic) {
    const url = request.nextUrl.clone(); url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && path.startsWith('/login')) {
    const url = request.nextUrl.clone(); url.pathname = '/'
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```
Migrate mechanically with: `npx @next/codemod@canary middleware-to-proxy .`

### Securing /api/settings/keys (AUTH-06)
```ts
// src/app/api/settings/keys/route.ts (top of each handler)
import { createClient } from '@/utils/supabase/server'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  if (!(await requireUser())) return new Response(null, { status: 401 })
  /* ...existing provider-flags response... */
}
export async function POST(request: Request) {
  if (!(await requireUser())) return new Response(null, { status: 401 })
  /* ...existing key write... (see Open Questions re: fs writes) */
}
```

### RLS fix migration for the shared tables (AUTH-04)
```sql
-- Shared cache tables: SELECT-only for users; writes only via service role (bypasses RLS).
DROP POLICY IF EXISTS "Allow authenticated users to insert/update prices" ON public.price_cache;
DROP POLICY IF EXISTS "Allow authenticated users to insert news"          ON public.news_items;
-- (Existing SELECT-only policies remain.)

-- Performance: wrap auth.uid() so Postgres caches it, and index the RLS join columns.
CREATE INDEX IF NOT EXISTS idx_investment_accounts_user_id ON public.investment_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_account_id         ON public.holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_account_id  ON public.watchlist_items(account_id);
CREATE INDEX IF NOT EXISTS idx_alerts_account_id           ON public.alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_brokers_account_id          ON public.brokers(account_id);
```
> Optional hardening: rewrite existing policies to use `(select auth.uid())` instead of bare `auth.uid()` for per-statement caching (perf, not correctness).

### Two-user isolation test (AUTH-04) — plain Node, zero new deps
```ts
// scripts/rls-isolation-test.ts   run: npx tsx scripts/rls-isolation-test.ts
import { createClient } from '@supabase/supabase-js'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function signedIn(email: string) {
  const c = createClient(URL, ANON)
  await c.auth.signUp({ email, password: 'Passw0rd!test' }).catch(() => {})
  await c.auth.signInWithPassword({ email, password: 'Passw0rd!test' })
  return c
}

const a = await signedIn(`a_${Date.now()}@test.local`)
const b = await signedIn(`b_${Date.now()}@test.local`)

// A owns a default account (created by handle_new_user trigger). A inserts a holding.
const { data: acctA } = await a.from('investment_accounts').select('id').limit(1).single()
await a.from('holdings').insert({ account_id: acctA!.id, symbol: 'INFY', exchange: 'NSE',
  asset_type: 'stocks', quantity: 1, avg_buy_price: 1, currency: 'INR' })

// B must NOT read A's rows...
const { data: leak } = await b.from('holdings').select('*')
if ((leak?.length ?? 0) !== 0) throw new Error('FAIL: RLS read leak')

// ...and must NOT write into A's account.
const { error: writeErr } = await b.from('holdings').insert({ account_id: acctA!.id,
  symbol: 'HACK', exchange: 'NSE', asset_type: 'stocks', quantity: 1, avg_buy_price: 1, currency: 'INR' })
if (!writeErr) throw new Error('FAIL: RLS write leak')

console.log('PASS: cross-user read and write are blocked')
```
Add as `"test:rls": "tsx scripts/rls-isolation-test.ts"`. `tsx` is the only dev dependency this introduces; if avoiding it, write the script in plain `.mjs` and run with `node`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` file convention | **`proxy.ts`** (function `proxy`) | Next.js **16.0.0** (verified in installed docs) | Existing `src/middleware.ts` is deprecated; migrate via codemod. Proxy is Node.js runtime by default. |
| Middleware as auth gate | Proxy for optimistic checks; **auth verified at data (RLS + `getUser` per route)** | Next 15/16 security guidance | Don't rely on the proxy matcher for security; a matcher change can silently expose a route/Server Function |
| `getSession()` server-side | `getUser()` (network revalidate) / `getClaims()` (local JWT verify) | Supabase SSR guidance (2024→) | `getSession()` is untrusted in server code; the current code uses neither (mock cookie) |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | Already on `@supabase/ssr` 0.12.0 — no migration needed |
| Cookie-presence "auth" | Supabase JWT session cookies | this phase | Removes the forgeable-cookie vulnerability (CONCERNS.md Critical) |

**Deprecated/outdated in this repo:**
- `src/middleware.ts` (rename to `proxy.ts`).
- Demo creds `abc@g.com`/`asdfg` and `foliointel-session` cookie (`login/page.tsx`, `middleware.ts`, dashboard `layout.tsx`) — delete.
- `abc@g.com` fallback in `(dashboard)/layout.tsx` (lines 94/97) — delete; source email from `supabase.auth.getUser()`.

## Codebase Changes (concrete delete/change list for the planner)

| File | Action | Detail |
|------|--------|--------|
| `src/app/login/page.tsx` | **Rewrite** | Delete hardcoded `abc@g.com`/`asdfg`, demo banner, client-side `if (email===...)`, and `document.cookie = 'foliointel-session=...'`. Implement real `signInWithPassword` + `signUp` (AUTH-01). Enable the sign-up path (currently disabled). |
| `src/middleware.ts` | **Rename → `src/proxy.ts`** | Function `middleware`→`proxy`; keep the matcher; delegate to the rewritten session refresher. Codemod available. |
| `src/utils/supabase/middleware.ts` | **Rewrite** (→ e.g. `proxy-session.ts`) | Delete the `foliointel-session` mock read (lines 30–32). Call `supabase.auth.getUser()` for the real check (AUTH-02). |
| `src/app/(dashboard)/layout.tsx` | **Change** | Remove cookie parse + `abc@g.com` fallback (lines 86–101); get email from Supabase. Replace `handleLogout` cookie deletion with `supabase.auth.signOut()` (AUTH-03). |
| `src/utils/supabase/admin.ts` | **Create** | Service-role admin client, `server-only` (AUTH-05). |
| `src/app/api/settings/keys/route.ts` | **Change** | Add `getUser()` 401 gate to GET + POST (AUTH-06). |
| `supabase/schema.sql` + `supabase/migrations/` | **Add migration** | Drop the two permissive shared-table write policies; add indexes; (optional) `(select auth.uid())` rewrite. |
| `src/utils/supabase/client.ts`, `server.ts` | **Keep** | Already correct for `@supabase/ssr` 0.12.0. |
| `src/app/auth/callback/route.ts` | **Keep** | Fine for code-exchange; not central to password login. |
| `scripts/rls-isolation-test.ts` | **Create** | Two-user proof (AUTH-04). |
| `supabase/config.toml` | **Create** (`supabase init`) | Local stack; disable email confirmation for dev. |

## Schema RLS Audit (per-table, read from supabase/schema.sql)

| Table | RLS enabled | INSERT `WITH CHECK` | Verdict |
|-------|-------------|---------------------|---------|
| `profiles` | Yes | No INSERT policy (rows created by `SECURITY DEFINER` trigger — OK) | OK |
| `investment_accounts` | Yes | Yes (four explicit policies) | **Good — reference pattern** |
| `brokers` | Yes | Yes (EXISTS-through-account) | OK (add `account_id` index) |
| `holdings` | Yes | Yes (EXISTS-through-account) | OK (add `account_id` index) |
| `watchlist_items` | Yes | `FOR ALL USING(...)` — USING doubles as WITH CHECK when omitted | OK-ish (add index; consider explicit WITH CHECK) |
| `price_cache` | Yes | **`FOR ALL ... WITH CHECK (TRUE)` for `authenticated`** | **HOLE — any user can write shared cache. Drop write policy.** |
| `news_items` | Yes | **`INSERT ... WITH CHECK (TRUE)` for `authenticated`** | **HOLE — any user can insert news. Drop insert policy.** |
| `account_settings` | Yes | `FOR ALL USING(...)` | OK-ish |
| `yt_channels` / `yt_videos` | Yes | `FOR ALL USING(...)` | OK-ish (add index) |
| `alerts` | Yes | `FOR ALL USING(...)` | OK-ish (add `account_id` index) |

**Net:** two real security fixes (`price_cache`, `news_items`), plus indexes and optional `(select auth.uid())` perf hardening. The per-user portfolio tables are already correctly isolated — which is why the two-user test should pass once the shared-table holes are closed and real sessions exist.

## Open Questions

1. **`/api/settings/keys` deeper design (AUTH-06 scope).**
   - What we know: it writes provider API keys to `.env.local` via synchronous `fs` (unauthenticated today). It is consumed by `src/hooks/use-settings.ts` (GET on mount, POST on save).
   - What's unclear: gating behind auth closes the *vulnerability*, but the design is still broken for production — Vercel's filesystem is ephemeral/read-only at runtime, and these keys are **global**, not per-user, so gating alone lets any logged-in user overwrite everyone's keys.
   - Recommendation: **This phase = gate behind `getUser()` only** (satisfies AUTH-06). File a deferred item to move to per-user encrypted DB storage / Supabase Vault (already out-of-scope above). Call this out so the planner writes a task note, not a rewrite.

2. **`getClaims()` vs `getUser()` availability.**
   - What we know: Supabase now recommends `getClaims()` server-side; supabase-js 2.108.2 should expose it.
   - What's unclear: whether the local project has JWT signing keys configured for local (asymmetric) verification, or falls back to a network call.
   - Recommendation: ship with `getUser()` (always correct); verify `getClaims()` against the running local instance before adopting it as an optimization.

3. **Local Supabase not yet initialized.**
   - What we know: CLI 2.109.1 is available; `supabase/config.toml` does not exist; Docker is required on Windows.
   - Recommendation: first plan task = `supabase init` + `supabase start` + move `schema.sql` into `supabase/migrations/` (timestamped) so `supabase db reset` reproducibly applies schema + the RLS-fix migration. Confirm Docker Desktop is available in the execution environment (flag if not).

4. **Env var wiring.** `.env.local` exists but its current contents (real vs placeholder Supabase URL/anon key, presence of `SUPABASE_SERVICE_ROLE_KEY`) weren't inspected. Planner should include a task to set `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` to the local stack values and add `SUPABASE_SERVICE_ROLE_KEY` (server-only) from `supabase start` output.

## Sources

### Primary (HIGH confidence)
- Installed Next.js 16.2.9 docs (read directly): `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (middleware→proxy deprecation, codemod, Node runtime, migration section, version history `v16.0.0`); `.../01-getting-started/16-proxy.md`; `.../02-guides/authentication.md` (Server Action login, Proxy-is-optimistic-only, Route Handler `getUser` gate, Server Function coverage caveat); `.../04-functions/cookies.md` (async `cookies()`).
- Codebase (read directly): `src/utils/supabase/{client,server,middleware}.ts`, `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/auth/callback/route.ts`, `src/app/api/settings/keys/route.ts`, `src/hooks/use-settings.ts`, `supabase/schema.sql`, `package.json`; installed versions verified in `node_modules` (`@supabase/ssr` 0.12.0, `@supabase/supabase-js` 2.108.2, `next` 16.2.9, `supabase` CLI 2.109.1).
- Prior project research: `.planning/research/{SUMMARY,PITFALLS,ARCHITECTURE}.md`, `.planning/codebase/{CONCERNS,INTEGRATIONS,ARCHITECTURE}.md`, `.planning/{REQUIREMENTS,ROADMAP,STATE}.md`.

### Secondary (MEDIUM confidence — verify at build)
- Supabase official SSR guide `supabase.com/docs/guides/auth/server-side/nextjs` (three-client pattern; `getClaims()` recommended over `getUser()`/`getSession()` server-side; don't trust `getSession()` in Proxy).
- Supabase service-role/SSR troubleshooting doc (separate `@supabase/supabase-js` client for service role; SSR cookie session overrides the service key).

## Metadata

**Confidence breakdown:**
- Standard stack / codebase state: HIGH — read directly from `node_modules` and source.
- Next.js middleware→proxy rename: HIGH — verified in installed docs (`v16.0.0` version history).
- RLS fixes: HIGH — the two permissive policies are visible in `schema.sql`.
- `getClaims()` vs `getUser()` currency + local Supabase env specifics: MEDIUM — verify against the running local instance.

**Research date:** 2026-07-13
**Valid until:** ~2026-08-13 (stable domain; re-verify only the `getClaims()` recommendation and any Next 16 proxy changes if a version bump occurs)
