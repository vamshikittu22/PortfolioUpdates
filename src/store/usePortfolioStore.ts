import { create } from 'zustand';
import type { Holding, WatchlistItem, NewsItem } from '@/lib/mock-portfolio';

export interface AccountState {
  accountId: string;
  profile: {
    name: string;
    baseCurrency: 'INR' | 'USD';
  };
  holdings: Holding[];
  watchlist: WatchlistItem[];
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
  
  // Actions
  switchAccount: (accountId: string) => void;
  updateAccountData: (accountId: string, data: Partial<AccountState>) => void;
  
  // Scoped mutations for the current selected account
  addHolding: (holding: Holding) => void;
  removeHolding: (id: string) => void;
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (id: string) => void;
}

// Initial mock state for development
const initialAccounts: Record<string, AccountState> = {
  'acc_1': {
    accountId: 'acc_1',
    profile: { name: 'India Growth', baseCurrency: 'INR' },
    holdings: [], // Real app would load this from DB
    watchlist: [],
    newsPrefs: { trackedSymbols: [], sentimentEnabled: true, macroEnabled: true },
    settings: { theme: 'dark', compactMode: false }
  },
  'acc_2': {
    accountId: 'acc_2',
    profile: { name: 'US Tech', baseCurrency: 'USD' },
    holdings: [],
    watchlist: [],
    newsPrefs: { trackedSymbols: [], sentimentEnabled: true, macroEnabled: false },
    settings: { theme: 'dark', compactMode: false }
  },
  'acc_3': {
    accountId: 'acc_3',
    profile: { name: 'Crypto', baseCurrency: 'USD' },
    holdings: [],
    watchlist: [],
    newsPrefs: { trackedSymbols: [], sentimentEnabled: true, macroEnabled: false },
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
