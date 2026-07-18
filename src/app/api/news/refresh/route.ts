import { NextResponse } from 'next/server';
import { isAuthorizedRefreshRequest } from '@/lib/prices/ingest';
import { refreshAllNews } from '@/lib/news/ingest';
import { createAdminClient } from '@/utils/supabase/admin';
import { sweepNewsAlerts } from '@/lib/news/alert-sweep';
import { dispatchOutbox, type DispatchSummary } from '@/lib/notifications/outbox';

// NEWS-01/02/04/05/ALRT-04 — secret-guarded entry point for the news
// pipeline. Deliberately a SEPARATE route with its OWN independently-
// rotatable secret (NEWS_REFRESH_SECRET), never piggybacked onto the
// 3-hourly price cron (see .env.local's NOTIFY_DISPATCH_SECRET precedent —
// "kept SEPARATE from PRICE_REFRESH_SECRET for independent rotation / least
// privilege"; 06-RESEARCH-codebase Q4). News ingestion (RSS + Finnhub fetch +
// batched AI summarization) is far heavier/slower than the price fetch —
// bolting it onto the price cron risks pg_cron recording price refreshes as
// failing. News cadence is also independently tunable
// (account_settings.refresh_interval_news exists but wiring a news cron
// migration is EXPLICITLY out of scope this phase — deploy-gated like
// price_refresh_cron.sql, deferred until a public deploy exists).
//
// The guard check happens BEFORE createAdminClient()/refreshAllNews() are
// ever called — an unauthorized request never touches Supabase, matching the
// pure isAuthorizedRefreshRequest predicate tested in 03-02.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!isAuthorizedRefreshRequest(authHeader, process.env.NEWS_REFRESH_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const summary = await refreshAllNews(admin);

    // ALRT-04 — piggyback the news-alert sweep + outbox dispatch onto the
    // same refresh cycle, wrapped so a Telegram problem NEVER fails the news
    // refresh (prices/refresh/route.ts:23-27 precedent). No revalidatePath
    // here — this route runs outside a render context.
    let alertsResult: { candidates: number; enqueued: number; dispatched?: DispatchSummary; error?: string };
    try {
      const swept = await sweepNewsAlerts(admin);
      const dispatched = await dispatchOutbox(admin);
      alertsResult = { ...swept, dispatched };
    } catch (err) {
      alertsResult = {
        candidates: 0,
        enqueued: 0,
        error: err instanceof Error ? err.message : 'alerts step failed',
      };
    }

    return NextResponse.json({ success: true, ...summary, alerts: alertsResult });
  } catch (error) {
    console.error('News refresh failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
