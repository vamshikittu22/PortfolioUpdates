/**
 * AUTH-04 — Two-user RLS isolation + shared-table write-hole proof.
 *
 * Run:  npm run test:rls   (→ tsx scripts/rls-isolation-test.ts)
 *
 * This script exercises the REAL request path: it uses the ANON key only (never the
 * service role) and two independent authenticated sessions (real JWTs) through
 * PostgREST — exactly how the app talks to Postgres. RLS is the security boundary, so
 * a second user physically cannot read/write the first user's rows even if app code
 * is wrong.
 *
 * It proves four things against the running local Supabase stack:
 *   1. User B cannot READ user A's holdings           → else "RLS read leak"
 *   2. User B cannot WRITE into user A's account       → else "RLS write leak"
 *   3. An authenticated user cannot INSERT price_cache → else "price_cache write hole open"
 *   4. An authenticated user cannot INSERT news_items  → else "news_items write hole open"
 *
 * Checks 3 & 4 are the runnable proof that the plan-01 RLS-fix migration actually took:
 * price_cache / news_items have no per-user column, so before the fix any authenticated
 * user could poison the shared cache. Writes must now be rejected (RLS / permission
 * denied, Postgres code 42501). SELECT on both tables must STILL succeed for an
 * authenticated user (the read policies were intentionally kept), so reads are not
 * asserted to fail.
 *
 * On success: prints PASS and exits 0. On any failure: throws and exits non-zero.
 * Do NOT weaken this test to make it pass — a failure means the RLS fixes did not take;
 * fix the migration instead.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// --- Load env from .env.local (inline parse so `npm run test:rls` works on any Node) ---
function loadEnvLocal(): void {
  try {
    // Resolved from the project root (where `npm run test:rls` runs), not import.meta —
    // keeps this type-clean under the project's non-ESM tsconfig.
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      // strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // .env.local may be absent in CI; rely on process.env in that case.
  }
}
loadEnvLocal()

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL_ || !ANON || URL_.includes('PLACEHOLDER') || ANON.includes('PLACEHOLDER')) {
  console.error(
    'FAIL: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing or still placeholders.\n' +
      'Start the local stack (`npx supabase start`) and put the printed anon key + URL in .env.local, then re-run.'
  )
  process.exit(1)
}

const URL: string = URL_
const PASSWORD = 'Passw0rd!test'

async function signedIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON!)
  // signUp may fail if the user already exists — that is fine, we sign in next.
  await c.auth.signUp({ email, password: PASSWORD }).catch(() => {})
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`FAIL: could not sign in ${email}: ${error.message}`)
  return c
}

async function main(): Promise<void> {
  const stamp = Date.now()
  const a = await signedIn(`a_${stamp}@test.local`)
  const b = await signedIn(`b_${stamp}@test.local`)

  // A owns a default investment_accounts row (auto-created by the handle_new_user
  // trigger). A inserts a holding into it.
  const { data: acctA, error: acctErr } = await a
    .from('investment_accounts')
    .select('id')
    .limit(1)
    .single()
  if (acctErr || !acctA) {
    throw new Error(`FAIL: user A has no default account (trigger?): ${acctErr?.message}`)
  }

  const { error: insErr } = await a.from('holdings').insert({
    account_id: acctA.id,
    symbol: 'INFY',
    exchange: 'NSE',
    asset_type: 'stocks',
    quantity: 1,
    avg_buy_price: 1,
    currency: 'INR',
  })
  if (insErr) throw new Error(`FAIL: user A could not insert own holding: ${insErr.message}`)

  // 1. RLS read isolation — B must NOT see A's holdings.
  const { data: leak } = await b.from('holdings').select('*')
  if ((leak?.length ?? 0) !== 0) throw new Error('FAIL: RLS read leak — B can read A holdings')

  // 2. RLS write isolation — B must NOT write into A's account.
  const { error: writeErr } = await b.from('holdings').insert({
    account_id: acctA.id,
    symbol: 'HACK',
    exchange: 'NSE',
    asset_type: 'stocks',
    quantity: 1,
    avg_buy_price: 1,
    currency: 'INR',
  })
  if (!writeErr) throw new Error('FAIL: RLS write leak — B wrote into A account')

  // 3. price_cache write hole — an AUTHENTICATED user (anon key + JWT, NOT service role)
  //    must be REJECTED on INSERT. Writes are reserved for the service role.
  const { error: priceErr } = await a.from('price_cache').insert({
    symbol: 'ZZ_RLS_TEST',
    price: 1,
    source: 'rls-test',
  })
  if (!priceErr) throw new Error('FAIL: price_cache write hole open — authenticated INSERT succeeded')

  // 4. news_items write hole — same: authenticated INSERT must be REJECTED.
  const { error: newsErr } = await a.from('news_items').insert({
    headline: 'rls-test',
    url: 'https://rls-test.local/' + Date.now(),
    published_at: new Date().toISOString(),
    affected_symbols: ['INFY'],
  })
  if (!newsErr) throw new Error('FAIL: news_items write hole open — authenticated INSERT succeeded')

  // Sanity: authenticated SELECT on the shared tables must STILL work (read policies kept).
  const { error: priceReadErr } = await a.from('price_cache').select('symbol').limit(1)
  if (priceReadErr) throw new Error(`FAIL: authenticated read of price_cache broke: ${priceReadErr.message}`)
  const { error: newsReadErr } = await a.from('news_items').select('id').limit(1)
  if (newsReadErr) throw new Error(`FAIL: authenticated read of news_items broke: ${newsReadErr.message}`)

  console.log('PASS: cross-user read/write blocked and price_cache/news_items writes rejected')
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
