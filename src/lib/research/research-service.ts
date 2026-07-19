// =============================================================================
// FolioIntel Research Module — Service Layer
// =============================================================================
// Async-first abstraction over research data providers.
// Currently backed by mock data; designed for drop-in replacement with real APIs.
//
// All public functions are async to match the eventual API-backed interface.
// Simulated delays mimic network latency for realistic UI state handling.
// =============================================================================

import type {
  CompanySearchResult,
  ResearchReport,
} from './research-types';
import { REGISTERED_STOCKS } from './stocks-list';

// ---------------------------------------------------------------------------
// Provenance — so the UI can label a report honestly instead of presenting
// every report as live, audited data.
//   - 'sample'              : hand-authored demonstration fixture (the 3
//                             seeded tickers) — illustrative, NOT live data.
//   - 'gemini-live'         : AI-compiled from live Yahoo Finance figures.
//   - 'hybrid-fallback-mock': live prices + templated/estimated analysis
//                             (AI was unavailable).
//   - 'cache'               : a previously compiled report, re-served.
//   - 'mock-seeded'         : API seeded a demo fixture into cache.
//   - 'unknown'             : provenance not reported by the API.
// ---------------------------------------------------------------------------
export type ResearchSource =
  | 'sample'
  | 'gemini-live'
  | 'hybrid-fallback-mock'
  | 'cache'
  | 'mock-seeded'
  | 'unknown';

export interface ResearchResult {
  report: ResearchReport;
  source: ResearchSource;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Simulates network delay for realistic async behaviour */
const simulateDelay = (ms: number = 800): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Public API — Search
// ---------------------------------------------------------------------------

/**
 * Search companies by ticker or name.
 * Returns matching results with fuzzy matching on both ticker and company name.
 *
 * @param query - partial ticker or company name
 * @returns matching CompanySearchResult[]
 */
export async function searchCompanies(
  query: string,
): Promise<CompanySearchResult[]> {
  await simulateDelay(200);

  if (!query || query.trim().length < 1) return [];

  const normalised = query.trim().toLowerCase();

  const matches = REGISTERED_STOCKS.filter((stock) => {
    const matchesTicker = stock.ticker.toLowerCase().includes(normalised);
    const matchesName = stock.name.toLowerCase().includes(normalised);
    const matchesSector = stock.sector.toLowerCase().includes(normalised);
    return matchesTicker || matchesName || matchesSector;
  });

  return matches;
}

// ---------------------------------------------------------------------------
// Public API — Full Report
// ---------------------------------------------------------------------------

/**
 * Get the full research report for a given ticker.
 * Returns null if the ticker is not found in the data layer.
 *
 * @param ticker - e.g. "HDFCBANK"
 * @returns ResearchReport | null
 */
export async function getResearchReport(
  ticker: string,
): Promise<ResearchResult | null> {
  const normalised = ticker.trim().toUpperCase();

  // 1. Try static mock data first — these are hand-authored demonstration
  //    fixtures, so tag them 'sample' and NEVER let the UI present them as
  //    live, audited market data.
  const { MOCK_RESEARCH_REPORTS } = await import('./mock-research-data');
  if (MOCK_RESEARCH_REPORTS[normalised]) {
    await simulateDelay(800);
    return { report: MOCK_RESEARCH_REPORTS[normalised], source: 'sample' };
  }

  // 2. Dynamic Fallback: Call local API endpoint to query Gemini
  try {
    const res = await fetch('/api/research/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticker: normalised }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || `API failed with status ${res.status}`);
    }

    const data = await res.json();
    if (!data?.report) return null;
    // Forward the API's own provenance ('gemini-live' | 'hybrid-fallback-mock'
    // | 'cache' | 'mock-seeded') so the report can be labeled honestly.
    const source = (data.source as ResearchSource) ?? 'unknown';
    return { report: data.report, source };
  } catch (err: any) {
    console.error('Failed to dynamically analyze ticker via API:', err);
    throw new Error(err.message || 'Workflow compilation failed');
  }
}

// ---------------------------------------------------------------------------
// Public API — Available Stocks List
// ---------------------------------------------------------------------------

/**
 * List all stocks available for research.
 * Useful for auto-suggest and empty-state guidance.
 */
export async function getAvailableStocks(): Promise<CompanySearchResult[]> {
  await simulateDelay(100);
  return REGISTERED_STOCKS;
}
