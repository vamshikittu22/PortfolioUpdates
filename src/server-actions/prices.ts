'use server';

// refreshPricesNow — auth-gated on-demand trigger for the UI (PRICE-03).
// Does NOT hit the HTTP route with the cron secret — calls the orchestration
// function in-process after its own getUser() check, exactly like AUTH-05's
// established pattern (src/utils/supabase/admin.ts's own warning comment):
// the browser never sees the service-role key, and the cron secret never
// needs to leave the server either.

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { refreshAllPrices, type RefreshSummary } from '@/lib/prices/refresh-service';
import { evaluateAndEnqueueAlerts } from '@/lib/alerts/sweep';
import { dispatchOutbox, type DispatchSummary } from '@/lib/notifications/outbox';
import { revalidatePath } from 'next/cache';

export interface RefreshAlertsResult {
  triggered: number;
  enqueued: number;
  dispatched?: DispatchSummary;
  error?: string;
}

export async function refreshPricesNow(): Promise<
  | { success: true; summary: RefreshSummary; alerts: RefreshAlertsResult }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  try {
    // Elevated write access is required here (price_cache/fx_cache have no
    // authenticated write policy per Phase 1's rls_fixes migration) — this mirrors
    // the cron path exactly, just triggered by a signed-in user instead of pg_cron.
    // The admin client is used ONLY for the refresh write, never returned to the
    // caller or exposed beyond this server-only function.
    const admin = createAdminClient();
    const summary = await refreshAllPrices(admin);

    // ALRT-03/ALRT-05 — piggyback alert evaluation + outbox dispatch onto
    // the same on-demand refresh, wrapped so a Telegram problem NEVER fails
    // this Server Action (05-RESEARCH-schema-outbox Pitfall 6): the price
    // refresh itself already succeeded and must be reported as such.
    let alerts: RefreshAlertsResult;
    try {
      const evaluated = await evaluateAndEnqueueAlerts(admin);
      const dispatched = await dispatchOutbox(admin);
      alerts = { ...evaluated, dispatched };
    } catch (err) {
      alerts = { triggered: 0, enqueued: 0, error: err instanceof Error ? err.message : 'alert step failed' };
    }

    revalidatePath('/');
    revalidatePath('/holdings');
    revalidatePath('/alerts');
    return { success: true, summary, alerts };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Refresh failed' };
  }
}
