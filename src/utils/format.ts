import type { Currency } from '@/lib/types';

/**
 * The single money formatter for the app. HoldingsTable and WatchlistTable both
 * use it so a price can never be rendered two different ways depending on which
 * table you are looking at.
 *
 * The locale is derived from the CURRENCY and never left to the runtime default:
 * `Intl.NumberFormat(undefined, …)` resolves differently on the Node server than
 * in the browser, which produces a React hydration mismatch on server-rendered
 * tables (the same class of bug that hit StalenessBadge — see its header).
 * Pinning en-IN/en-US keeps SSR output deterministic.
 */
export function formatCurrency(value: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
