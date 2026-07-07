'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, Globe, Layers, Award } from 'lucide-react';
import type { CompanyProfile, PriceSnapshot } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface CompanyHeaderProps {
  profile: CompanyProfile;
  price: PriceSnapshot;
}

export function CompanyHeader({ profile, price }: CompanyHeaderProps) {
  const isPositive = price.dayChangePercent >= 0;
  
  // Calculate relative position of current price in 52-week range
  const rangeWidth = price.weekHigh52 - price.weekLow52;
  const currentPosPercent = rangeWidth > 0 
    ? Math.min(Math.max(((price.currentPrice - price.weekLow52) / rangeWidth) * 100, 0), 100)
    : 50;

  return (
    <div className="glass-card rounded-2xl p-6 border border-border/50 space-y-6">
      {/* Title block & Price block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Side: Name and Badges */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {profile.name}
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold text-primary">
              {profile.ticker}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-[10px] font-bold text-muted-foreground uppercase border border-border">
              {profile.exchange}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {profile.sector} · {profile.industry}
            </span>
            <span className="hidden sm:inline text-border/60">•</span>
            <span className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              {profile.country}
            </span>
            {profile.isin && (
              <>
                <span className="hidden sm:inline text-border/60">•</span>
                <span className="font-mono">ISIN: {profile.isin}</span>
              </>
            )}
          </div>
        </div>

        {/* Right Side: Current Price */}
        <div className="flex items-baseline md:flex-col md:items-end gap-3 md:gap-1 shrink-0">
          <div className="text-3xl font-black font-tabular text-foreground">
            {price.currency === 'INR' ? '₹' : '$'}
            {price.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-tabular',
                isPositive 
                  ? 'bg-success/15 text-success border border-success/20' 
                  : 'bg-danger/15 text-danger border border-danger/20'
              )}
            >
              {isPositive ? (
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {isPositive ? '+' : ''}
              {price.dayChangePercent.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground font-medium">Today</span>
          </div>
        </div>
      </div>

      {/* Meta grid & 52w range */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5 border-t border-border/30">
        {/* Core Metadata */}
        <div className="md:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block tracking-wider">
              Market Capitalisation
            </span>
            <span className="text-sm font-bold text-foreground">{profile.marketCapFormatted}</span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block tracking-wider">
              Classification
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground">
              <Award className="h-3.5 w-3.5 text-primary" />
              {profile.capClassification}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold block tracking-wider">
              Listing Status
            </span>
            <span
              className={cn(
                'text-xs font-bold',
                profile.listingStatus === 'Active' ? 'text-success' : 'text-danger'
              )}
            >
              {profile.listingStatus}
            </span>
          </div>
        </div>

        {/* 52-Week Range Progress */}
        <div className="md:col-span-6 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex flex-col">
              <span className="text-[10px] uppercase font-semibold tracking-wider">52W Low</span>
              <span className="font-bold text-foreground font-tabular">
                {price.currency === 'INR' ? '₹' : '$'}
                {price.weekLow52.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </span>
            <span className="text-[10px] uppercase font-semibold tracking-wider">Current Range</span>
            <span className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-semibold tracking-wider">52W High</span>
              <span className="font-bold text-foreground font-tabular">
                {price.currency === 'INR' ? '₹' : '$'}
                {price.weekHigh52.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </span>
          </div>
          
          <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden border border-border/40">
            <div
              className="absolute top-0 bottom-0 bg-primary/80 rounded-full transition-all duration-500"
              style={{ width: `${currentPosPercent}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-foreground border-2 border-primary shadow-sm -ml-1.5 transition-all duration-500"
              style={{ left: `${currentPosPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
