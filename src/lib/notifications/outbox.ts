/**
 * ALRT-05 — transactional-outbox engine: dedupe-safe enqueue plus the SOLE
 * Telegram-sending path (`dispatchOutbox`). Both functions accept an
 * ALREADY-CONSTRUCTED admin client — the "which client" decision stays at
 * the call site (mirrors src/lib/prices/refresh-service.ts), never built
 * here.
 *
 * `dispatchOutbox` claims due rows via the `claim_due_notifications`
 * SECURITY DEFINER RPC (FOR UPDATE SKIP LOCKED — supabase-js cannot express
 * that directly), resolves each recipient's linked chat, sends sequentially
 * (NEVER Promise.all — Telegram rate limits per-chat and has no idempotency
 * key on sendMessage; a double-claim/double-send would land twice on a
 * user's phone), and records outcomes honestly: sent / retried (429 honors
 * the API-provided retry_after; 5xx/network relies on claim's own backoff) /
 * failed (+ revokes the telegram_links row on a 403/blocked send so the
 * allowlist stays honest). A delivery failure therefore retries on the next
 * dispatch run instead of being silently lost.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from '@/lib/telegram/api';
import { classifySendError } from '@/lib/telegram/classify-send-error';
import type { EnqueueRow, OutboxRow, DispatchSummary } from './types';

/**
 * Inserts rows into `notifications_outbox`, suppressing a duplicate enqueue
 * inside one cooldown window at the DB layer via the partial unique index
 * on `dedupe_key` (rows with a null dedupe_key are never deduped — the
 * index only covers non-null keys). No-op on empty input.
 */
export async function enqueueNotifications(
  admin: SupabaseClient,
  rows: EnqueueRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const mapped = rows.map((row) => ({
    user_id: row.userId,
    kind: row.kind,
    payload: row.payload,
    dedupe_key: row.dedupeKey,
  }));

  const { error } = await admin
    .from('notifications_outbox')
    .upsert(mapped, { onConflict: 'dedupe_key', ignoreDuplicates: true });

  if (error) {
    throw new Error(`enqueueNotifications failed: ${error.message}`);
  }
}

const NOW_ISO = () => new Date().toISOString();

/**
 * Claims up to 25 due pending rows, resolves each recipient's linked
 * Telegram chat, sends sequentially, and maps each outcome to
 * sent/retried/failed. Never throws for a single bad row — one poisoned
 * send does not abort the batch (fetchPrices precedent).
 */
export async function dispatchOutbox(admin: SupabaseClient): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, retried: 0, failed: 0 };

  const { data: claimed, error: claimError } = await admin.rpc('claim_due_notifications', {
    p_limit: 25,
  });

  if (claimError) {
    throw new Error(`claim_due_notifications failed: ${claimError.message}`);
  }

  const rows = (claimed ?? []) as OutboxRow[];
  summary.claimed = rows.length;
  if (rows.length === 0) return summary;

  // Batch-resolve recipients: only rows where the link is 'linked' AND a
  // chat_id is present may ever be sent to.
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: links, error: linksError } = await admin
    .from('telegram_links')
    .select('user_id, chat_id, status')
    .in('user_id', userIds);

  if (linksError) {
    throw new Error(`telegram_links lookup failed: ${linksError.message}`);
  }

  const chatByUser = new Map<string, number | string>();
  for (const link of links ?? []) {
    if (link.status === 'linked' && link.chat_id !== null && link.chat_id !== undefined) {
      chatByUser.set(link.user_id, link.chat_id);
    }
  }

  // Sequential per-chat send — never Promise.all (rate-limit compliance,
  // 05-RESEARCH-telegram-api Q4).
  for (const row of rows) {
    const chatId = chatByUser.get(row.user_id);

    if (chatId === undefined) {
      const { error } = await admin
        .from('notifications_outbox')
        .update({ status: 'failed', last_error: 'no linked telegram chat' })
        .eq('id', row.id);
      if (error) throw new Error(`outbox update failed: ${error.message}`);
      summary.failed++;
      continue;
    }

    const result = await sendTelegramMessage(chatId, row.payload.text);

    if (result.ok) {
      const { error } = await admin
        .from('notifications_outbox')
        .update({ status: 'sent', sent_at: NOW_ISO(), last_error: null })
        .eq('id', row.id);
      if (error) throw new Error(`outbox update failed: ${error.message}`);
      summary.sent++;
      continue;
    }

    const classification = classifySendError(result.errorCode, result.description, result.retryAfter);

    if (classification.kind === 'retryable') {
      const update: Record<string, unknown> = { last_error: result.description };
      if (result.errorCode === 429 && classification.retryAfterSeconds !== undefined) {
        // Honest, API-provided wait — overwrites claim's own exponential
        // backoff with the real value Telegram told us to wait.
        update.next_attempt_at = new Date(
          Date.now() + classification.retryAfterSeconds * 1000
        ).toISOString();
      }
      const { error } = await admin.from('notifications_outbox').update(update).eq('id', row.id);
      if (error) throw new Error(`outbox update failed: ${error.message}`);
      summary.retried++;
      continue;
    }

    // Permanent failure.
    const { error } = await admin
      .from('notifications_outbox')
      .update({ status: 'failed', last_error: result.description })
      .eq('id', row.id);
    if (error) throw new Error(`outbox update failed: ${error.message}`);
    summary.failed++;

    // Blocked/chat-not-found sends mean the allowlist entry is stale — flip
    // it to 'revoked' so the user must re-handshake (05-RESEARCH-schema-outbox
    // Dispatch Architecture; keeps telegram_links honest).
    const desc = result.description.toLowerCase();
    if (
      result.errorCode === 403 ||
      desc.includes('blocked') ||
      desc.includes('chat not found')
    ) {
      const { error: revokeError } = await admin
        .from('telegram_links')
        .update({ status: 'revoked' })
        .eq('user_id', row.user_id);
      if (revokeError) {
        throw new Error(`telegram_links revoke failed: ${revokeError.message}`);
      }
    }
  }

  return summary;
}
