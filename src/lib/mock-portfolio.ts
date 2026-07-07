export type Broker = 'Groww' | 'Zerodha' | 'CoinDCX' | 'Binance' | 'Robinhood';
export type Sector = 'IT' | 'Banking' | 'Energy' | 'Crypto' | 'Consumer' | 'Auto' | 'Pharma';
export type Sentiment = 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral';

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  broker: Broker;
  sector: Sector;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  dayChange: number; // Percentage
  totalChange: number; // Percentage
  currency?: string;
}

export interface WatchlistItem {
  id: string;
  ticker: string;
  name: string;
  currentPrice: number;
  dayChange: number; // Percentage
  sentiment: Sentiment;
  newsCount: number;
  insight: string; // The "why this matters"
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string; // ISO string
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

export const MOCK_PORTFOLIO_STATS = {
  totalValue: 1247830.50, // INR
  dayChangeValue: 8420.25,
  dayChangePercent: 0.68,
  weekChangePercent: 2.1,
  watchlistAlerts: 3,
  sentimentSummary: {
    bullish: 4,
    bearish: 1,
    neutral: 2,
    mixed: 1
  }
};

export const MOCK_HOLDINGS: Holding[] = [
  { id: '1', ticker: 'TCS', name: 'Tata Consultancy Services', broker: 'Groww', sector: 'IT', quantity: 15, avgPrice: 3850, currentPrice: 4120.50, dayChange: 1.2, totalChange: 7.03 },
  { id: '2', ticker: 'RELIANCE', name: 'Reliance Industries', broker: 'Zerodha', sector: 'Energy', quantity: 40, avgPrice: 2800, currentPrice: 2950.00, dayChange: -0.4, totalChange: 5.36 },
  { id: '3', ticker: 'HDFCBANK', name: 'HDFC Bank', broker: 'Groww', sector: 'Banking', quantity: 120, avgPrice: 1550, currentPrice: 1620.75, dayChange: 0.8, totalChange: 4.56 },
  { id: '4', ticker: 'INFY', name: 'Infosys', broker: 'Zerodha', sector: 'IT', quantity: 50, avgPrice: 1420, currentPrice: 1510.20, dayChange: 2.1, totalChange: 6.35 },
  { id: '5', ticker: 'BTC', name: 'Bitcoin', broker: 'Binance', sector: 'Crypto', quantity: 0.045, avgPrice: 5200000, currentPrice: 5800000, dayChange: 3.5, totalChange: 11.54 },
  { id: '6', ticker: 'ETH', name: 'Ethereum', broker: 'CoinDCX', sector: 'Crypto', quantity: 0.5, avgPrice: 280000, currentPrice: 310000, dayChange: 1.8, totalChange: 10.71 },
  { id: '7', ticker: 'TATAMOTORS', name: 'Tata Motors', broker: 'Groww', sector: 'Auto', quantity: 100, avgPrice: 920, currentPrice: 985.50, dayChange: -1.2, totalChange: 7.12 },
  { id: '8', ticker: 'ITC', name: 'ITC Ltd.', broker: 'Zerodha', sector: 'Consumer', quantity: 200, avgPrice: 410, currentPrice: 435.25, dayChange: 0.2, totalChange: 6.16 }
];

export const MOCK_WATCHLIST: WatchlistItem[] = [
  { id: '1', ticker: 'ZOMATO', name: 'Zomato Ltd.', currentPrice: 185.40, dayChange: 4.2, sentiment: 'Bullish', newsCount: 5, insight: 'Consistent profitability metrics driving analyst upgrades; 4 recent price target increases.' },
  { id: '2', ticker: 'PAYTM', name: 'One97 Comm.', currentPrice: 412.80, dayChange: -2.5, sentiment: 'Bearish', newsCount: 8, insight: 'Regulatory overhang persists; payment aggregator license delay impacting sentiment.' },
  { id: '3', ticker: 'NVDA', name: 'NVIDIA Corp', currentPrice: 125.60, dayChange: 1.8, sentiment: 'Bullish', newsCount: 12, insight: 'AI chip demand remains unquenched; Blackwell architecture shipments on track.' },
  { id: '4', ticker: 'SOL', name: 'Solana', currentPrice: 13850.00, dayChange: 5.4, sentiment: 'Bullish', newsCount: 3, insight: 'Network activity surging; successful memecoin launches increasing DEX volumes.' },
  { id: '5', ticker: 'HUL', name: 'Hindustan Unilever', currentPrice: 2340.15, dayChange: 0.1, sentiment: 'Neutral', newsCount: 2, insight: 'Rural demand showing early signs of recovery, but margin pressures remain.' },
  { id: '6', ticker: 'TSLA', name: 'Tesla Inc', currentPrice: 178.20, dayChange: -1.5, sentiment: 'Mixed', newsCount: 7, insight: 'Robotaxi event anticipated, but EV sales slowing in key markets like China.' }
];

export const MOCK_NEWS: NewsItem[] = [
  { id: '1', title: 'TCS Q4 Results: Revenue beats estimates, solid deal pipeline', source: 'Economic Times', publishedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(), sentiment: 'Bullish', tickers: ['TCS'], summary: 'TCS reported a 5% YoY increase in constant currency revenue. Management indicated a strong deal pipeline despite macro uncertainties.', url: '#', category: 'Holdings' },
  { id: '2', title: 'Bitcoin surges past $65,000 as spot ETF inflows accelerate', source: 'CoinDesk', publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), sentiment: 'Bullish', tickers: ['BTC'], summary: 'Spot Bitcoin ETFs saw their largest single-day inflow in a month, pushing the asset past a key resistance level.', url: '#', category: 'Holdings' },
  { id: '3', title: 'Auto sales dip slightly in May, Tata Motors EV share drops', source: 'Mint', publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), sentiment: 'Bearish', tickers: ['TATAMOTORS'], summary: 'Overall auto sales were sluggish. Tata Motors saw a minor dip in its EV market share as competition intensifies.', url: '#', category: 'Holdings' },
  { id: '4', title: 'Zomato to expand quick commerce dark stores by 40%', source: 'Moneycontrol', publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), sentiment: 'Bullish', tickers: ['ZOMATO'], summary: 'Blinkit aggressive expansion plan announced, aiming to consolidate market leadership in quick commerce.', url: '#', category: 'Watchlist' },
  { id: '5', title: 'RBI maintains status quo on repo rate, signals inflation caution', source: 'Bloomberg', publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), sentiment: 'Mixed', tickers: ['HDFCBANK'], summary: 'The central bank kept rates unchanged at 6.5%. Rate cut expectations pushed further out.', url: '#', category: 'Macro' },
  { id: '6', title: 'Paytm faces fresh scrutiny over KYC norms compliance', source: 'Reuters', publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), sentiment: 'Bearish', tickers: ['PAYTM'], summary: 'Sources suggest regulatory bodies are seeking more clarifications regarding recent compliance measures.', url: '#', category: 'Watchlist' },
  { id: '7', title: 'Global IT spend forecast raised for 2024 driven by AI', source: 'Gartner', publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), sentiment: 'Bullish', tickers: ['TCS', 'INFY'], summary: 'IT spending is projected to grow 8% this year, a significant revision upward due to generative AI investments.', url: '#', category: 'Macro' }
];

export const MOCK_ALLOCATION = [
  { name: 'IT', value: 45 },
  { name: 'Banking', value: 25 },
  { name: 'Energy', value: 15 },
  { name: 'Crypto', value: 10 },
  { name: 'Other', value: 5 },
];
