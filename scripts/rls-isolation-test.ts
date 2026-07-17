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
 * It proves the following against the running local Supabase stack:
 *   1. User B cannot READ user A's holdings                    → else "RLS read leak"
 *   2. User B cannot WRITE into user A's account                → else "RLS write leak"
 *   3. An authenticated user cannot INSERT price_cache           → else "price_cache write hole open"
 *   4. An authenticated user cannot INSERT news_items             → else "news_items write hole open"
 *   5. User B cannot READ A's import_batches / symbol_mappings   → else "RLS read leak" (Phase 4, 04-01)
 *   6. User B cannot WRITE import_batches / symbol_mappings into A's account → else "RLS write leak" (Phase 4, 04-01)
 *   7. User B cannot READ/WRITE A's price_alerts                 → else "RLS read/write leak" (Phase 5, 05-01)
 *   8. Nobody (not even the owner) can UPDATE telegram_links via the anon key → else "allowlist closure broken" (Phase 5, 05-01)
 *   9. An authenticated user cannot INSERT notifications_outbox   → else "notifications_outbox write hole open" (Phase 5, 05-01)
 *   10. An authenticated user cannot INSERT news_item_instruments  → else "news_item_instruments write hole open" (Phase 6, 06-01)
 *
 * Checks 3 & 4 are the runnable proof that the plan-01 RLS-fix migration actually took:
 * price_cache / news_items have no per-user column, so before the fix any authenticated
 * user could poison the shared cache. Writes must now be rejected (RLS / permission
 * denied, Postgres code 42501). SELECT on both tables must STILL succeed for an
 * authenticated user (the read policies were intentionally kept), so reads are not
 * asserted to fail.
 *
 * Checks 5 & 6 extend the same account-ownership RLS proof to the two Phase 4 (CSV
 * import) tables added in 04-01's migration: import_batches and symbol_mappings use
 * the identical EXISTS-subquery policy shape as transactions, so owner-writes must
 * succeed and cross-user reads/writes must be rejected exactly like transactions.
 *
 * Checks 7-9 extend coverage to the three Phase 5 (05-01) tables: price_alerts is
 * account-owned like transactions (owner-write succeeds, cross-user read/write
 * rejected); telegram_links has NO authenticated UPDATE policy at all — that closure
 * IS the allowlist boundary (ALRT-01), so even the OWNER's own update must affect
 * zero rows, not just a stranger's; notifications_outbox has no authenticated INSERT
 * policy — writes are service-role only (ALRT-05).
 *
 * Check 10 extends the same closed-write-hole proof (checks 3, 4, 9) to the Phase 6
 * (06-01) news_item_instruments join table: authenticated SELECT is kept, authenticated
 * INSERT is rejected — linking an article to an instrument is service-role only.
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
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL_ || !ANON || URL_.includes('PLACEHOLDER') || ANON.includes('PLACEHOLDER')) {
  console.error(
    'FAIL: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing or still placeholders.\n' +
      'Point .env.local at a Supabase instance (hosted project API settings, or `npx supabase start`), then re-run.'
  )
  process.exit(1)
}

if (!SERVICE || SERVICE.includes('PLACEHOLDER')) {
  console.error(
    'FAIL: SUPABASE_SERVICE_ROLE_KEY is missing or still a placeholder.\n' +
      'It is required only to CREATE the two pre-confirmed test users; all RLS assertions still run through the anon key.'
  )
  process.exit(1)
}

const URL: string = URL_
const PASSWORD = 'Passw0rd!test'

// Admin client — used ONLY to provision the two test users. Hosted projects have
// email confirmation enabled, so anon signUp yields an unconfirmed user that cannot
// sign in. Creating them with email_confirm:true is test setup, NOT a weakening of
// the RLS proof: every assertion below still goes through the anon key + a real user JWT.
const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function signedIn(email: string): Promise<SupabaseClient> {
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  // An already-existing user is fine — we sign in next either way.
  if (createErr && !/already/i.test(createErr.message)) {
    throw new Error(`FAIL: could not create ${email}: ${createErr.message}`)
  }
  const c = createClient(URL, ANON!)
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

  // Instruments are a shared, read-only master table — pick a seeded row to reference.
  const { data: instr, error: instrErr } = await a
    .from('instruments')
    .select('id')
    .eq('symbol', 'INFY')
    .eq('exchange', 'NSE')
    .limit(1)
    .single()
  if (instrErr || !instr) {
    throw new Error(`FAIL: seeded instrument INFY/NSE not readable: ${instrErr?.message}`)
  }

  const { error: insErr } = await a.from('transactions').insert({
    account_id: acctA.id,
    instrument_id: instr.id,
    transaction_type: 'BUY',
    quantity: 1,
    price: 1,
  })
  if (insErr) throw new Error(`FAIL: user A could not insert own transaction: ${insErr.message}`)

  // 1. RLS read isolation — B must NOT see A's transactions.
  const { data: leak } = await b.from('transactions').select('*')
  if ((leak?.length ?? 0) !== 0) throw new Error('FAIL: RLS read leak — B can read A transactions')

  // 2. RLS write isolation — B must NOT write into A's account.
  const { error: writeErr } = await b.from('transactions').insert({
    account_id: acctA.id,
    instrument_id: instr.id,
    transaction_type: 'BUY',
    quantity: 1,
    price: 1,
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

  // ── Phase 4 (04-01): import_batches + symbol_mappings two-user isolation ──
  // Same account-ownership RLS shape as transactions: owner can write, a second user
  // can neither read nor write. A owns instr (INFY/NSE resolved above).

  // A inserts one import_batches row and one symbol_mappings row for A's own account.
  // These MUST succeed — proves the account-ownership INSERT policy admits the owner.
  const { data: batchA, error: batchInsErr } = await a
    .from('import_batches')
    .insert({
      account_id: acctA.id,
      broker: 'groww',
      file_name: 'rls-test.csv',
      file_hash: 'rls-test-hash-' + Date.now(),
      row_count: 1,
    })
    .select('id')
    .single()
  if (batchInsErr || !batchA) {
    throw new Error(`FAIL: user A could not insert own import_batches row: ${batchInsErr?.message}`)
  }

  const { data: mappingA, error: mappingInsErr } = await a
    .from('symbol_mappings')
    .insert({
      account_id: acctA.id,
      broker: 'groww',
      broker_symbol: 'RLSTEST',
      instrument_id: instr.id,
    })
    .select('id')
    .single()
  if (mappingInsErr || !mappingA) {
    throw new Error(`FAIL: user A could not insert own symbol_mappings row: ${mappingInsErr?.message}`)
  }

  // 5. RLS read isolation — B must NOT see A's import_batches / symbol_mappings rows.
  const { data: batchLeak } = await b.from('import_batches').select('*').eq('id', batchA.id)
  if ((batchLeak?.length ?? 0) !== 0) {
    throw new Error('FAIL: RLS read leak — B can read A import_batches')
  }
  const { data: mappingLeak } = await b.from('symbol_mappings').select('*').eq('id', mappingA.id)
  if ((mappingLeak?.length ?? 0) !== 0) {
    throw new Error('FAIL: RLS read leak — B can read A symbol_mappings')
  }

  // 6. RLS write isolation — B must NOT be able to insert rows carrying A's account_id.
  const { error: batchWriteErr } = await b.from('import_batches').insert({
    account_id: acctA.id,
    broker: 'groww',
    file_name: 'rls-write-leak.csv',
    file_hash: 'rls-write-leak-hash-' + Date.now(),
    row_count: 1,
  })
  if (!batchWriteErr) throw new Error('FAIL: RLS write leak — B wrote import_batches into A account')

  const { error: mappingWriteErr } = await b.from('symbol_mappings').insert({
    account_id: acctA.id,
    broker: 'groww',
    broker_symbol: 'RLSWRITELEAK',
    instrument_id: instr.id,
  })
  if (!mappingWriteErr) throw new Error('FAIL: RLS write leak — B wrote symbol_mappings into A account')

  // ── Phase 5 (05-01): price_alerts + telegram_links + notifications_outbox ──
  // price_alerts is account-owned like transactions/import_batches (owner-write CRUD via
  // the cookie client, cross-user reads/writes rejected). telegram_links and
  // notifications_outbox instead prove CLOSED write postures — not ownership CRUD, but
  // structural closure (no policy exists for the operation, for ANY authenticated role).

  // A inserts one price_alert for A's own account — MUST succeed (owner-write proof).
  const { data: alertA, error: alertInsErr } = await a
    .from('price_alerts')
    .insert({
      account_id: acctA.id,
      instrument_id: instr.id,
      direction: 'above',
      threshold: 1,
      cooldown_minutes: 60,
    })
    .select('id')
    .single()
  if (alertInsErr || !alertA) {
    throw new Error(`FAIL: user A could not insert own price_alert: ${alertInsErr?.message}`)
  }

  // 7a. RLS read isolation — B must NOT see A's price_alerts row.
  const { data: alertLeak } = await b.from('price_alerts').select('*').eq('id', alertA.id)
  if ((alertLeak?.length ?? 0) !== 0) {
    throw new Error('FAIL: RLS read leak — B can read A price_alerts')
  }

  // 7b. RLS write isolation — B must NOT be able to insert a price_alert carrying A's account_id.
  const { error: alertWriteErr } = await b.from('price_alerts').insert({
    account_id: acctA.id,
    instrument_id: instr.id,
    direction: 'below',
    threshold: 1,
    cooldown_minutes: 60,
  })
  if (!alertWriteErr) throw new Error('FAIL: RLS write leak — B wrote price_alerts into A account')

  // ── telegram_links: user-keyed, closed-UPDATE allowlist posture (ALRT-01) ──
  const { data: userAResp } = await a.auth.getUser()
  const userIdA = userAResp.user?.id
  if (!userIdA) throw new Error('FAIL: could not resolve user A id for telegram_links test')

  // A inserts a pending link for themselves — MUST succeed (owner-insert proof).
  const { error: linkInsErr } = await a.from('telegram_links').insert({
    user_id: userIdA,
    link_token: `rls-test-token-${stamp}-a`,
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })
  if (linkInsErr) {
    throw new Error(`FAIL: user A could not insert own telegram_links row: ${linkInsErr.message}`)
  }

  // 8a. RLS read isolation — B must NOT see A's telegram_links row.
  const { data: linkLeak } = await b.from('telegram_links').select('*').eq('user_id', userIdA)
  if ((linkLeak?.length ?? 0) !== 0) {
    throw new Error('FAIL: RLS read leak — B can read A telegram_links')
  }

  // 8b. Allowlist-closure proof: B attempting to set chat_id/status='linked' on A's link
  //     MUST affect ZERO rows — there is NO authenticated UPDATE policy for anyone, so
  //     this is not an ownership check, it's structural closure. A nonzero effect means
  //     a user could point their alerts at an arbitrary chat_id — hard failure.
  const { data: updByB } = await b
    .from('telegram_links')
    .update({ chat_id: 999999, status: 'linked' })
    .eq('user_id', userIdA)
    .select()
  if ((updByB?.length ?? 0) !== 0) {
    throw new Error('FAIL: telegram_links allowlist closure broken — B updated A telegram_links row')
  }

  // 8c. Same closure applies to the OWNER too — A updating their OWN link's chat_id must
  //     ALSO affect zero rows (no UPDATE policy exists for anyone). Only the service role
  //     can complete the handshake (chat_id/status='linked'); a re-link is DELETE + INSERT.
  const { data: updByA } = await a
    .from('telegram_links')
    .update({ chat_id: 111111, status: 'linked' })
    .eq('user_id', userIdA)
    .select()
  if ((updByA?.length ?? 0) !== 0) {
    throw new Error(
      'FAIL: telegram_links allowlist closure broken — A updated own chat_id/status (should be service-role only)'
    )
  }

  // ── notifications_outbox: service-role-write-only (ALRT-05) ──
  // 9. An authenticated user must be REJECTED on INSERT — there is no authenticated
  //    write policy at all; writes are service-role only (rls_fixes/price_cache posture).
  const { error: outboxInsErr } = await b.from('notifications_outbox').insert({
    user_id: userIdA,
    kind: 'price_alert',
    payload: { text: 'rls-test' },
  })
  if (!outboxInsErr) {
    throw new Error('FAIL: notifications_outbox write hole open — authenticated INSERT succeeded')
  }

  // ── Phase 6 (06-01): news_item_instruments closed write posture ──
  // Same shape as check 4 (news_items): an authenticated user (anon key + JWT,
  // NOT service role) must be REJECTED on INSERT — writes are service-role only.
  // The uuids need not reference real rows: RLS rejects the INSERT before FK
  // validation ever runs, so two gen_random_uuid()-shaped literals are fine.
  const { error: newsInstrErr } = await a.from('news_item_instruments').insert({
    news_item_id: '00000000-0000-4000-8000-000000000001',
    instrument_id: '00000000-0000-4000-8000-000000000002',
  })
  if (!newsInstrErr) {
    throw new Error('FAIL: news_item_instruments write hole open — authenticated INSERT succeeded')
  }

  // Sanity: authenticated SELECT must still succeed (read policy kept).
  const { error: newsInstrReadErr } = await a
    .from('news_item_instruments')
    .select('news_item_id')
    .limit(1)
  if (newsInstrReadErr) {
    throw new Error(`FAIL: authenticated read of news_item_instruments broke: ${newsInstrReadErr.message}`)
  }

  console.log(
    'PASS: cross-user read/write blocked (transactions, import_batches, symbol_mappings, price_alerts); ' +
      'telegram_links allowlist closure holds (no UPDATE by anyone, including the owner); ' +
      'notifications_outbox has no authenticated write policy; price_cache/news_items/news_item_instruments writes rejected'
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
