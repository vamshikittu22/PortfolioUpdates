/**
 * DGST-01 — the digest's Supabase orchestration sweep: composes the pure
 * message builder (`@/lib/digest/compose`), the Phase-6 news seam
 * (`@/lib/digest/news`), the P&L read (`@/lib/prices/get-portfolio-pnl`),
 * and the outbox enqueue path (`@/lib/notifications/outbox`). Accepts an
 * ALREADY-CONSTRUCTED admin client — the "which client" decision stays at
 * the call site (mirrors `src/lib/alerts/sweep.ts` / `src/lib/prices/
 * refresh-service.ts`), NEVER built here.
 *
 * Admin is required because the sweep is cross-user: it must see every
 * enabled `digest_preferences` row, not just one caller's own (same
 * rationale as `evaluateAndEnqueueAlerts`'s cross-user reach). Enqueue
 * idempotency is DB-backed by `computeDigestDedupeKey`'s
 * `daily_digest:{userId}:{istDate}` bucket against the partial unique index
 * on `notifications_outbox.dedupe_key` — a crash mid-sweep and a rerun the
 * same IST day can never double-send; the unique index is the real
 * guarantee, this file's own `skippedDuplicate` counter is best-effort
 * bookkeeping on top of it (see step 3 below).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Currency } from '@/lib/types';
import { getPortfolioPnL } from '@/lib/prices/get-portfolio-pnl';
import { getWatchlist } from '@/lib/supabase/portfolio';
import { getDailyDigestNews } from '@/lib/digest/news';
import {
  buildDailyDigestMessage,
  computeDigestDedupeKey,
  istDateKey,
  selectTopMovers,
} from '@/lib/digest/compose';
import type { DigestMessageInput } from '@/lib/digest/types';
import { enqueueNotifications } from '@/lib/notifications/outbox';

export type DigestRunSummary = {
  considered: number;
  enqueued: number;
  skippedUnlinked: number;
  skippedDuplicate: number;
  failed: number;
  newsDegraded: number;
};

export type ComposeOutcome =
  | { ok: true; text: string; newsDegraded: boolean }
  | { ok: false; error: string };

interface AccountRow {
  id: string;
  base_currency: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * composeDigestForUser — the single shared compose path for BOTH the
 * cross-user sweep (`runDailyDigest`) and the one-off `sendTestDigest`
 * Server Action (07-03 Task 3). They can never drift into different
 * portfolio/news framing because there is only one function that builds the
 * message.
 */
export async function composeDigestForUser(
  admin: SupabaseClient,
  userId: string,
  now: Date
): Promise<ComposeOutcome> {
  const { data: account, error: accountError } = await admin
    .from('investment_accounts')
    .select('id, base_currency')
    .eq('user_id', userId)
    .single();
  if (accountError || !account) {
    return { ok: false, error: accountError?.message ?? 'No investment account found' };
  }

  const { id: accountId } = account as AccountRow;
  // Dashboard precedent: default to INR when base_currency is unset.
  const baseCurrency = ((account as AccountRow).base_currency || 'INR') as Currency;

  const pnl = await getPortfolioPnL(admin, accountId, baseCurrency);
  const watchlist = await getWatchlist(admin, accountId);

  // Instrument scope = held ∪ watched instrument ids (per-user Set union,
  // the discoverInstrumentIds precedent from src/lib/prices/refresh-service.ts).
  const instrumentIds = Array.from(
    new Set([
      ...pnl.holdings.map((h) => h.instrumentId),
      ...watchlist.map((w) => w.instrumentId),
    ])
  );

  const sinceIso = new Date(now.getTime() - ONE_DAY_MS).toISOString();
  const news = await getDailyDigestNews(admin, instrumentIds, sinceIso);

  const hasHoldings = pnl.holdings.length > 0;
  // Honest pending: never render a 0 total as if it were a real price — only
  // pass a total when AT LEAST ONE holding is actually priced.
  const anyPriced = pnl.holdings.some((h) => h.status === 'priced');
  const totalCurrentValue = anyPriced ? pnl.portfolioTotal.totalCurrentValue : null;
  const totalDayChange = anyPriced ? pnl.portfolioTotal.totalDayChange : null;

  // The non-base currency with costBasis > 0 when FX is unavailable
  // (dashboard page.tsx precedent) — the first such holding is enough to
  // name the excluded currency in the note.
  const fxExcludedCurrency = pnl.fxUnavailable
    ? (pnl.holdings.find((h) => h.currency !== baseCurrency && h.costBasis > 0)?.currency ?? null)
    : null;

  const topMovers = selectTopMovers(
    pnl.holdings.map((h) => ({
      ticker: h.ticker,
      status: h.status,
      dayChangePct: h.dayChangePct,
    }))
  );

  const input: DigestMessageInput = {
    istDate: istDateKey(now),
    baseCurrency,
    totalCurrentValue,
    totalDayChange,
    hasHoldings,
    fxUnavailable: pnl.fxUnavailable,
    fxExcludedCurrency,
    topMovers,
    news: news.items,
    newsDegraded: news.degraded,
  };

  const text = buildDailyDigestMessage(input);
  return { ok: true, text, newsDegraded: news.degraded };
}

/**
 * runDailyDigest — the cross-user sweep: every enabled+linked user gets ONE
 * `daily_digest` outbox row per IST calendar day. Sequential loop, NEVER
 * Promise.all (mirrors `dispatchOutbox` — keeps per-user failures
 * attributable and respects Telegram's lack of send concurrency safety).
 */
export async function runDailyDigest(
  admin: SupabaseClient,
  now = new Date()
): Promise<DigestRunSummary> {
  const summary: DigestRunSummary = {
    considered: 0,
    enqueued: 0,
    skippedUnlinked: 0,
    skippedDuplicate: 0,
    failed: 0,
    newsDegraded: 0,
  };

  const { data: prefRows, error: prefError } = await admin
    .from('digest_preferences')
    .select('user_id')
    .eq('enabled', true);
  if (prefError) throw new Error(`runDailyDigest: failed to load digest_preferences: ${prefError.message}`);

  const userIds = (prefRows ?? []).map((row) => row.user_id as string);
  summary.considered = userIds.length;
  if (userIds.length === 0) return summary;

  const { data: linkRows, error: linkError } = await admin
    .from('telegram_links')
    .select('user_id, status')
    .in('user_id', userIds);
  if (linkError) throw new Error(`runDailyDigest: failed to load telegram_links: ${linkError.message}`);

  const linkedUserIds = new Set(
    (linkRows ?? []).filter((row) => row.status === 'linked').map((row) => row.user_id as string)
  );

  const eligibleUserIds: string[] = [];
  for (const userId of userIds) {
    if (!linkedUserIds.has(userId)) {
      summary.skippedUnlinked++;
      continue;
    }
    eligibleUserIds.push(userId);
  }
  if (eligibleUserIds.length === 0) return summary;

  // Best-effort pre-check: a same-day rerun's enqueueNotifications call
  // still returns void either way (its upsert's ignoreDuplicates is
  // silent), so we check notifications_outbox for today's dedupe keys
  // BEFORE the loop to report an honest skippedDuplicate count. The unique
  // index remains the real correctness guarantee regardless of this check.
  const dedupeKeys = eligibleUserIds.map((userId) => computeDigestDedupeKey(userId, now));
  const { data: existingRows, error: existingError } = await admin
    .from('notifications_outbox')
    .select('dedupe_key')
    .in('dedupe_key', dedupeKeys);
  if (existingError) {
    throw new Error(`runDailyDigest: failed to pre-check existing dedupe keys: ${existingError.message}`);
  }
  const existingDedupeKeys = new Set((existingRows ?? []).map((row) => row.dedupe_key as string));

  for (const userId of eligibleUserIds) {
    const dedupeKey = computeDigestDedupeKey(userId, now);
    if (existingDedupeKeys.has(dedupeKey)) {
      summary.skippedDuplicate++;
      continue;
    }

    // Per-user try/catch — one bad user never aborts the sweep for others
    // (mirrors dispatchOutbox's one-poisoned-row-does-not-abort rule).
    try {
      const outcome = await composeDigestForUser(admin, userId, now);
      if (!outcome.ok) {
        console.error(`runDailyDigest: compose failed for user ${userId}: ${outcome.error}`);
        summary.failed++;
        continue;
      }

      const istDate = istDateKey(now);
      await enqueueNotifications(admin, [
        {
          userId,
          kind: 'daily_digest',
          payload: { text: outcome.text, istDate, newsDegraded: outcome.newsDegraded },
          dedupeKey,
        },
      ]);

      summary.enqueued++;
      if (outcome.newsDegraded) summary.newsDegraded++;
    } catch (err) {
      console.error(`runDailyDigest: unexpected error for user ${userId}:`, err);
      summary.failed++;
    }
  }

  return summary;
}
