import 'server-only'
import { createClient } from '@supabase/supabase-js'

// AUTH-05 — Dedicated service-role admin client.
//
// WARNING: This client BYPASSES Row-Level Security. It must ONLY be used by
// trusted server-side code — cron/scheduled jobs and admin operations (e.g. the
// future price-cache and news-ingest jobs that write the shared `price_cache` /
// `news_items` tables). NEVER reach for it to "make a user query work"; user-facing
// reads/writes must go through the cookie-bound server client so RLS still applies.
//
// It is built from `@supabase/supabase-js` `createClient` (NOT `createServerClient`
// from `@supabase/ssr`). The SSR client attaches the user's cookie session over the
// service-role key, silently downgrading it to run as that user (research Pitfall #2 /
// project Pitfall #5, the SSR/service-role trap). Using supabase-js directly with no
// cookie wiring means a user session can never override the service role.
//
// `import 'server-only'` makes any accidental client-side import fail the build, so
// the browser can never receive this client or the service-role key.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only env, never NEXT_PUBLIC_
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
