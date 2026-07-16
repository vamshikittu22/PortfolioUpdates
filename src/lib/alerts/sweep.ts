/**
 * ALRT-03 / ALRT-05 — the Supabase orchestration sweep that composes the
 * pure alert evaluator (`evaluate.ts`), the pure HTML message builder
 * (`@/lib/telegram/build-message`), and the outbox enqueue path
 * (`@/lib/notifications/outbox`). Accepts an ALREADY-CONSTRUCTED admin
 * client — the "which client" decision stays at the call site (mirrors
 * `src/lib/prices/refresh-service.ts`), never built here.
 *
 * Requires the admin client because the evaluator must see ALL users'
 * active alerts, not just one caller's — same cross-user rationale as
 * `discoverInstrumentIds` in refresh-service.ts (a cookie-bound client
 * would only see the calling user's own RLS-scoped rows).
 *
 * Honest note: the enqueue and the `last_triggered_at` update below are two
 * separate statements — supabase-js has no cross-call transaction (the same
 * boundary 04-04's commitImport faced). The `dedupe_key` unique index
 * (`uniq_notifications_outbox_dedupe`) plus this function's enqueue-FIRST
 * ordering is the never-lost/never-duplicate backstop, not a true
 * transaction: if the process dies between steps (b) and (c) below, the
 * alert is enqueued but not yet cooled down, so the very next sweep
 * re-evaluates it, recomputes the SAME dedupe_key (same cooldown-window
 * bucket), and the upsert's `ignoreDuplicates` silently absorbs the retry
 * instead of double-sending.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateAlerts, computeAlertDedupeKey } from '@/lib/alerts/evaluate';
import type { AlertEvalRow, PriceSnapshot } from '@/lib/alerts/types';
import { buildPriceAlertMessage } from '@/lib/telegram/build-message';
import { enqueueNotifications } from '@/lib/notifications/outbox';

interface InstrumentDisplayRow {
  symbol: string;
  display_name: string;
  currency: string;
}

interface AccountOwnerRow {
  user_id: string;
}

interface PriceAlertSweepRow {
  id: string;
  account_id: string;
  instrument_id: string;
  direction: 'above' | 'below';
  threshold: number;
  is_active: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
  instruments: InstrumentDisplayRow | InstrumentDisplayRow[] | null;
  investment_accounts: AccountOwnerRow | AccountOwnerRow[] | null;
}

/** Supabase nests a to-one FK relation as an object or, depending on
 * client/type inference, a one-element array — normalize both (same
 * pattern as `src/lib/alerts/read.ts`'s `firstInstrument`). */
function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface SweepResult {
  triggered: number;
  enqueued: number;
}

/**
 * evaluateAndEnqueueAlerts — loads all active alerts + their cached prices
 * with the admin client, runs the pure evaluator, and for each trigger
 * enqueues the pre-rendered outbox row FIRST then stamps `last_triggered_at`
 * — enqueue-first, dedupe-backed, never-lost (05-RESEARCH-schema-outbox
 * "enqueue-first rule").
 */
export async function evaluateAndEnqueueAlerts(admin: SupabaseClient): Promise<SweepResult> {
  const { data, error } = await admin
    .from('price_alerts')
    .select(
      `id, account_id, instrument_id, direction, threshold, is_active, cooldown_minutes, last_triggered_at,
      instruments ( symbol, display_name, currency ),
      investment_accounts ( user_id )`
    )
    .eq('is_active', true);
  if (error) throw new Error(`evaluateAndEnqueueAlerts: failed to load price_alerts: ${error.message}`);

  const rows = (data ?? []) as unknown as PriceAlertSweepRow[];
  if (rows.length === 0) return { triggered: 0, enqueued: 0 };

  // Map each DB row onto the pure evaluator's AlertEvalRow shape, keeping
  // the display fields (symbol/display_name/currency) and resolved userId
  // alongside for message rendering / the outbox recipient — the outbox
  // recipient is a USER, resolved to a chat_id only at dispatch time
  // (05-RESEARCH-schema-outbox section 3), never here.
  const evalRows: AlertEvalRow[] = [];
  const displayById = new Map<string, InstrumentDisplayRow>();
  const userIdByAlertId = new Map<string, string>();

  for (const row of rows) {
    const instrument = firstOf(row.instruments);
    const account = firstOf(row.investment_accounts);
    if (!instrument || !account) continue; // both are NOT NULL FKs; guard is type-safety only

    displayById.set(row.instrument_id, instrument);
    userIdByAlertId.set(row.id, account.user_id);

    evalRows.push({
      id: row.id,
      accountId: row.account_id,
      userId: account.user_id,
      instrumentId: row.instrument_id,
      direction: row.direction,
      threshold: row.threshold,
      isActive: row.is_active,
      cooldownMinutes: row.cooldown_minutes,
      lastTriggeredAt: row.last_triggered_at,
    });
  }

  if (evalRows.length === 0) return { triggered: 0, enqueued: 0 };

  // Evaluation reads price_cache (NOT in-flight fetch results) so it also
  // works when the dispatch route is hit standalone and matches exactly
  // what the dashboard shows — one source of truth
  // (05-RESEARCH-schema-outbox "Where").
  const instrumentIds = Array.from(new Set(evalRows.map((r) => r.instrumentId)));
  const { data: priceRows, error: priceError } = await admin
    .from('price_cache')
    .select('instrument_id, price, fetch_error')
    .in('instrument_id', instrumentIds);
  if (priceError) throw new Error(`evaluateAndEnqueueAlerts: failed to load price_cache: ${priceError.message}`);

  const priceMap = new Map<string, PriceSnapshot>();
  for (const row of priceRows ?? []) {
    priceMap.set(row.instrument_id as string, {
      price: (row.price as number | null) ?? null,
      fetchError: (row.fetch_error as string | null) ?? null,
    });
  }

  const now = new Date();
  const triggered = evaluateAlerts(evalRows, priceMap, now);

  let enqueued = 0;
  for (const { alert, price } of triggered) {
    const instrument = displayById.get(alert.instrumentId);
    const userId = userIdByAlertId.get(alert.id);
    if (!instrument || !userId) continue; // defensive; both were populated above for every eval row

    // (a) Pre-render the message — payload.text is fully rendered here so
    // the dispatcher stays 100% kind-agnostic (Phase 6/7 reuse guarantee).
    const text = buildPriceAlertMessage({
      displaySymbol: instrument.symbol,
      direction: alert.direction,
      threshold: alert.threshold,
      price,
      currency: instrument.currency,
    });

    // (b) Enqueue FIRST — never stamp the cooldown before the notification
    // is durably queued. Reversing this order would risk stamping
    // last_triggered_at while losing the enqueue, swallowing the alert for
    // a whole cooldown window.
    await enqueueNotifications(admin, [
      {
        userId,
        kind: 'price_alert',
        payload: {
          text,
          alertId: alert.id,
          instrumentId: alert.instrumentId,
          price,
          threshold: alert.threshold,
        },
        dedupeKey: computeAlertDedupeKey(alert, now),
      },
    ]);

    // (c) THEN stamp last_triggered_at — plain update; the evaluator is the
    // only writer of this column.
    const { error: stampError } = await admin
      .from('price_alerts')
      .update({ last_triggered_at: now.toISOString() })
      .eq('id', alert.id);
    if (stampError) {
      throw new Error(`evaluateAndEnqueueAlerts: failed to stamp last_triggered_at: ${stampError.message}`);
    }

    enqueued++;
  }

  return { triggered: triggered.length, enqueued };
}
