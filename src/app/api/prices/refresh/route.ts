import { NextResponse } from 'next/server';
import { isAuthorizedRefreshRequest } from '@/lib/prices/ingest';
import { refreshAllPrices } from '@/lib/prices/refresh-service';
import { createAdminClient } from '@/utils/supabase/admin';

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
    const summary = await refreshAllPrices(createAdminClient());
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('Price refresh failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
