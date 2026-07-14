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
import { revalidatePath } from 'next/cache';

export async function refreshPricesNow(): Promise<
  { success: true; summary: RefreshSummary } | { success: false; error: string }
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
    const summary = await refreshAllPrices(createAdminClient());
    revalidatePath('/');
    revalidatePath('/holdings');
    return { success: true, summary };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Refresh failed' };
  }
}
