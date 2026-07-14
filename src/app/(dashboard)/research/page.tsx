'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Loader2, RefreshCw, HelpCircle, ShieldAlert, Building2 } from 'lucide-react';
import { StockSearchBar } from '@/components/research/StockSearchBar';
import { OverviewTab } from '@/components/research/OverviewTab';
import { SourcesTab } from '@/components/research/SourcesTab';
import { ResearchDisclaimer } from '@/components/research/ResearchDisclaimer';
import { FinancialsTab } from '@/components/research/FinancialsTab';
import { ValuationTab } from '@/components/research/ValuationTab';
import { OwnershipRisksTab } from '@/components/research/OwnershipRisksTab';
import { NewsTimelineTab } from '@/components/research/NewsTimelineTab';
import { ScenariosTab } from '@/components/research/ScenariosTab';
import { getResearchReport, getAvailableStocks } from '@/lib/research/research-service';
import type { ResearchReport, CompanySearchResult } from '@/lib/research/research-types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';

export default function ResearchPage() {
  // useSearchParams() requires a Suspense boundary above it during static
  // generation (Next.js "missing-suspense-with-csr-bailout"); confirmed by
  // running `next build`, so this wrapper is not speculative. Fallback is
  // intentionally minimal — this page is client-rendered top to bottom and
  // the wrapped content itself already renders its own loading state.
  return (
    <Suspense fallback={null}>
      <ResearchPageContent />
    </Suspense>
  );
}

function ResearchPageContent() {
  const isModuleEnabled = process.env.NEXT_PUBLIC_ENABLE_RESEARCH_MODULE !== 'false';
  const searchParams = useSearchParams();
  // Deep-link entry point (WIRE-01): a held/watched row's "Research" link
  // navigates to /research?ticker=SYMBOL. Read once on mount below; falls
  // back to the existing HDFCBANK default when the param is absent so
  // direct navigation to /research keeps its current behavior unchanged.
  const tickerParam = searchParams.get('ticker');

  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableStocks, setAvailableStocks] = useState<CompanySearchResult[]>([]);

  if (!isModuleEnabled) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-md mx-auto">
        <Loader2 className="h-10 w-10 text-warning animate-pulse" />
        <h2 className="text-lg font-bold text-foreground">Premium module Rolling Out</h2>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          The Stock Research Intelligence dashboard is currently rolling out in phases to premium subscribers. Contact administration to toggle access.
        </p>
      </div>
    );
  }

  // Load available stocks on mount
  useEffect(() => {
    async function loadStocks() {
      try {
        const stocks = await getAvailableStocks();
        setAvailableStocks(stocks);
        // Prefer the ?ticker= URL param (deep-linked from a real held/watched
        // row, WIRE-01); otherwise load HDFCBANK by default to show a
        // premium populated state — additive, not a regression of the
        // existing direct-navigation default.
        if (stocks.length > 0) {
          const defaultTicker = tickerParam ? tickerParam.toUpperCase() : 'HDFCBANK';
          setSelectedTicker(defaultTicker);
        }
      } catch (err) {
        console.error('Failed to load available stocks:', err);
      }
    }
    loadStocks();
  }, []);

  // Fetch report when ticker changes
  useEffect(() => {
    if (!selectedTicker) return;

    async function fetchReport() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getResearchReport(selectedTicker);
        if (data) {
          setReport(data);
        } else {
          setError(`Company with ticker "${selectedTicker}" could not be resolved.`);
          setReport(null);
        }
      } catch (err) {
        setError('An error occurred while compiling the research report. Please try again.');
        setReport(null);
      } finally {
        setIsLoading(false);
      }
    }

    fetchReport();
  }, [selectedTicker]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Search Bar Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-card border border-border/50 rounded-2xl">
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Building2 className="h-5.5 w-5.5 text-primary" />
            Stock Research Intelligence
          </h1>
          <p className="text-xs text-muted-foreground">
            Auditable, explainable, and multi-dimensional analysis for decision support.
          </p>
        </div>
        <StockSearchBar onSelect={setSelectedTicker} selectedTicker={selectedTicker} />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-semibold text-muted-foreground animate-pulse">
            Executing research workflow for {selectedTicker}...
          </p>
          <span className="text-[10px] text-muted-foreground max-w-xs text-center leading-relaxed">
            Resolving metrics, analyzing historical CAGR, processing red flags, and auditing ownership patterns.
          </span>
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-md mx-auto">
          <ShieldAlert className="h-12 w-12 text-danger" />
          <h2 className="text-lg font-bold text-foreground">Research Workflow Failed</h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{error}</p>
          <button
            onClick={() => setSelectedTicker('HDFCBANK')}
            className="px-4 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl hover:bg-primary/95 transition-all cursor-pointer"
          >
            Reset to HDFC Bank
          </button>
        </div>
      )}

      {/* Empty State / Select a stock */}
      {!isLoading && !report && !error && (
        <div className="text-center py-20 max-w-md mx-auto space-y-6">
          <Search className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <div className="space-y-2">
            <h2 className="text-lg font-extrabold text-foreground">Select a Company</h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Use the search bar above or choose one of our pre-compiled demonstration assets to initialize the research engine:
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {availableStocks.map((stock) => (
              <button
                key={stock.ticker}
                onClick={() => setSelectedTicker(stock.ticker)}
                className="px-3.5 py-2 bg-card hover:bg-muted/40 border border-border hover:border-primary/40 rounded-xl text-xs font-bold text-foreground transition-all cursor-pointer"
              >
                {stock.name} ({stock.ticker})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Report Resolved state */}
      {!isLoading && report && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <Tabs defaultValue="overview" className="w-full">
            {/* Horizontal Scrollable Tabs bar on mobile */}
            <div className="overflow-x-auto pb-1.5 -mx-4 px-4 md:mx-0 md:px-0">
              <TabsList className="flex w-max md:w-full justify-start md:justify-center p-1 bg-card border border-border/50 rounded-xl">
                <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
                <TabsTrigger value="financials" className="flex-1">Financials</TabsTrigger>
                <TabsTrigger value="valuation" className="flex-1">Valuation</TabsTrigger>
                <TabsTrigger value="ownership" className="flex-1">Ownership & Risks</TabsTrigger>
                <TabsTrigger value="news" className="flex-1">News Timeline</TabsTrigger>
                <TabsTrigger value="scenarios" className="flex-1">Scenarios</TabsTrigger>
                <TabsTrigger value="sources" className="flex-1">Sources</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview">
              <OverviewTab report={report} />
            </TabsContent>

            <TabsContent value="financials">
              <FinancialsTab fundamentals={report.fundamentals} ticker={report.companyProfile.ticker} />
            </TabsContent>

            <TabsContent value="valuation">
              <ValuationTab valuation={report.valuation} ticker={report.companyProfile.ticker} />
            </TabsContent>

            <TabsContent value="ownership">
              <OwnershipRisksTab 
                ownership={report.ownershipAnalysis} 
                balanceSheet={report.balanceSheetHealth} 
                redFlags={report.redFlags} 
                ticker={report.companyProfile.ticker} 
              />
            </TabsContent>

            <TabsContent value="news">
              <NewsTimelineTab news={report.newsAnalysis} />
            </TabsContent>

            <TabsContent value="scenarios">
              <ScenariosTab scenariosAnalysis={report.scenarios} />
            </TabsContent>

            <TabsContent value="sources">
              <SourcesTab sources={report.sources} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
