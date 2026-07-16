/**
 * ALRT-03 / ALRT-05 — classifies a Telegram sendMessage failure into the
 * retryable-vs-permanent taxonomy the outbox dispatcher (05-04) consumes,
 * per 05-RESEARCH-telegram-api.md Q4's error taxonomy table. Pure, no I/O.
 *
 * Keys on error_code FIRST; description strings are matched by
 * case-insensitive substring, NEVER exact equality — Telegram's own docs
 * say error_code semantics are "subject to change" and description strings
 * doubly so (they are not a stable contract).
 */
import type { SendErrorClassification } from './types';

export function classifySendError(
  errorCode: number | null,
  description: string,
  retryAfterSeconds?: number
): SendErrorClassification {
  const desc = description.toLowerCase();

  // 429 rate-limited — always retryable, carry retry_after when present.
  if (errorCode === 429) {
    return { kind: 'retryable', retryAfterSeconds };
  }

  // 403 — blocked / can't-initiate-conversation. Permanent for this chat;
  // should not occur behind a handshake-bound allowlist, but if it does,
  // don't retry a dead chat.
  if (errorCode === 403) {
    return { kind: 'permanent' };
  }

  // 400 — client-error family. Specific known-bad-payload/allowlist causes
  // are called out for clarity, but ANY 400 is treated as permanent (an
  // unknown 4xx client error should not be hammered with retries either).
  if (errorCode === 400) {
    if (
      desc.includes('chat not found') ||
      desc.includes('parse entities') ||
      desc.includes('too long')
    ) {
      return { kind: 'permanent' };
    }
    return { kind: 'permanent' };
  }

  // 5xx (Telegram-side) or errorCode === null (network/transit failure) —
  // both retryable with backoff.
  if (errorCode === null || errorCode >= 500) {
    return { kind: 'retryable' };
  }

  // Default: unclassified — retry-then-dead-letter via the outbox's
  // attempts cap is safer than silently losing the message.
  return { kind: 'retryable' };
}
