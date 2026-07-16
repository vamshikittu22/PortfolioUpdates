/**
 * ALRT-05 — declarations-only shared vocabulary for the notifications outbox
 * layer (src/lib/notifications/*). No I/O, no runtime code here.
 */

/** All three roadmapped kinds — Phase 6 (news_alert) and Phase 7 (daily_digest)
 * are enumerated now so the outbox schema needs no later migration. */
export type NotificationKind = 'price_alert' | 'news_alert' | 'daily_digest';

/**
 * Row shape enqueueNotifications accepts (camelCase, TS-facing). The payload
 * MUST carry a fully pre-rendered `text` — the dispatcher is 100% kind-agnostic
 * and never re-renders a message from other payload fields.
 */
export type EnqueueRow = {
  userId: string;
  kind: NotificationKind;
  payload: { text: string; [k: string]: unknown };
  dedupeKey: string | null;
};

/** Snake_case DB shape of public.notifications_outbox (mirrors the migration). */
export type OutboxRow = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  payload: { text: string; [k: string]: unknown };
  dedupe_key: string | null;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
};

/** Result of one dispatchOutbox run — honest counts, never fabricated. */
export type DispatchSummary = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
};

/**
 * A single item from Telegram's getUpdates result array. Only the fields
 * the handshake flow (05-06) actually reads are typed; everything else in
 * the real payload is ignored. Declared here (not telegram/api.ts) per this
 * plan's spec, re-exported for api.ts's convenience.
 */
export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number };
  };
};
