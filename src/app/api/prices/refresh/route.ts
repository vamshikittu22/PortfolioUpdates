import { NextResponse } from 'next/server';
import { isAuthorizedRefreshRequest } from '@/lib/prices/ingest';
import { refreshAllPrices } from '@/lib/prices/refresh-service';
import { createAdminClient } from '@/utils/supabase/admin';
import { evaluateAndEnqueueAlerts } from '@/lib/alerts/sweep';
import { dispatchOutbox, type DispatchSummary } from '@/lib/notifications/outbox';

// PRICE-01/02/03/07 — secret-guarded entry point for pg_cron (see
// supabase/migrations/*price_refresh_cron.sql). The guard check happens
// BEFORE createAdminClient()/refreshAllPrices() are ever called — an
// unauthorized request never touches Supabase, matching the pure
// isAuthorizedRefreshRequest predicate tested in 03-02.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!isAuthorizedRefreshRequest(authHeader, process.env.PRICE_REFRESH_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const summary = await refreshAllPrices(admin);

    // ALRT-03/ALRT-05 — piggyback alert evaluation + outbox dispatch onto
    // the same refresh cycle, wrapped so a Telegram problem NEVER fails the
    // price refresh (05-RESEARCH-schema-outbox Pitfall 6): pg_cron would
    // else record prices as failing when they actually succeeded. No
    // revalidatePath here — this route runs outside a render context.
    let alertsResult: { triggered: number; enqueued: number; dispatched?: DispatchSummary; error?: string };
    try {
      const evaluated = await evaluateAndEnqueueAlerts(admin);
      const dispatched = await dispatchOutbox(admin);
      alertsResult = { ...evaluated, dispatched };
    } catch (err) {
      alertsResult = { triggered: 0, enqueued: 0, error: err instanceof Error ? err.message : 'alert step failed' };
    }

    return NextResponse.json({ success: true, ...summary, alerts: alertsResult });
  } catch (error) {
    console.error('Price refresh failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
