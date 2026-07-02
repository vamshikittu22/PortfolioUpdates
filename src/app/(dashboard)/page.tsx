'use client';

import React from 'react';
import { Wallet, Activity, Bell, MessageSquareQuote } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { WatchlistTable } from '@/components/dashboard/WatchlistTable';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { usePortfolioStore } from '@/store/usePortfolioStore';

export default function DashboardPage() {
  const { accounts, selectedAccountId } = usePortfolioStore();
  
  if (!selectedAccountId) return null;
  
  const selectedAccount = accounts[selectedAccountId];
  const { stats, holdings, allocation, watchlist, news, profile } = selectedAccount;

  // Format currency based on account setting
  const currencySymbol = profile.baseCurrency === 'INR' ? '₹' : '$';
  
  const totalValueFormatted = new Intl.NumberFormat(profile.baseCurrency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: profile.baseCurrency,
    maximumFractionDigits: 0
  }).format(stats.totalValue);

  const dayChangeFormatted = new Intl.NumberFormat(profile.baseCurrency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: profile.baseCurrency,
    maximumFractionDigits: 0
  }).format(stats.dayChangeValue);

  return (
    <div className="space-y-6">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="Portfolio Value"
          value={totalValueFormatted}
          icon={<Wallet className="h-4.5 w-4.5" />}
          trend={{
            value: `${stats.dayChangePercent >= 0 ? '+' : ''}${stats.dayChangePercent}%`,
            isPositive: stats.dayChangePercent >= 0,
          }}
          subtitle="Updated just now"
        />
        
        <KPICard 
          title="Today's P&L"
          value={`${stats.dayChangeValue >= 0 ? '+' : ''}${dayChangeFormatted}`}
          icon={<Activity className="h-4.5 w-4.5" />}
          trend={{
            value: 'Day',
            isPositive: stats.dayChangeValue >= 0,
            label: `Weekly: ${stats.weekChangePercent >= 0 ? '+' : ''}${stats.weekChangePercent}%`
          }}
        />
        
        <KPICard 
          title="Watchlist Alerts"
          value={stats.watchlistAlerts.toString()}
          icon={<Bell className="h-4.5 w-4.5" />}
          trend={{
            value: 'New',
            isPositive: true,
          }}
          subtitle="Symbols moving > 2%"
        />
        
        <KPICard 
          title="Daily Sentiment"
          value={`${stats.sentimentSummary.bullish} Bullish`}
          icon={<MessageSquareQuote className="h-4.5 w-4.5" />}
          trendIsNeutral={true}
          trend={{
            value: 'AI',
            isPositive: true,
            label: `${stats.sentimentSummary.bearish} Bearish · ${stats.sentimentSummary.neutral} Neutral`
          }}
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
          <NewsFeed news={news} />
        </div>
      </div>
    </div>
  );
}
