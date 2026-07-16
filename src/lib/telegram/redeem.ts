/**
 * ALRT-01 — the shared token-binding logic behind the Telegram /start
 * handshake. Called from BOTH the dev on-demand poll (checkTelegramLink,
 * 05-06 Task 2) and the deploy-gated webhook route (05-06 Task 3) — one
 * code path, two entry points, per 05-RESEARCH-telegram-api Q2/Q3.
 *
 * The random token IS the auth (never encode user identity in the /start
 * payload — parseStartPayload only ever returns an opaque string). Binding
 * REQUIRES the admin client: telegram_links has no authenticated UPDATE
 * policy (05-01's allowlist closure) — chat_id/status='linked' can only
 * ever be written by the service role, once a user has proven control of
 * the chat by sending the exact token from it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type RedeemResult = { ok: true; userId: string } | { ok: false; reason: string };

interface TelegramLinkRow {
  user_id: string;
  status: 'pending' | 'linked' | 'revoked';
  token_expires_at: string;
  chat_id: number | string | null;
}

/**
 * Validates a single-use link token and idempotently binds `chatId` to it.
 *
 * - Unknown token -> `{ ok:false, reason:'unknown token' }` (no further
 *   detail leaked beyond that generic reason).
 * - Already `linked` to this EXACT chat_id -> idempotent success. A
 *   replayed /start update (e.g. the dev poll re-scanning its ≤24h backlog,
 *   or a since-activated webhook redelivering) must never error or
 *   double-bind.
 * - `status !== 'pending'` (already used by a different chat, or revoked)
 *   or expired -> `{ ok:false, reason:'expired or already used' }`.
 * - Bind via a compare-and-set UPDATE ... WHERE status='pending' — a
 *   concurrent redeem of the same token affects zero rows the second time,
 *   so two racing redeems can never land two different chat_ids.
 * - A `telegram_links_chat_unique` violation (this chat already backs a
 *   DIFFERENT user's link) maps to an honest, non-leaking reason instead of
 *   a raw Postgres error.
 */
export async function redeemStartToken(
  admin: SupabaseClient,
  token: string,
  chatId: number
): Promise<RedeemResult> {
  const { data, error } = await admin
    .from('telegram_links')
    .select('user_id, status, token_expires_at, chat_id')
    .eq('link_token', token)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'lookup failed' };
  }

  const row = data as TelegramLinkRow | null;
  if (!row) {
    return { ok: false, reason: 'unknown token' };
  }

  if (row.status === 'linked' && row.chat_id !== null && Number(row.chat_id) === chatId) {
    return { ok: true, userId: row.user_id };
  }

  const isExpired = new Date(row.token_expires_at).getTime() < Date.now();
  if (row.status !== 'pending' || isExpired) {
    return { ok: false, reason: 'expired or already used' };
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin
    .from('telegram_links')
    .update({ chat_id: chatId, status: 'linked', linked_at: nowIso, updated_at: nowIso })
    .eq('link_token', token)
    .eq('status', 'pending');

  if (updateError) {
    if (updateError.code === '23505') {
      return { ok: false, reason: 'this Telegram chat is already linked to another account' };
    }
    return { ok: false, reason: 'bind failed' };
  }

  return { ok: true, userId: row.user_id };
}
