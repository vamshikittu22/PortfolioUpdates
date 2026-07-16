/**
 * ALRT-02 / ALRT-03 — the pure alert-evaluation core. Zero I/O, zero DB,
 * zero clock beyond the injected `now` — mirrors `src/lib/prices/ingest.ts`'s
 * shape. Proven by `scripts/alerts-eval-test.ts` under node:assert/strict.
 *
 * Level+cooldown (NOT edge detection, see 05-RESEARCH-schema-outbox
 * "Cooldown semantics"): there is no previous-observed-price state in this
 * schema, so a fired alert re-evaluates every sweep but only actually FIRES
 * again once `cooldown_minutes` has elapsed since `last_triggered_at`. This
 * fully satisfies ALRT-03's "does not repeat on every refresh" without any
 * new per-alert state beyond the cooldown anchor already on the row.
 */
import type { AlertEvalRow, PriceSnapshot, TriggeredAlert } from './types';

/**
 * True if a cooldown window has elapsed and the alert is eligible to fire
 * again: never-triggered (`lastTriggeredAt === null`) is always elapsed.
 * Otherwise elapsed iff `now - lastTriggeredAt > cooldownMinutes * 60_000`
 * (strict `>`, matching the direction-comparison strictness elsewhere in
 * this module).
 */
export function isCooldownElapsed(
  lastTriggeredAt: string | null,
  cooldownMinutes: number,
  now: Date
): boolean {
  if (lastTriggeredAt === null) return true;
  const elapsedMs = now.getTime() - new Date(lastTriggeredAt).getTime();
  return elapsedMs > cooldownMinutes * 60_000;
}

/**
 * Evaluates every alert against the latest known price for its instrument
 * and returns exactly the ones that should fire THIS pass.
 *
 * Fires iff, in order:
 *   1. `alert.isActive` — inactive alerts never fire, regardless of price.
 *   2. A price snapshot exists for `alert.instrumentId` in `pricesByInstrument`
 *      — missing entries (instrument never priced) never fire.
 *   3. `snapshot.price !== null` — a never-fetched price never fires. NEVER
 *      alert on a fabricated value (house cardinal rule).
 *   4. `snapshot.fetchError === null` — a snapshot whose latest refresh
 *      attempt failed never fires. Alerting on a knowingly-stale price
 *      contradicts the same honesty discipline, even though a numeric
 *      `price` may still be present from a prior successful fetch.
 *   5. Direction check, strict comparison: 'above' fires only when
 *      `price > threshold`; 'below' only when `price < threshold`.
 *      Exactly-equal never fires (documented boundary) — keeps direction
 *      semantics unambiguous.
 *   6. `isCooldownElapsed(...)` — a standing breach re-notifies at most
 *      once per cooldown window.
 *
 * Pure: reads only the injected `now`, never calls `Date.now()` internally.
 */
export function evaluateAlerts(
  alerts: AlertEvalRow[],
  pricesByInstrument: Map<string, PriceSnapshot>,
  now: Date
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const alert of alerts) {
    if (!alert.isActive) continue;

    const snapshot = pricesByInstrument.get(alert.instrumentId);
    if (!snapshot) continue;
    if (snapshot.price === null) continue;
    if (snapshot.fetchError !== null) continue;

    const price = snapshot.price;
    const beyondThreshold =
      alert.direction === 'above' ? price > alert.threshold : price < alert.threshold;
    if (!beyondThreshold) continue;

    if (!isCooldownElapsed(alert.lastTriggeredAt, alert.cooldownMinutes, now)) continue;

    triggered.push({ alert, price });
  }

  return triggered;
}

/**
 * ALRT-05 idempotency backstop — the deterministic cooldown-window bucket
 * key that backs idempotent outbox enqueue (05-RESEARCH-schema-outbox
 * "Deterministic dedupe_key"): `price_alert:{alert_id}:{bucket}` where
 * `bucket = floor(epoch_seconds / (cooldown_minutes * 60))`.
 *
 * Identical across re-runs inside the SAME cooldown window — this is what
 * makes a crash-recovery re-enqueue collide with the
 * `uniq_notifications_outbox_dedupe` partial unique index and get suppressed
 * rather than duplicated. Naturally different once `now` crosses into the
 * NEXT window, allowing the next legitimate fire.
 *
 * Known imperfection (documented, acceptable per research): an alert whose
 * cooldown expires exactly on a bucket boundary can theoretically produce
 * two adjacent-window keys back-to-back for what is really one triggering
 * event. This is a one-time near-boundary duplicate risk, not an ongoing
 * one, and is accepted rather than engineered around.
 *
 * Reused verbatim shape for future kinds sharing this column: Phase 6 will
 * use `news_alert:{userId}:{urlHash}`, Phase 7 `daily_digest:{userId}:{YYYY-MM-DD}`.
 */
export function computeAlertDedupeKey(alert: AlertEvalRow, now: Date): string {
  const bucket = Math.floor(now.getTime() / 1000 / (alert.cooldownMinutes * 60));
  return `price_alert:${alert.id}:${bucket}`;
}
