/**
 * ALRT-01 — parses the text of a Telegram `/start <payload>` message update
 * into the deep-link token, per the handshake design in
 * 05-RESEARCH-telegram-api.md Q2. Pure, no I/O.
 *
 * Telegram's deep-link payload charset is exactly `[A-Za-z0-9_-]`, up to 64
 * chars (core.telegram.org/bots/features "Deep linking"). A bare `/start`
 * (no payload), any non-/start text, or a payload containing whitespace or
 * any other character outside that charset all return null — the caller
 * must never bind a handshake on a malformed payload.
 */
export function parseStartPayload(text: string): string | null {
  const prefix = '/start ';
  if (!text.startsWith(prefix)) return null;

  const remainder = text.slice(prefix.length);
  if (remainder.length === 0) return null;

  const match = /^[A-Za-z0-9_-]{1,64}$/.exec(remainder);
  if (!match) return null;

  return remainder;
}
