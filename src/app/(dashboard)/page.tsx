import { Wallet, TrendingUp, Briefcase, Eye } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { WatchlistTable } from '@/components/dashboard/WatchlistTable';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { createClient } from '@/utils/supabase/server';
import { getAccountId, getHoldings, getWatchlist } from '@/lib/supabase/portfolio';

// Server Component: hydrates from real persisted data via the wave-2 data
// access layer (PORT-01..05,07). No price feed exists yet (Phase 3), so
// every price-dependent KPI is honestly shown as pending, never fabricated.
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests to /login; this is
  // a defense-in-depth guard, not the primary auth gate.
  if (!user) return null;

  const accountId = await getAccountId(supabase, user.id);
  const [holdings, watchlist] = await Promise.all([
    getHoldings(supabase, accountId),
    getWatchlist(supabase, accountId),
  ]);

  // "Total Invested" is cost basis (quantity * avgCost), NOT market value —
  // there is no live price feed until Phase 3. Note: this naively sums
  // across currencies without FX conversion (Phase 2 MVP simplification,
  // same spirit as editHolding/deleteHolding's documented simplifications).
  const totalInvested = holdings.reduce((sum, h) => sum + h.quantity * h.avgCost, 0);
  const totalInvestedFormatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(totalInvested);

  // Allocation grouped by exchange — the old mock `sector` field doesn't
  // exist on the real schema. Value is cost basis for that exchange.
  const allocationByExchange = new Map<string, number>();
  for (const h of holdings) {
    const costBasis = h.quantity * h.avgCost;
    allocationByExchange.set(h.exchange, (allocationByExchange.get(h.exchange) ?? 0) + costBasis);
  }
  const allocation = Array.from(allocationByExchange.entries()).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards — only honestly-derivable values pre-Phase-3 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Invested"
          value={totalInvestedFormatted}
          icon={<Wallet className="h-4.5 w-4.5" />}
          subtitle="Cost basis, not market value"
        />

        <KPICard
          title="Live Pricing"
          value="—"
          icon={<TrendingUp className="h-4.5 w-4.5" />}
          trendIsNeutral
          trend={{
            value: 'Phase 3',
            isPositive: true,
            label: 'Price feed not connected yet',
          }}
        />

        <KPICard
          title="Holdings"
          value={holdings.length.toString()}
          icon={<Briefcase className="h-4.5 w-4.5" />}
          subtitle="Positions tracked"
        />

        <KPICard
          title="Watchlist"
          value={watchlist.length.toString()}
          icon={<Eye className="h-4.5 w-4.5" />}
          subtitle="Symbols tracked"
        />
      </div>

      {/* Row 2: Holdings & Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <HoldingsTable holdings={holdings} />
        </div>
        <div className="lg:col-span-4">
          <AllocationChart data={allocation} />
        </div>
      </div>

      {/* Row 3 & 4: Watchlist & News */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8">
          <WatchlistTable items={watchlist} />
        </div>
        <div className="xl:col-span-4">
          {/* News (Phase 6) has no real source yet — NewsFeed already renders
              a correct honest empty state for zero items. */}
          <NewsFeed news={[]} />
        </div>
      </div>
    </div>
  );
}
