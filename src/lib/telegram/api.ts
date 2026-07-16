/**
 * ALRT-03 / ALRT-05 — raw-fetch wrapper around Telegram's Bot API.
 *
 * This file owns ONLY "how do we get the bytes and handle the network
 * failing" (mirrors src/lib/prices/fetch-prices.ts). All "what does this
 * response mean" classification lives in the tested pure function
 * `classifySendError` (src/lib/telegram/classify-send-error.ts, 05-02) and
 * is reused by the caller (src/lib/notifications/outbox.ts, 05-04), never
 * reimplemented here.
 *
 * `TELEGRAM_BOT_TOKEN` is read server-side ONLY — it must never carry the
 * client-exposing env-var prefix used elsewhere in this codebase for public
 * config (src/utils/supabase/admin.ts:23 rule: a server-only secret must
 * never be exposed to the browser). Until BotFather is run, the token is a labeled
 * placeholder in `.env.local` (Phase-1 env precedent, e.g. YOUTUBE_API_KEY)
 * — an unset/placeholder token yields an honest error result, never a raw
 * throw and never a fabricated success.
 */
import type { TelegramUpdate } from '@/lib/notifications/types';

export type { TelegramUpdate };

export type TelegramSendResult =
  | { ok: true; messageId: number }
  | { ok: false; errorCode: number | null; description: string; retryAfter?: number };

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/** Returns the bot API base URL, or null if TELEGRAM_BOT_TOKEN is unset/blank. */
function getApiBase(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return `https://api.telegram.org/bot${token}`;
}

/**
 * POSTs a message to a Telegram chat via `sendMessage`. Parses the JSON body
 * on EVERY response (05-RESEARCH-telegram-api Q4 / Pitfall 3: `body.ok` must
 * be checked — a non-2xx HTTP status also carries a JSON body describing why).
 * Never throws for a single send; a thrown/transit error resolves to an
 * honest `{ ok: false, errorCode: null, ... }` so `classifySendError` treats
 * it as retryable rather than crashing the outbox loop.
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string
): Promise<TelegramSendResult> {
  const base = getApiBase();
  if (base === null) {
    return { ok: false, errorCode: null, description: 'TELEGRAM_BOT_TOKEN is not configured' };
  }

  try {
    const res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    });

    const body = await res.json();

    if (body?.ok === true) {
      return { ok: true, messageId: body.result?.message_id };
    }

    return {
      ok: false,
      errorCode: typeof body?.error_code === 'number' ? body.error_code : res.status,
      description: typeof body?.description === 'string' ? body.description : '',
      retryAfter: body?.parameters?.retry_after,
    };
  } catch (err) {
    return {
      ok: false,
      errorCode: null,
      description: err instanceof Error ? err.message : 'Unknown fetch error',
    };
  }
}

/**
 * Polls `getUpdates` (long-polling disabled — `timeout: 0` — this project
 * calls it from a short-lived Server Action/route, not a long-running
 * worker). A 409 (webhook active / a concurrent poller already holds the
 * long-poll) is surfaced honestly, never swallowed as "no updates" seen
 * (05-RESEARCH-telegram-api Pitfall 2).
 */
export async function getTelegramUpdates(
  offset?: number
): Promise<{ ok: true; updates: TelegramUpdate[] } | { ok: false; description: string }> {
  const base = getApiBase();
  if (base === null) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured' };
  }

  try {
    const res = await fetch(`${base}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeout: 0,
        allowed_updates: ['message'],
        ...(offset !== undefined ? { offset } : {}),
      }),
    });

    const body = await res.json();

    if (body?.ok === true) {
      return { ok: true, updates: Array.isArray(body.result) ? (body.result as TelegramUpdate[]) : [] };
    }

    return {
      ok: false,
      description:
        typeof body?.description === 'string'
          ? body.description
          : `getUpdates failed with HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : 'Unknown fetch error' };
  }
}

/** Cheapest token-valid probe — GET /getMe. */
export async function getTelegramMe(): Promise<
  { ok: true; username: string } | { ok: false; description: string }
> {
  const base = getApiBase();
  if (base === null) {
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured' };
  }

  try {
    const res = await fetch(`${base}/getMe`);
    const body = await res.json();

    if (body?.ok === true) {
      return { ok: true, username: body.result?.username ?? '' };
    }

    return {
      ok: false,
      description:
        typeof body?.description === 'string'
          ? body.description
          : `getMe failed with HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : 'Unknown fetch error' };
  }
}
