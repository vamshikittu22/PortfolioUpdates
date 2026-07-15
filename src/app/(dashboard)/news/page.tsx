import { Newspaper, Filter, Settings2 } from 'lucide-react';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { WatchlistTable } from '@/components/dashboard/WatchlistTable';
import { createClient } from '@/utils/supabase/server';
import { getAccountId } from '@/lib/supabase/portfolio';
import { getPricedWatchlist } from '@/lib/prices/get-portfolio-pnl';

// Server Component: same real-data pattern as the dashboard/holdings pages
// (PORT-01..05,07) — fetches the REAL persisted watchlist via getWatchlist,
// no mock store. News itself (Phase 6) has no real source yet — NewsFeed
// already renders a correct honest empty state for zero items.
//
// The old "Tracking Panel" (trackedSymbols add/remove, sentiment toggle
// status bar) relied entirely on the deleted mock account store's
// `newsPrefs`, a Phase 6 concept with no backing table yet. Per plan 02-06
// Task 2 it is removed outright rather than wired to fake local state that
// looks persisted but isn't. Filters/Preferences remain as inert affordances
// (no mock data dependency) pending their own future wiring.
export default async function NewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests to /login; this is
  // a defense-in-depth guard, not the primary auth gate.
  if (!user) return null;

  const accountId = await getAccountId(supabase, user.id);
  const watchlist = await getPricedWatchlist(supabase, accountId);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
              <Newspaper className="h-6 w-6 text-primary" />
              Market Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Curated signals for your holdings and watchlist
            </p>
          </div>

          {/* Toolbar — high-contrast pill buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border-2 border-border bg-card text-foreground hover:bg-muted hover:border-primary/40 shadow-sm">
              <Filter className="h-3.5 w-3.5 text-primary" />
              Filters
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border-2 border-border bg-card text-foreground hover:bg-muted hover:border-primary/40 shadow-sm">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              Preferences
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7">
          <div className="h-[800px]">
            {/* News (Phase 6) has no real source yet — NewsFeed already
                renders a correct honest empty state for zero items. */}
            <NewsFeed news={[]} />
          </div>
        </div>
        <div className="xl:col-span-5 space-y-6">
          <WatchlistTable items={watchlist} />

          <div className="glass-card rounded-2xl p-5 border border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
              <Newspaper className="h-4 w-4 text-primary" />
              Why this matters
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The intelligence feed filters out market noise by exclusively surfacing news that directly impacts your holdings or watchlist. The sentiment engine scores each article to help you gauge market reaction instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
