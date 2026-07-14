import { Briefcase, Plus } from 'lucide-react';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { HoldingFormDialog } from '@/components/dashboard/HoldingFormDialog';
import { RefreshPricesButton } from '@/components/dashboard/RefreshPricesButton';
import { createClient } from '@/utils/supabase/server';
import { getAccountId } from '@/lib/supabase/portfolio';
import { getPortfolioPnL } from '@/lib/prices/get-portfolio-pnl';
import { cn } from '@/utils/cn';
import type { Currency } from '@/lib/types';

// Server Component: same real-data pattern as the dashboard page
// (PORT-01..05,07) PLUS Phase 3's price/P&L glue (getPortfolioPnL). The
// previously-inert "Add Asset" button now opens HoldingFormDialog (a
// 'use client' boundary) directly from this Server Component, per Next.js
// Server-Action-callable-from-Client-Component docs. "Refresh now"
// (RefreshPricesButton, also a client island) sits alongside it (PRICE-03).
export default async function HoldingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { holdings, portfolioTotal, fxUnavailable } = await getPortfolioPnL(supabase, accountId, baseCurrency);

  // Cost basis — real and knowable regardless of live pricing.
  const totalCostBasis = holdings.reduce((sum, h) => sum + h.quantity * h.avgCost, 0);

  const allocationByExchange = new Map<string, number>();
  for (const h of holdings) {
    const costBasis = h.quantity * h.avgCost;
    allocationByExchange.set(h.exchange, (allocationByExchange.get(h.exchange) ?? 0) + costBasis);
  }
  const allocation = Array.from(allocationByExchange.entries()).map(([name, value]) => ({ name, value }));

  const largestPosition = holdings.length > 0
    ? [...holdings].sort((a, b) => b.quantity * b.avgCost - a.quantity * a.avgCost)[0]
    : null;

  const anyPriced = holdings.some((h) => h.status === 'priced');

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Portfolio Holdings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search a real instrument to add, edit, sell, split, or record bonus shares on a holding.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <RefreshPricesButton />

          <HoldingFormDialog
            mode="add"
            trigger={
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer">
                <Plus className="h-4 w-4" />
                Add Asset
              </button>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <div className="h-full">
            <HoldingsTable holdings={holdings} />
          </div>
        </div>
        <div className="lg:col-span-4 space-y-6">
          <AllocationChart data={allocation} />

          {/* Quick Stats side panel */}
          <div className="glass-card rounded-2xl p-5 border border-border/50">
            <h3 className="text-sm font-bold mb-4">Holdings Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-xs text-muted-foreground">Total Assets</span>
                <span className="text-sm font-bold">{holdings.length}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-xs text-muted-foreground">Total Invested (Cost Basis)</span>
                <span className="text-sm font-bold">
                  {new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0,
                  }).format(totalCostBasis)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-xs text-muted-foreground">Total P&amp;L ({baseCurrency})</span>
                {anyPriced ? (
                  <span
                    className={cn(
                      'text-sm font-bold',
                      portfolioTotal.totalUnrealizedPnL >= 0 ? 'text-success' : 'text-danger'
                    )}
                  >
                    {new Intl.NumberFormat(baseCurrency === 'INR' ? 'en-IN' : 'en-US', {
                      style: 'currency',
                      currency: baseCurrency,
                      maximumFractionDigits: 0,
                    }).format(portfolioTotal.totalUnrealizedPnL)}
                  </span>
                ) : (
                  <span className="text-sm font-bold text-muted-foreground" title="No priced holdings yet">
                    —
                  </span>
                )}
              </div>
              {fxUnavailable && (
                <p className="text-[11px] text-warning">
                  FX rate unavailable — non-{baseCurrency} holdings excluded from Total P&amp;L above.
                </p>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-muted-foreground">Largest Position</span>
                <span className="text-sm font-bold text-foreground">
                  {largestPosition ? largestPosition.ticker : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
