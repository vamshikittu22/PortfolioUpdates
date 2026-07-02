'use client';

import React from 'react';
import { Wallet, Activity, Bell, MessageSquareQuote } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { WatchlistTable } from '@/components/dashboard/WatchlistTable';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { 
  MOCK_PORTFOLIO_STATS, 
  MOCK_HOLDINGS, 
  MOCK_ALLOCATION, 
  MOCK_WATCHLIST, 
  MOCK_NEWS 
} from '@/lib/mock-portfolio';

export default function DashboardPage() {
  const stats = MOCK_PORTFOLIO_STATS;

  // Format currency
  const totalValueFormatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(stats.totalValue);

  const dayChangeFormatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
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
            value: `${stats.dayChangePercent}%`,
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
          <HoldingsTable holdings={MOCK_HOLDINGS} />
        </div>
        <div className="lg:col-span-4">
          <AllocationChart data={MOCK_ALLOCATION} />
        </div>
      </div>

      {/* Row 3 & 4: Watchlist & News */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8">
          <WatchlistTable items={MOCK_WATCHLIST} />
        </div>
        <div className="xl:col-span-4">
          <NewsFeed news={MOCK_NEWS} />
        </div>
      </div>
    </div>
  );
}
