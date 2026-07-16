/**
 * ALRT-03 — HTML parse_mode message builder for Telegram sendMessage.
 * Deliberately uses HTML mode ONLY (never Telegram's legacy V2 markdown
 * parse mode) — see 05-RESEARCH-telegram-api.md Q4 / Pitfall 1: that legacy
 * mode requires escaping 18 characters including `.` and `-`, which appear
 * in every price string (`1082.40`, `-2.3%`) and would 400 the send with
 * "can't parse entities". HTML mode needs only 3 entities.
 * Pure, no I/O.
 */
import type { PriceAlertMessageInput } from './types';

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/**
 * Escapes only the three characters HTML parse_mode requires in a text
 * node: `&`, `<`, `>` (in that order — `&` first, or a later `&lt;` would
 * itself get re-escaped). Quotes/apostrophes are intentionally left as-is;
 * this is text-node escaping, not attribute-value escaping.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Composes an HTML-parse-mode price alert message and truncates to
 * Telegram's 4096-char sendMessage limit. displaySymbol is the only
 * user/instrument-controlled interpolated value, so it is the only one
 * escaped — threshold/price/currency are numbers/known-shape strings.
 */
export function buildPriceAlertMessage(input: PriceAlertMessageInput): string {
  const { displaySymbol, direction, threshold, price, currency } = input;
  const message = `<b>${escapeHtml(displaySymbol)}</b> crossed ${direction} ${threshold} — now <code>${price} ${currency}</code>`;
  return message.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH);
}
