/**
 * ALRT-01 / ALRT-03 — declarations-only shared vocabulary for the pure
 * Telegram logic layer (src/lib/telegram/*). No I/O, no runtime code here.
 */

/** Delivery classification the outbox dispatcher (05-04) branches on. */
export type SendErrorKind = 'retryable' | 'permanent';

/**
 * Result of classifying a Telegram sendMessage failure. `retryAfterSeconds`
 * is only ever populated for a 429 that actually carried `parameters.retry_after`.
 */
export type SendErrorClassification = {
  kind: SendErrorKind;
  retryAfterSeconds?: number;
};

/** Direction of the price threshold crossing that triggered the alert. */
export type AlertDirection = 'above' | 'below';

/** Input to buildPriceAlertMessage — everything needed to render one HTML-mode alert text. */
export type PriceAlertMessageInput = {
  displaySymbol: string;
  direction: AlertDirection;
  threshold: number;
  price: number;
  currency: string;
};
