'use server';

// DGST-02 — the digest's Server Action surface. Two actions:
//   - setDigestEnabled: cookie-bound own-row upsert of digest_preferences
//     (RLS-authorized INSERT+UPDATE policies from the 07-01 migration —
//     NEVER the admin client; this is a user-owned toggle, not a
//     cross-user concern).
//   - sendTestDigest: the auth-gate-then-admin precedent
//     (src/server-actions/telegram.ts's checkTelegramLink /
//     src/server-actions/prices.ts's refreshPricesNow): cookie client gates
//     via getUser(), then the admin client composes + enqueues + dispatches
//     for the CALLER ONLY, with a null dedupe key so a one-off test send
//     bypasses the once-a-day bucket and can always be re-triggered
//     (alerts_telegram.sql:97 anticipated exactly this — "rows with a null
//     dedupe_key are never deduped").
//
// No bare re-export statements anywhere in this file — the
// alerts.ts Rule-3 bundler trap (a bare re-export silently zeroes out a
// 'use server' module's entire client-bundle export surface); every export
// below is a real, directly-declared async function.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getTelegramLink } from '@/lib/telegram/read';
import { composeDigestForUser } from '@/lib/digest/run';
import { dispatchOutbox, enqueueNotifications, type DispatchSummary } from '@/lib/notifications/outbox';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * setDigestEnabled — upserts the caller's OWN digest_preferences row via the
 * cookie-bound RLS client. `enabled: false` with no prior row is still a
 * valid write (the honest opt-in default is also expressible as an explicit
 * row, per the migration's own comment).
 */
export async function setDigestEnabled(enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('digest_preferences')
    .upsert(
      { user_id: user.id, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) return { success: false, error: error.message };

  revalidatePath('/alerts');
  return { success: true };
}

export type TestDigestResult =
  | {
      success: true;
      dispatched: DispatchSummary;
      newsDegraded: boolean;
    }
  | { success: false; error: string };

/**
 * sendTestDigest — composes and sends ONE digest for the caller only,
 * bypassing the daily dedupe bucket (dedupeKey: null) so it can be
 * re-triggered any time, including after today's real digest already went
 * out. Reports honest dispatch counts — never fabricates success. Note:
 * dispatchOutbox claims ALL due pending rows, not just this one — other
 * pending notifications may ride along in the same claim batch; that is
 * correct behavior (the dispatcher is kind-agnostic), reported honestly via
 * the returned summary.
 */
export async function sendTestDigest(): Promise<TestDigestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const link = await getTelegramLink(supabase, user.id);
  if (link.status !== 'linked') {
    return { success: false, error: 'Telegram is not linked — link it above first.' };
  }

  const admin = createAdminClient();

  const outcome = await composeDigestForUser(admin, user.id, new Date());
  if (!outcome.ok) {
    return { success: false, error: outcome.error };
  }

  await enqueueNotifications(admin, [
    {
      userId: user.id,
      kind: 'daily_digest',
      payload: { text: outcome.text, test: true },
      dedupeKey: null,
    },
  ]);

  // With no TELEGRAM_BOT_TOKEN configured, the send fails honestly inside
  // the dispatcher's own "not configured" classification — the counts below
  // surface it; success here only ever means "the request completed", never
  // "the message was delivered".
  const dispatched = await dispatchOutbox(admin);

  return { success: true, dispatched, newsDegraded: outcome.newsDegraded };
}
