/**
 * DGST-01 — the daily digest's NARROW Phase-6 news seam.
 *
 * CROSS-PHASE CONTRACT (by design, see 07-03-PLAN.md's header note): this
 * file reads the tables Phase 6's 06-01 migration (`supabase/migrations/
 * 20260717120000_news_pipeline.sql`) authors — `news_items` (extended with
 * `summary_status`) and `news_item_instruments` — by TABLE NAME ONLY. It
 * NEVER imports anything from `src/lib/news/*` (that module tree belongs to
 * Phase 6 and, depending on execution order, may not exist yet — a TS
 * import here would break `tsc` today). This is the only coupling point
 * between Phase 7 and Phase 6; the header comment doubles as the seam's
 * contract test.
 *
 * Phase 6 is not yet executed/applied as this file is written. That is
 * expected, not a bug: this function degrades HONESTLY rather than
 * fabricating news or throwing. Postgres 42P01 (undefined_table) and 42703
 * (undefined_column) are the exact error codes a not-yet-applied Phase 6
 * migration produces (`news_item_instruments` or `summary_status` not
 * existing yet) — but every error, not just those two codes, degrades: a
 * news problem must never kill the portfolio digest (the refresh-tail
 * failure-isolation rationale in src/app/api/prices/refresh/route.ts).
 * Live news inclusion is verified at 07-05, AFTER Phase 6 executes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DigestNewsItem } from './types';

export type DailyDigestNewsResult = {
  items: DigestNewsItem[];
  degraded: boolean;
  error: string | null;
};

const MAX_ITEMS = 5;

interface NewsItemRow {
  id: string;
  headline: string;
  summary: string | null;
  url: string;
  published_at: string;
  summary_status: string;
}

interface NewsItemInstrumentRow {
  news_item_id: string;
  news_items: NewsItemRow | NewsItemRow[] | null;
}

/** Supabase nests a to-one FK relation as an object or a one-element array
 * depending on client/type inference — normalize both (same pattern as
 * src/lib/supabase/portfolio.ts's firstInstrument). */
function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * getDailyDigestNews — the day's summarized, portfolio-relevant news for one
 * user's held+watched instruments. De-duplicates an article that matches
 * several instruments down to one appearance, sorts newest-first, and caps
 * at 5 items so the digest message never balloons.
 */
export async function getDailyDigestNews(
  admin: SupabaseClient,
  instrumentIds: string[],
  sinceIso: string
): Promise<DailyDigestNewsResult> {
  if (instrumentIds.length === 0) {
    // Nothing to match against — not a failure, just nothing to show.
    return { items: [], degraded: false, error: null };
  }

  const { data, error } = await admin
    .from('news_item_instruments')
    .select(
      `news_item_id, news_items!inner ( id, headline, summary, url, published_at, summary_status )`
    )
    .in('instrument_id', instrumentIds)
    .eq('news_items.summary_status', 'summarized')
    .gte('news_items.published_at', sinceIso);

  if (error) {
    // NEVER throw — 42P01/undefined_table (news_item_instruments not
    // created yet) and 42703/undefined_column (summary_status not added
    // yet) are the expected "Phase 6 not applied" signatures, but ANY error
    // here degrades honestly rather than aborting the digest.
    return { items: [], degraded: true, error: error.message };
  }

  const rows = (data ?? []) as unknown as NewsItemInstrumentRow[];

  const byId = new Map<string, NewsItemRow>();
  for (const row of rows) {
    const newsItem = firstOf(row.news_items);
    if (!newsItem) continue; // news_item_id is NOT NULL FK; guard is type-safety only
    if (!byId.has(newsItem.id)) byId.set(newsItem.id, newsItem);
  }

  const items: DigestNewsItem[] = Array.from(byId.values())
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, MAX_ITEMS)
    .map((item) => ({ headline: item.headline, summary: item.summary, url: item.url }));

  return { items, degraded: false, error: null };
}
