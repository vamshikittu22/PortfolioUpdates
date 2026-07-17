/**
 * ALRT-04 — the Supabase orchestration sweep that composes the pure news-
 * alert message builder + permanent dedupe key (`./build-news-message`) with
 * the outbox enqueue path (`@/lib/notifications/outbox`). Structural clone of
 * `src/lib/alerts/sweep.ts`'s header discipline: accepts an
 * ALREADY-CONSTRUCTED admin client — the "which client" decision stays at the
 * call site (mirrors `src/lib/prices/refresh-service.ts`), never built here.
 *
 * Requires the admin client because the sweep is cross-user (it must see
 * every user's holdings and every recent significant article, not just one
 * caller's RLS-scoped rows) — same rationale as `evaluateAndEnqueueAlerts`.
 *
 * Unlike the price-alert sweep, there is deliberately NO cooldown/stamping
 * step here: a single news article is significant to a user exactly ONCE,
 * ever, so `computeNewsAlertDedupeKey`'s permanent (non-time-bucketed)
 * `news_alert:{userId}:{urlHash}` key IS the entire idempotence contract.
 * The `uniq_notifications_outbox_dedupe` partial unique index absorbs every
 * re-sweep of the same (user, article) pair via `enqueueNotifications`'s
 * `ignoreDuplicates` upsert — there is no schema state to stamp, and
 * therefore no "step (c)" analogous to `evaluateAndEnqueueAlerts`'s
 * `last_triggered_at` update.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transaction } from '@/lib/types';
import { deriveHoldings } from '@/lib/portfolio/derive-holdings';
import { buildNewsAlertMessage, computeNewsAlertDedupeKey } from './build-news-message';
import { enqueueNotifications } from '@/lib/notifications/outbox';

/**
 * How far back a news item's `published_at` may be and still be considered
 * for alerting. Prevents an alert storm from historical backfill on the
 * pipeline's first run — the permanent dedupe key already prevents repeats
 * on every LATER sweep, so this constant only bounds first-contact volume,
 * not correctness.
 */
const NEWS_ALERT_RECENCY_HOURS = 48;

interface NewsItemInstrumentJoinRow {
  instrument_id: string;
}

interface NewsAlertCandidateRow {
  id: string;
  headline: string;
  url: string;
  source: string | null;
  summary: string | null;
  importance: string | null;
  published_at: string;
  news_item_instruments: NewsItemInstrumentJoinRow[] | null;
}

interface AccountOwnerRow {
  user_id: string;
}

interface TransactionSweepRow {
  account_id: string;
  instrument_id: string;
  transaction_type: 'BUY' | 'SELL' | 'SPLIT' | 'BONUS';
  quantity: number;
  price: number | null;
  transaction_date: string;
  investment_accounts: AccountOwnerRow | AccountOwnerRow[] | null;
}

interface InstrumentSymbolRow {
  id: string;
  symbol: string;
}

/** Supabase nests a to-one FK relation as an object or, depending on
 * client/type inference, a one-element array — normalize both (same
 * pattern as `src/lib/alerts/sweep.ts`'s `firstOf`). */
function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Honest counts of one sweep run. `candidates` is the number of recent,
 * summarized, High-importance news items that were matched to at least one
 * instrument (items with no `news_item_instruments` join rows are skipped
 * before this count). `enqueued` counts enqueue CALLS, one per
 * (item, user)-with-a-held-match pair — the DB's dedupe-key upsert may
 * silently absorb some of these as duplicates of an earlier sweep, so this
 * is an upper bound on genuinely-new notifications, not a guarantee every
 * call inserted a fresh row.
 */
export interface NewsAlertSweepResult {
  candidates: number;
  enqueued: number;
}

/**
 * sweepNewsAlerts — loads recent High-importance summarized news items
 * matched to real instruments, loads the cross-user holdings universe via
 * `deriveHoldings`, and for every (item, user) pair where the user genuinely
 * HOLDS one of the item's matched instruments, pre-renders the alert text
 * and enqueues a `news_alert` outbox row keyed by the permanent
 * `news_alert:{userId}:{urlHash}` dedupe key. Enqueue-only: no dispatch, no
 * state stamping. The caller composes `dispatchOutbox` afterward (same
 * two-step composition `refreshAllPrices` uses for price alerts).
 */
export async function sweepNewsAlerts(admin: SupabaseClient): Promise<NewsAlertSweepResult> {
  // 1. Load recent significant items. `importance` is set ONLY by successful
  // AI summarization (never fabricated for a pending/degraded row) — honest
  // degradation: no AI budget => no significance signal => no alert. ALRT-04
  // requires genuine "significance", so a null/degraded importance can never
  // reach this query in the first place (summary_status='summarized' AND
  // importance='High' are both required).
  const recencyCutoffIso = new Date(
    Date.now() - NEWS_ALERT_RECENCY_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: newsRows, error: newsError } = await admin
    .from('news_items')
    .select(
      `id, headline, url, source, summary, importance, published_at,
      news_item_instruments ( instrument_id )`
    )
    .eq('summary_status', 'summarized')
    .eq('importance', 'High')
    .gte('published_at', recencyCutoffIso);
  if (newsError) {
    throw new Error(`sweepNewsAlerts: failed to load news_items: ${newsError.message}`);
  }

  const candidateRows = (newsRows ?? []) as unknown as NewsAlertCandidateRow[];

  // Items with no join rows (unmatched to any held/watched instrument) skip
  // entirely — there is nobody to alert.
  const candidates = candidateRows
    .map((row) => ({
      ...row,
      matchedInstrumentIds: (row.news_item_instruments ?? []).map((j) => j.instrument_id),
    }))
    .filter((row) => row.matchedInstrumentIds.length > 0);

  if (candidates.length === 0) return { candidates: 0, enqueued: 0 };

  // 2. Load the holdings universe: all transactions across all accounts,
  // joined to each account's owning user. Group per account_id, derive each
  // account's genuinely-held instruments (net quantity > 0 — deriveHoldings
  // omits fully-sold-out positions by design), then fold into a per-USER
  // held-instrument set (a user's holdings may span multiple accounts).
  const { data: txnRows, error: txnError } = await admin
    .from('transactions')
    .select(
      'account_id, instrument_id, transaction_type, quantity, price, transaction_date, investment_accounts ( user_id )'
    );
  if (txnError) {
    throw new Error(`sweepNewsAlerts: failed to load transactions: ${txnError.message}`);
  }

  const txns = (txnRows ?? []) as unknown as TransactionSweepRow[];

  const txnsByAccount = new Map<string, Transaction[]>();
  const userIdByAccount = new Map<string, string>();

  for (const row of txns) {
    const account = firstOf(row.investment_accounts);
    if (!account) continue; // NOT NULL FK; guard is type-safety only

    userIdByAccount.set(row.account_id, account.user_id);

    const mapped: Transaction = {
      id: '', // unused by deriveHoldings; not selected (this sweep never needs a transaction identity)
      accountId: row.account_id,
      instrumentId: row.instrument_id,
      transactionType: row.transaction_type,
      quantity: row.quantity,
      price: row.price,
      transactionDate: row.transaction_date,
    };

    const list = txnsByAccount.get(row.account_id);
    if (list) {
      list.push(mapped);
    } else {
      txnsByAccount.set(row.account_id, [mapped]);
    }
  }

  const heldInstrumentIdsByUser = new Map<string, Set<string>>();

  for (const [accountId, accountTxns] of txnsByAccount) {
    const userId = userIdByAccount.get(accountId);
    if (!userId) continue; // defensive; every account in the map above has a resolved owner

    const holdings = deriveHoldings(accountTxns);
    const userSet = heldInstrumentIdsByUser.get(userId) ?? new Set<string>();
    for (const instrumentId of holdings.keys()) {
      userSet.add(instrumentId);
    }
    heldInstrumentIdsByUser.set(userId, userSet);
  }

  if (heldInstrumentIdsByUser.size === 0) return { candidates: candidates.length, enqueued: 0 };

  // Display symbols for the matched instrument ids referenced by candidate
  // items (a small, bounded set — never the full instrument master).
  const matchedInstrumentIdSet = new Set<string>();
  for (const item of candidates) {
    for (const instrumentId of item.matchedInstrumentIds) {
      matchedInstrumentIdSet.add(instrumentId);
    }
  }
  const matchedInstrumentIds = Array.from(matchedInstrumentIdSet);

  const symbolByInstrumentId = new Map<string, string>();
  if (matchedInstrumentIds.length > 0) {
    const { data: instrumentRows, error: instrumentError } = await admin
      .from('instruments')
      .select('id, symbol')
      .in('id', matchedInstrumentIds);
    if (instrumentError) {
      throw new Error(`sweepNewsAlerts: failed to load instruments: ${instrumentError.message}`);
    }
    for (const row of (instrumentRows ?? []) as InstrumentSymbolRow[]) {
      symbolByInstrumentId.set(row.id, row.symbol);
    }
  }

  // 3. For each (item x user) where the item's matched instruments intersect
  // the user's held set, pre-render and enqueue.
  let enqueued = 0;

  for (const item of candidates) {
    for (const [userId, heldSet] of heldInstrumentIdsByUser) {
      const heldMatches = item.matchedInstrumentIds.filter((id) => heldSet.has(id));
      if (heldMatches.length === 0) continue;

      const displaySymbols = heldMatches
        .map((id) => symbolByInstrumentId.get(id))
        .filter((symbol): symbol is string => Boolean(symbol))
        .sort();

      // The stored `summary` column already holds the composed
      // "summary… Why it matters: …" text written at summarization time, so
      // it IS the message's context line — this builder never re-renders
      // summary/whyItMatters as two separate columns. A summarized row
      // should always carry a summary; null is handled defensively only
      // (the builder omits the line entirely rather than showing a gap).
      const text = buildNewsAlertMessage({
        displaySymbols,
        headline: item.headline,
        whyItMatters: item.summary ?? null,
        source: item.source ?? '',
        url: item.url,
      });

      // Enqueue is the ONLY write here — there is deliberately no step (c):
      // no stamp, no state. The permanent url-hash dedupe key absorbs every
      // re-sweep via enqueueNotifications' ignoreDuplicates upsert.
      await enqueueNotifications(admin, [
        {
          userId,
          kind: 'news_alert',
          payload: { text, newsItemId: item.id, url: item.url },
          dedupeKey: computeNewsAlertDedupeKey(userId, item.url),
        },
      ]);

      enqueued++;
    }
  }

  return { candidates: candidates.length, enqueued };
}
