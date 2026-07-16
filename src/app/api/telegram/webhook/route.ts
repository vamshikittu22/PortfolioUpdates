import { NextResponse } from 'next/server';
import { parseStartPayload } from '@/lib/telegram/parse-start-payload';
import { redeemStartToken } from '@/lib/telegram/redeem';
import { createAdminClient } from '@/utils/supabase/admin';

// ALRT-01 — production inbound webhook. Telegram delivers its secret in the
// X-Telegram-Bot-Api-Secret-Token header (set via setWebhook's secret_token).
// The header is checked BEFORE any Supabase client is constructed — same
// guard-before-Supabase ordering as /api/prices/refresh. /api/* is already
// exempt from proxy login redirects (proxy.ts:54), so this handler is reached.
// DEPLOY-GATED: live setWebhook is deferred to 05-09 — never set a webhook while
// only running locally (it would 409 the dev getUpdates poll in
// src/server-actions/telegram.ts's checkTelegramLink).
export async function POST(request: Request) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const update = await request.json();
    const text: string = update?.message?.text ?? '';
    const chatId: number | undefined = update?.message?.chat?.id;
    const token = parseStartPayload(text);
    if (token && typeof chatId === 'number') {
      await redeemStartToken(createAdminClient(), token, chatId);
    }
    // Always 200 so Telegram does not retry a non-/start update forever.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook failed:', error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
