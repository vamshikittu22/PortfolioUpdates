'use client';

import React from 'react';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { Briefcase, Plus } from 'lucide-react';

export default function HoldingsPage() {
  const { accounts, selectedAccountId } = usePortfolioStore();
  
  if (!selectedAccountId) return null;
  const { holdings, allocation, profile } = accounts[selectedAccountId];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Portfolio Holdings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your assets for the <span className="font-semibold text-foreground">{profile.name}</span> account.
          </p>
        </div>
        
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer">
          <Plus className="h-4 w-4" />
          Add Asset
        </button>
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
                <span className="text-xs text-muted-foreground">Base Currency</span>
                <span className="text-sm font-bold">{profile.baseCurrency}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-muted-foreground">Top Performer</span>
                <span className="text-sm font-bold text-success">
                  {holdings.length > 0 
                    ? [...holdings].sort((a, b) => b.totalChange - a.totalChange)[0].ticker 
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
