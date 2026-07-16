'use server';

// ALRT-01 — the Telegram linking handshake's Server Action surface. Three
// actions:
//   - generateTelegramLink: cookie-bound, writes a pending telegram_links row
//     for the caller and renders the t.me deep link (token-free — the
//     username comes from TELEGRAM_BOT_USERNAME, never derived from the
//     token itself, 05-RESEARCH-telegram-api Q1).
//   - checkTelegramLink: the no-public-URL dev handshake — auth-gated via the
//     cookie client, then the ADMIN client for the on-demand getUpdates poll
//     + redeem writes (mirrors refreshPricesNow's auth-gate-then-admin
//     precedent in src/server-actions/prices.ts — the poll + bind writes are
//     service-role concerns, not user-RLS-authorized ones).
//   - unlinkTelegram: cookie-bound delete of the caller's own row (RLS-
//     authorized, no admin client needed).
//
// No setWebhook call anywhere in this file — a webhook set while only
// running locally makes getUpdates 409 forever (05-RESEARCH-telegram-api
// Pitfall 2).

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { generateLinkToken } from '@/lib/telegram/link-token';
import { parseStartPayload } from '@/lib/telegram/parse-start-payload';
import { getTelegramUpdates } from '@/lib/telegram/api';
import { redeemStartToken } from '@/lib/telegram/redeem';
import { getTelegramLink } from '@/lib/telegram/read';

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

type GenerateResult = { ok: true; url: string } | { ok: false; error: string };
type CheckResult = { ok: true; linked: boolean } | { ok: false; error: string };
type UnlinkResult = { ok: true } | { ok: false; error: string };

/**
 * generateTelegramLink — writes a fresh pending telegram_links row for the
 * caller (replacing any prior row for that user — regenerating a token is a
 * deliberate DELETE+INSERT, both RLS-authorized for "own row") and renders
 * `https://t.me/<username>?start=<token>`. The token is single-use, random,
 * high-entropy — it IS the auth; the link never encodes user identity.
 */
export async function generateTelegramLink(): Promise<GenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const username = process.env.TELEGRAM_BOT_USERNAME;
  if (!username) {
    return { ok: false, error: 'TELEGRAM_BOT_USERNAME is not configured' };
  }

  const token = generateLinkToken();
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString();

  // Replace any existing row for this user (own row — RLS-authorized INSERT
  // and DELETE policies both apply).
  const { error: deleteError } = await supabase
    .from('telegram_links')
    .delete()
    .eq('user_id', user.id);
  if (deleteError) return { ok: false, error: deleteError.message };

  const { error: insertError } = await supabase.from('telegram_links').insert({
    user_id: user.id,
    link_token: token,
    token_expires_at: expiresAt,
    status: 'pending',
    chat_id: null,
  });
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath('/alerts');
  return { ok: true, url: `https://t.me/${username}?start=${token}` };
}

/**
 * checkTelegramLink — the dev-mode on-demand poll (no public URL, no
 * webhook, no persistent poller). Auth-gates via the cookie client, then
 * hands off to the admin client for the poll + redeem writes.
 */
export async function checkTelegramLink(): Promise<CheckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = createAdminClient();

  const res = await getTelegramUpdates();
  if (!res.ok) {
    // Never swallowed — e.g. a 409 means a webhook is active and must be
    // deleted for local dev (05-RESEARCH-telegram-api Pitfall 2).
    return { ok: false, error: res.description };
  }

  let maxUpdateId: number | null = null;
  for (const update of res.updates) {
    if (maxUpdateId === null || update.update_id > maxUpdateId) {
      maxUpdateId = update.update_id;
    }
    const token = parseStartPayload(update.message?.text ?? '');
    const chatId = update.message?.chat?.id;
    if (token && typeof chatId === 'number') {
      await redeemStartToken(admin, token, chatId);
    }
  }

  // Acknowledge processed updates so the next poll does not keep re-seeing
  // them. Offset bookkeeping is deliberately stateless per-call — re-
  // scanning Telegram's <=24h backlog is negligible for a single-user app,
  // and the compare-and-set bind in redeemStartToken makes reprocessing
  // idempotent regardless (05-RESEARCH-telegram-api Q3).
  if (maxUpdateId !== null) {
    await getTelegramUpdates(maxUpdateId + 1);
  }

  const link = await getTelegramLink(supabase, user.id);
  revalidatePath('/alerts');
  return { ok: true, linked: link.status === 'linked' };
}

/** unlinkTelegram — deletes the caller's own row (RLS-authorized, own row). */
export async function unlinkTelegram(): Promise<UnlinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const { error } = await supabase.from('telegram_links').delete().eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/alerts');
  return { ok: true };
}
