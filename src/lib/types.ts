// Shared domain types for Phase 2+ (schema, persistence, hydration) and beyond.
//
// This file replaces the type exports that previously lived in the mock
// portfolio store module (deleted in plan 02-06, PORT-07). All UI now
// imports NewsItem/AlertItem/WatchlistItem/etc. from here.

export type Exchange = 'NSE' | 'BSE' | 'NASDAQ' | 'NYSE' | 'OTHER';
export type Currency = 'INR' | 'USD';
export type AssetType = 'stocks' | 'etf' | 'crypto';
export type TransactionType = 'BUY' | 'SELL' | 'SPLIT' | 'BONUS';
export type Sentiment = 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral';

export interface Instrument {
  id: string;
  isin: string;
  symbol: string;
  exchange: Exchange;
  displayName: string;
  assetType: AssetType;
  currency: Currency;
  priceSourceSymbol: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  instrumentId: string;
  transactionType: TransactionType;
  quantity: number;
  price: number | null; // null for SPLIT/BONUS
  transactionDate: string; // ISO date
  notes?: string | null;
}

// Derived (not persisted) — the output of deriveHoldings(), enriched with
// instrument display data by the data layer (plan 02-04).
export interface Holding {
  instrumentId: string;
  ticker: string;
  name: string;
  exchange: Exchange;
  currency: Currency;
  quantity: number;
  avgCost: number;
  // Pricing fields intentionally absent/optional — Phase 3 (PRICE-*) fills these.
  // The UI must show an honest "pending" state, never a fabricated number.
  currentPrice?: number;
  dayChangePercent?: number;
  totalChangePercent?: number;
}

export interface WatchlistItem {
  id: string;
  instrumentId: string;
  ticker: string;
  name: string;
  exchange: Exchange;
  currency: Currency;
  addedAt: string;
  // Phase 6 (NEWS-*) fields — optional/absent until then.
  sentiment?: Sentiment;
  newsCount?: number;
  insight?: string;
}

// Used by News/Alerts UI, which pass an honest empty array until Phase 5/6
// (ALRT-*/NEWS-*) land a real source for this shape.
export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  sentiment: Sentiment;
  tickers: string[];
  summary: string;
  url: string;
  category: 'Holdings' | 'Watchlist' | 'Macro';
}

export interface AlertItem {
  id: string;
  symbol: string;
  type: 'price_above' | 'price_below' | 'sentiment_change' | 'news_spike';
  threshold: string;
  isActive: boolean;
  delivery: 'Email' | 'Push' | 'In-App';
}
