/**
 * ALRT-02 / ALRT-03 — shared alert-domain vocabulary consumed by the pure
 * evaluation core (`evaluate.ts`) and, later, the Supabase orchestration
 * sweep (05-05's scope). Declarations only, zero I/O — mirrors the
 * `src/lib/prices/` layout (types.ts stays a pure vocabulary file there too).
 */

/** 'above' fires when price > threshold; 'below' fires when price < threshold. */
export type AlertDirection = 'above' | 'below';

/**
 * The evaluator's view of a `price_alerts` row. Field names are camelCase
 * TS conventions; the Supabase orchestration layer (05-05) maps the snake_case
 * DB columns onto this shape at the read boundary.
 */
export interface AlertEvalRow {
  id: string;
  accountId: string;
  userId: string;
  instrumentId: string;
  direction: AlertDirection;
  threshold: number;
  isActive: boolean;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
}

/**
 * The evaluator's view of a `price_cache` row for one instrument. `price`
 * is null when never fetched; `fetchError` is non-null when the latest
 * refresh attempt failed. Both states must NEVER trigger an alert — the
 * house never-fabricate-a-value discipline applied to alerting.
 */
export interface PriceSnapshot {
  price: number | null;
  fetchError: string | null;
}

/** One alert that should fire this evaluation pass, carrying the observed price. */
export interface TriggeredAlert {
  alert: AlertEvalRow;
  price: number;
}
