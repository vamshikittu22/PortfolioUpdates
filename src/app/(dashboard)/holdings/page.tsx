import { Briefcase, Plus } from 'lucide-react';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { HoldingFormDialog } from '@/components/dashboard/HoldingFormDialog';
import { createClient } from '@/utils/supabase/server';
import { getAccountId, getHoldings } from '@/lib/supabase/portfolio';

// Server Component: same real-data pattern as the dashboard page
// (PORT-01..05,07). The previously-inert "Add Asset" button now opens
// HoldingFormDialog (a 'use client' boundary) directly from this Server
// Component, per Next.js Server-Action-callable-from-Client-Component docs.
export default async function HoldingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const accountId = await getAccountId(supabase, user.id);
  const holdings = await getHoldings(supabase, accountId);

  // Cost basis only — no live price feed until Phase 3.
  const totalCostBasis = holdings.reduce((sum, h) => sum + h.quantity * h.avgCost, 0);

  const allocationByExchange = new Map<string, number>();
  for (const h of holdings) {
    const costBasis = h.quantity * h.avgCost;
    allocationByExchange.set(h.exchange, (allocationByExchange.get(h.exchange) ?? 0) + costBasis);
  }
  const allocation = Array.from(allocationByExchange.entries()).map(([name, value]) => ({ name, value }));

  // "Largest Position" replaces the old mock "Top Performer" (which relied
  // on totalChange — a Phase-3-only field). Ranked by cost-basis exposure,
  // the only honestly knowable ranking today.
  const largestPosition = holdings.length > 0
    ? [...holdings].sort((a, b) => b.quantity * b.avgCost - a.quantity * a.avgCost)[0]
    : null;

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
