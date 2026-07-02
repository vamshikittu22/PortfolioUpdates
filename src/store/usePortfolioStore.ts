import { create } from 'zustand';
import type { Holding, WatchlistItem, NewsItem, AlertItem } from '@/lib/mock-portfolio';
import { MOCK_HOLDINGS, MOCK_WATCHLIST, MOCK_NEWS } from '@/lib/mock-portfolio';

export interface AccountState {
  accountId: string;
  profile: {
    name: string;
    baseCurrency: 'INR' | 'USD';
  };
  stats: {
    totalValue: number;
    dayChangeValue: number;
    dayChangePercent: number;
    weekChangePercent: number;
    watchlistAlerts: number;
    sentimentSummary: {
      bullish: number;
      bearish: number;
      neutral: number;
      mixed: number;
    };
  };
  holdings: Holding[];
  watchlist: WatchlistItem[];
  news: NewsItem[];
  alerts: AlertItem[];
  allocation: { name: string; value: number }[];
  newsPrefs: {
    trackedSymbols: string[];
    sentimentEnabled: boolean;
    macroEnabled: boolean;
  };
  settings: {
    theme: 'light' | 'dark' | 'system';
    compactMode: boolean;
  };
}

interface PortfolioStore {
  selectedAccountId: string | null;
  accounts: Record<string, AccountState>;
  
  switchAccount: (accountId: string) => void;
  updateAccountData: (accountId: string, data: Partial<AccountState>) => void;
  
  addHolding: (holding: Holding) => void;
  removeHolding: (id: string) => void;
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (id: string) => void;
}

// Derive three distinct accounts from the mock data
const initialAccounts: Record<string, AccountState> = {
  'acc_1': {
    accountId: 'acc_1',
    profile: { name: 'India Growth', baseCurrency: 'INR' },
    stats: {
      totalValue: 1247830.50,
      dayChangeValue: 8420.25,
      dayChangePercent: 0.68,
      weekChangePercent: 2.1,
      watchlistAlerts: 3,
      sentimentSummary: { bullish: 4, bearish: 1, neutral: 2, mixed: 1 }
    },
    holdings: MOCK_HOLDINGS.filter(h => h.currency === 'INR' || h.broker === 'Groww' || h.broker === 'Zerodha'),
    watchlist: MOCK_WATCHLIST.filter(w => ['ZOMATO', 'PAYTM', 'HUL'].includes(w.ticker)),
    news: MOCK_NEWS.filter(n => n.tickers.some(t => ['TCS', 'INFY', 'TATAMOTORS', 'HDFCBANK', 'ZOMATO', 'PAYTM'].includes(t))),
    alerts: [
      { id: '1', symbol: 'ZOMATO', type: 'price_above', threshold: '₹200.00', isActive: true, delivery: 'Push' },
      { id: '2', symbol: 'PAYTM', type: 'sentiment_change', threshold: 'Turns Bullish', isActive: true, delivery: 'In-App' },
      { id: '3', symbol: 'TCS', type: 'news_spike', threshold: '> 5 articles/hr', isActive: false, delivery: 'Email' },
    ],
    allocation: [
      { name: 'IT', value: 45 },
      { name: 'Banking', value: 25 },
      { name: 'Energy', value: 15 },
      { name: 'Consumer', value: 10 },
      { name: 'Auto', value: 5 },
    ],
    newsPrefs: { trackedSymbols: ['ZOMATO', 'PAYTM'], sentimentEnabled: true, macroEnabled: true },
    settings: { theme: 'dark', compactMode: false }
  },
  'acc_2': {
    accountId: 'acc_2',
    profile: { name: 'US Tech', baseCurrency: 'USD' },
    stats: {
      totalValue: 45200.75,
      dayChangeValue: -340.50,
      dayChangePercent: -0.75,
      weekChangePercent: 4.2,
      watchlistAlerts: 1,
      sentimentSummary: { bullish: 6, bearish: 2, neutral: 1, mixed: 0 }
    },
    holdings: [
      { id: 'us_1', ticker: 'AAPL', name: 'Apple Inc.', broker: 'Robinhood', sector: 'IT', quantity: 45, avgPrice: 175.50, currentPrice: 189.20, dayChange: -1.2, totalChange: 7.8 },
      { id: 'us_2', ticker: 'NVDA', name: 'NVIDIA Corp', broker: 'Robinhood', sector: 'IT', quantity: 20, avgPrice: 110.00, currentPrice: 125.60, dayChange: 2.4, totalChange: 14.1 },
      { id: 'us_3', ticker: 'MSFT', name: 'Microsoft', broker: 'Robinhood', sector: 'IT', quantity: 30, avgPrice: 400.00, currentPrice: 415.50, dayChange: -0.5, totalChange: 3.8 }
    ],
    watchlist: MOCK_WATCHLIST.filter(w => ['NVDA', 'TSLA'].includes(w.ticker)),
    news: [
      { id: 'n_us_1', title: 'Apple Intelligence rollout begins', source: 'Bloomberg', publishedAt: new Date(Date.now() - 3600000).toISOString(), sentiment: 'Bullish', tickers: ['AAPL'], summary: 'AI features launch in beta, drawing positive developer feedback.', url: '#', category: 'Holdings' },
      { id: 'n_us_2', title: 'Tesla robotaxi delay concerns analysts', source: 'WSJ', publishedAt: new Date(Date.now() - 7200000).toISOString(), sentiment: 'Bearish', tickers: ['TSLA'], summary: 'Launch pushed to October as design changes are finalized.', url: '#', category: 'Watchlist' }
    ],
    alerts: [
      { id: 'us_a1', symbol: 'NVDA', type: 'price_above', threshold: '$135.00', isActive: true, delivery: 'Push' },
      { id: 'us_a2', symbol: 'TSLA', type: 'price_below', threshold: '$160.00', isActive: true, delivery: 'Email' }
    ],
    allocation: [
      { name: 'Hardware', value: 35 },
      { name: 'Semiconductors', value: 40 },
      { name: 'Software', value: 25 }
    ],
    newsPrefs: { trackedSymbols: ['TSLA'], sentimentEnabled: true, macroEnabled: false },
    settings: { theme: 'dark', compactMode: false }
  },
  'acc_3': {
    accountId: 'acc_3',
    profile: { name: 'Crypto', baseCurrency: 'USD' },
    stats: {
      totalValue: 84500.00,
      dayChangeValue: 4200.00,
      dayChangePercent: 5.2,
      weekChangePercent: 12.4,
      watchlistAlerts: 5,
      sentimentSummary: { bullish: 8, bearish: 0, neutral: 2, mixed: 1 }
    },
    holdings: MOCK_HOLDINGS.filter(h => h.sector === 'Crypto'),
    watchlist: MOCK_WATCHLIST.filter(w => ['SOL'].includes(w.ticker)),
    news: MOCK_NEWS.filter(n => n.tickers.some(t => ['BTC', 'ETH', 'SOL'].includes(t))),
    alerts: [
      { id: 'c_a1', symbol: 'BTC', type: 'price_below', threshold: '$60,000', isActive: true, delivery: 'Push' },
      { id: 'c_a2', symbol: 'ETH', type: 'news_spike', threshold: '> 10 articles', isActive: true, delivery: 'In-App' }
    ],
    allocation: [
      { name: 'Bitcoin', value: 65 },
      { name: 'Ethereum', value: 30 },
      { name: 'Altcoins', value: 5 }
    ],
    newsPrefs: { trackedSymbols: ['SOL'], sentimentEnabled: true, macroEnabled: false },
    settings: { theme: 'dark', compactMode: true }
  }
};

export const usePortfolioStore = create<PortfolioStore>((set) => ({
  selectedAccountId: 'acc_1',
  accounts: initialAccounts,
  
  switchAccount: (accountId: string) => set({ selectedAccountId: accountId }),
  
  updateAccountData: (accountId, data) => set((state) => ({
    accounts: {
      ...state.accounts,
      [accountId]: {
        ...state.accounts[accountId],
        ...data
      }
    }
  })),

  addHolding: (holding) => set((state) => {
    if (!state.selectedAccountId) return state;
    const acc = state.accounts[state.selectedAccountId];
    return {
      accounts: {
        ...state.accounts,
        [state.selectedAccountId]: {
          ...acc,
          holdings: [...acc.holdings, holding]
        }
      }
    };
  }),

  removeHolding: (id) => set((state) => {
    if (!state.selectedAccountId) return state;
    const acc = state.accounts[state.selectedAccountId];
    return {
      accounts: {
        ...state.accounts,
        [state.selectedAccountId]: {
          ...acc,
          holdings: acc.holdings.filter(h => h.id !== id)
        }
      }
    };
  }),

  addToWatchlist: (item) => set((state) => {
    if (!state.selectedAccountId) return state;
    const acc = state.accounts[state.selectedAccountId];
    return {
      accounts: {
        ...state.accounts,
        [state.selectedAccountId]: {
          ...acc,
          watchlist: [...acc.watchlist, item]
        }
      }
    };
  }),

  removeFromWatchlist: (id) => set((state) => {
    if (!state.selectedAccountId) return state;
    const acc = state.accounts[state.selectedAccountId];
    return {
      accounts: {
        ...state.accounts,
        [state.selectedAccountId]: {
          ...acc,
          watchlist: acc.watchlist.filter(w => w.id !== id)
        }
      }
    };
  })
}));
