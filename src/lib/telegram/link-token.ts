/**
 * ALRT-01 — single-use, high-entropy deep-link token generation + shape
 * validation, per 05-RESEARCH-telegram-api.md Q2's secure binding design.
 * Pure, no I/O (crypto.randomBytes is a synchronous CPU operation, not I/O).
 */
import { randomBytes } from 'node:crypto';

/**
 * Generates a 43-char base64url token (32 random bytes) — well within
 * Telegram's 64-char deep-link payload limit and using exactly the allowed
 * charset ([A-Za-z0-9_-]). The token's entropy IS the auth: never encode
 * user identity in it.
 */
export function generateLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Validates that a string matches Telegram's general deep-link payload
 * shape (1-64 chars, [A-Za-z0-9_-]). Deliberately more permissive than the
 * exact 43-char length generateLinkToken always produces, since this also
 * guards parseStartPayload's output before a DB lookup.
 */
export function isValidLinkTokenShape(t: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(t);
}
