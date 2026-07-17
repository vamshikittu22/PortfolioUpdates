import { NextResponse } from 'next/server';
import { isAuthorizedRefreshRequest } from '@/lib/prices/ingest';
import { runDailyDigest } from '@/lib/digest/run';
import { dispatchOutbox } from '@/lib/notifications/outbox';
import { createAdminClient } from '@/utils/supabase/admin';

// DGST-01 — secret-guarded daily digest entry point: the deploy-gated
// pg_cron target (07-01's cron migration, applied only once a public URL
// exists — same treatment as price_refresh_cron.sql) AND the manual curl
// lever for local verification. Reuses the SAME pure predicate as
// /api/prices/refresh and /api/notifications/dispatch: an empty/unset
// secret ALWAYS denies. The guard runs BEFORE createAdminClient() — an
// unauthorized request never touches Supabase. No revalidatePath here —
// this route runs outside a render context (prices route precedent).
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!isAuthorizedRefreshRequest(authHeader, process.env.DIGEST_RUN_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const digest = await runDailyDigest(admin);
    const dispatched = await dispatchOutbox(admin);
    return NextResponse.json({ success: true, digest, dispatched });
  } catch (error) {
    console.error('Daily digest run failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
