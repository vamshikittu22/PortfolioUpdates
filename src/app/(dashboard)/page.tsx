import { Wallet, TrendingUp, Briefcase, Eye } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { WatchlistTable } from '@/components/dashboard/WatchlistTable';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { createClient } from '@/utils/supabase/server';
import { getAccountId, getWatchlist } from '@/lib/supabase/portfolio';
import { getPortfolioPnL } from '@/lib/prices/get-portfolio-pnl';
import type { Currency } from '@/lib/types';

// Server Component: hydrates from real persisted data via the wave-2 data
// access layer (PORT-01..05,07) PLUS Phase 3's price/P&L glue
// (getPortfolioPnL). A held instrument with no cached price yet still shows
// an honest pending state — never a fabricated number.
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests to /login; this is
  // a defense-in-depth guard, not the primary auth gate.
  if (!user) return null;

  const accountId = await getAccountId(supabase, user.id);

  // fx_cache only stores the USD_INR pair today — base_currency determines
  // whether that rate is even oriented usefully for this account (see
  // get-portfolio-pnl.ts's fxUnavailable doc comment).
  const { data: accountRow } = await supabase
    .from('investment_accounts')
    .select('base_currency')
    .eq('id', accountId)
    .single();
  const baseCurrency: Currency = (accountRow?.base_currency as Currency | undefined) ?? 'INR';

  const [{ holdings, portfolioTotal, fxRate, fxUnavailable }, watchlist] = await Promise.all([
    getPortfolioPnL(supabase, accountId, baseCurrency),
    getWatchlist(supabase, accountId),
  ]);

  const anyPriced = holdings.some((h) => h.status === 'priced');

  const currencyFmt = (value: number) =>
    new Intl.NumberFormat(baseCurrency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: baseCurrency,
      maximumFractionDigits: 0,
    }).format(value);

  // Allocation grouped by exchange — the old mock `sector` field doesn't
  // exist on the real schema. Value is cost basis for that exchange.
  const allocationByExchange = new Map<string, number>();
  for (const h of holdings) {
    const costBasis = h.quantity * h.avgCost;
    allocationByExchange.set(h.exchange, (allocationByExchange.get(h.exchange) ?? 0) + costBasis);
  }
  const allocation = Array.from(allocationByExchange.entries()).map(([name, value]) => ({ name, value }));

  // FX effect visible on the total (PRICE-06), never silently blended into
  // one opaque number. Only relevant when this account actually holds a
  // non-base-currency instrument.
  const nonBaseSubtotal = Object.entries(portfolioTotal.nativeSubtotals).find(
    ([currency, subtotal]) => currency !== baseCurrency && subtotal.costBasis > 0
  );
  let fxSubtitle: string | undefined;
  if (nonBaseSubtotal) {
    fxSubtitle = fxUnavailable
      ? `FX rate unavailable — ${nonBaseSubtotal[0]} holdings excluded from total`
      : fxRate !== null
        ? `incl. ${nonBaseSubtotal[0]} holdings @ ${fxRate.toFixed(2)} ${nonBaseSubtotal[0]}→${baseCurrency}`
        : undefined;
  }

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards — real prices/P&L now that pricing exists (Phase 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Portfolio Value"
          value={anyPriced ? currencyFmt(portfolioTotal.totalCurrentValue) : '—'}
          icon={<Wallet className="h-4.5 w-4.5" />}
          subtitle={
            anyPriced
              ? (fxSubtitle ?? `Cost basis ${currencyFmt(portfolioTotal.totalCostBasis)}`)
              : 'No live prices yet'
          }
        />

        <KPICard
          title="Day P&L"
          value={anyPriced ? currencyFmt(portfolioTotal.totalDayChange) : '—'}
          icon={<TrendingUp className="h-4.5 w-4.5" />}
          trendIsNeutral={!anyPriced}
          trend={
            anyPriced
              ? {
                  value: `${portfolioTotal.totalDayChange >= 0 ? '+' : ''}${currencyFmt(portfolioTotal.totalDayChange)}`,
                  isPositive: portfolioTotal.totalDayChange >= 0,
                }
              : { value: 'Pending', isPositive: true, label: 'No priced holdings yet' }
          }
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
