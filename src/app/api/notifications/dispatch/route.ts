import { NextResponse } from 'next/server';
import { isAuthorizedRefreshRequest } from '@/lib/prices/ingest';
import { dispatchOutbox } from '@/lib/notifications/outbox';
import { createAdminClient } from '@/utils/supabase/admin';

// ALRT-05 — standalone secret-guarded dispatch lever: the manual "a message
// failed, send now without waiting for the next price refresh" path, the local
// verification path (05-09), and the future deploy-time cron target. Reuses the
// SAME pure predicate as /api/prices/refresh: an empty/unset secret ALWAYS
// denies. Guard runs BEFORE createAdminClient() — an unauthorized request never
// touches Supabase.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!isAuthorizedRefreshRequest(authHeader, process.env.NOTIFY_DISPATCH_SECRET ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await dispatchOutbox(createAdminClient());
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('Outbox dispatch failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
