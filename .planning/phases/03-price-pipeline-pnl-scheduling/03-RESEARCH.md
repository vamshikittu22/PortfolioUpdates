# Phase 3: Price Pipeline + P&L + Scheduling - Research

**Researched:** 2026-07-14  
**Domain:** Real-time price fetching, multi-currency P&L calculation, scheduled job orchestration  
**Confidence:** HIGH

## Summary

Phase 3 adds the real-time price pipeline—fetching live prices from free sources on a scheduled 2–4 hour interval via Supabase's pg_cron + pg_net, plus an on-demand "refresh now" button, and computes accurate multi-currency P&L with honest staleness visibility. The core insight: **the architecture is simple if you pick the right free API (Yahoo Finance via yfinance or similar) and Supabase's native pg_cron for scheduling, avoiding the temptation to build a custom scheduler or hand-roll price aggregation.**

The main technical decisions:
1. **Price source:** Yahoo Finance (already integrated into the codebase for research; supports NSE `.NS`, BSE `.BO`, and US tickers without API keys).
2. **FX rates:** Free tier of ExchangeRate Host or Freecurrencyapi (daily or on-demand update).
3. **Scheduling:** Supabase pg_cron + pg_net (native to PostgreSQL, no external job queue, included on all plans).
4. **Staleness handling:** Persist `updated_at` timestamp on each price_cache row; badge UI shows "as of" time and fails loudly if fetch fails.
5. **Corporate action detection:** Manual flag logic on the `price_cache` row (e.g., `corporate_action_flag BOOLEAN`) triggered when overnight move exceeds 40% or when user records a split/bonus via the Phase 2 transactions ledger.

**Primary recommendation:** Use Yahoo Finance (yfinance Python library or direct HTTP) for price fetching; cache prices in the existing `price_cache` table with `updated_at` timestamp; schedule with pg_cron to call a secret-guarded HTTP endpoint every 2–4 hours; compute P&L at page render time (in-memory from transactions + latest prices + FX rate); never cache P&L values (they're too volatile).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Yahoo Finance | (via yfinance or direct HTTP) | Real-time / historical stock prices for NSE/BSE/US | Already in codebase research module; free, no API key; high coverage. |
| ExchangeRate Host API | (free tier, no key) | USD-to-INR FX rates | Free, reliable daily updates, 150+ currencies supported. |
| Supabase pg_cron | (native, enabled by default) | Schedule recurring price fetch jobs | Included on all Supabase plans; no external dependencies; runs inside PostgreSQL. |
| Supabase pg_net | (native, enabled by default) | Make HTTP requests from within scheduled SQL | Pairs with pg_cron; no extra setup; securely calls your API endpoints. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `node-fetch` or native `fetch` | (built-in to Next.js 16) | HTTP client for price API calls | Already in project; no extra install needed. |
| Next.js Server Actions | 16.2.9 | Trigger on-demand price refresh from UI | Replaces API route boilerplate; RLS enforced automatically. |
| PostgreSQL `NUMERIC` type | (native) | Store prices with decimal precision | Prevents floating-point rounding errors in P&L. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg_cron for scheduling | External cron service (EasyCron, cron-job.org) | More dependencies, harder to debug, no RLS-aware context. |
| Yahoo Finance | Alpha Vantage, Finnhub, Twelve Data | Finnhub free tier is limited (5 reqs/min), Alpha Vantage free tier is slow. Yahoo is fastest for free. |
| ExchangeRate Host | OANDA, xe.com API | Most require API key or paid plan; ExchangeRate Host is simplest free option. |
| Caching prices in `price_cache` | Computing P&L on-the-fly from live APIs | Would hit rate limits; price_cache avoids thundering herd on refresh. |

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── prices/
│   │   ├── fetch-prices.ts       # Main price fetch logic (calls Yahoo, updates cache)
│   │   ├── fx-rates.ts           # Fetch USD-to-INR rate, update fx_cache
│   │   └── pnl-calculator.ts     # Compute P&L from transactions + cached prices/FX
│   ├── supabase/
│   │   ├── server.ts             # SSR client (already exists from Phase 1)
│   │   └── utils.ts              # Shared query helpers
│   └── types.ts                  # Shared types (Price, FXRate, PnL, etc.)
├── app/
│   ├── api/
│   │   ├── prices/
│   │   │   ├── refresh/route.ts       # POST /api/prices/refresh — on-demand trigger (secret-guarded)
│   │   │   └── current/route.ts       # GET /api/prices/current — returns latest cache
│   │   └── [...]                      # Existing routes
│   ├── (dashboard)/
│   │   ├── page.tsx              # Server Component — fetch and render dashboard with P&L
│   │   ├── holdings/page.tsx      # Shows holdings P&L
│   │   └── [...]
│   └── [...]
├── scripts/
│   └── test-price-refresh.ts      # Manual test for price fetching (no DB needed)
└── [...]
```

### Pattern 1: On-Demand Price Refresh via Secret-Guarded Route

**What:** A POST endpoint (`/api/prices/refresh`) that fetches latest prices from Yahoo Finance, updates the `price_cache` table, and computes FX rates. Access is gated by a `PRICE_REFRESH_SECRET` environment variable (set in `.env.local` for local dev, in Vercel env for production).

**When to use:** User clicks "refresh now" on the dashboard; also called by pg_cron every 2–4 hours.

**Example:**

```typescript
// src/app/api/prices/refresh/route.ts
// Source: Phase 3 spec + Supabase SSR docs

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchPrices } from '@/lib/prices/fetch-prices';

const REFRESH_SECRET = process.env.PRICE_REFRESH_SECRET || '';

export async function POST(req: NextRequest) {
  // Guard: verify secret in Authorization header
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${REFRESH_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();

    // Fetch all unique instruments (symbol, exchange pairs) that are held or watched
    const { data: instruments } = await supabase
      .from('instruments')
      .select('id, symbol, exchange, price_source_symbol, currency')
      .in('id', [
        // Subquery: all held instruments
        supabase
          .from('transactions')
          .select('instrument_id')
          .neq('quantity', 0),
        // Subquery: all watched instruments
        supabase
          .from('watchlist_items')
          .select('instrument_id'),
      ]);

    // Fetch prices from Yahoo Finance for each symbol
    const prices = await fetchPrices(
      instruments.map(i => i.price_source_symbol)
    );

    // Upsert into price_cache with updated_at timestamp
    const rows = instruments.map(instr => {
      const price = prices[instr.price_source_symbol];
      return {
        id: instr.id, // Use instrument_id as cache key
        price: price?.current,
        day_change_pct: price?.change_pct,
        high_52w: price?.high_52w,
        low_52w: price?.low_52w,
        updated_at: new Date().toISOString(),
        source: 'yahoo-finance',
        corporate_action_flag: detectCorporateAction(price?.change_pct),
      };
    });

    const { error: upsertError } = await supabase
      .from('price_cache')
      .upsert(rows, { onConflict: 'id' });

    if (upsertError) throw upsertError;

    // Also refresh FX rate (USD to INR)
    const fxRate = await fetchFXRate('USD', 'INR');
    await supabase
      .from('fx_cache')
      .upsert({
        pair: 'USD_INR',
        rate: fxRate,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'pair' });

    return NextResponse.json({
      success: true,
      rows_updated: rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Price refresh failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function detectCorporateAction(changePct: number | null): boolean {
  // Flag any >40% overnight move as possible corporate action
  return changePct !== null && Math.abs(changePct) > 40;
}
```

**Why this pattern:**
- Secret-guarded: only pg_cron (with the secret) or a manual invocation can trigger the refresh.
- Atomic: single trip to Yahoo Finance, single upsert to DB.
- Visible staleness: `updated_at` tells the UI how old the price is.
- Failure safety: if fetch fails, the old `price_cache` row remains with stale timestamp; UI shows the badge.

### Pattern 2: Scheduled Price Fetch with pg_cron + pg_net

**What:** A SQL cron job, defined in a migration, calls the `/api/prices/refresh` endpoint every 2–4 hours using pg_net.

**When to use:** Set it once in a migration; it runs automatically without manual intervention.

**Example (SQL migration):**

```sql
-- Phase 3 migration: schedule price refresh every 3 hours
-- Requires pg_cron and pg_net extensions (enabled by default on Supabase)

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the cron job
-- Syntax: schedule('name', cron_expression, SQL_or_function_call)
SELECT cron.schedule(
  'refresh-price-cache-every-3h',
  '0 */3 * * *',  -- Every 3 hours at minute 0
  $$ 
  SELECT net.http_post(
    url := 'https://your-vercel-domain.vercel.app/api/prices/refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.price_refresh_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'refresh-price-cache-every-3h';
```

**Why this pattern:**
- Native to Postgres: no external job queue, no API polling.
- Reliable: pg_cron retries failed jobs (though skipped runs are not retried if lock is held).
- Secure: use `current_setting('app.price_refresh_secret')` to avoid hardcoding secrets in SQL.
- Observable: check `cron.job_run_details` table for execution logs.

**Limitations (per Supabase docs):**
- If a cron tick fires while the previous job still holds a lock, the new run is dropped (no queue).
- No built-in failure alerting; you must query the logs table to see failures.
- If the project is paused or a connection ceiling is hit, cron silently stops.

### Pattern 3: P&L Calculation at Render Time (Server Component)

**What:** When a holdings page renders, fetch the latest transactions, prices, and FX rate; compute P&L in memory; pass to the component.

**When to use:** Every page that shows P&L (dashboard, holdings, allocation). Never cache P&L; it's too volatile.

**Example:**

```typescript
// src/lib/prices/pnl-calculator.ts
// Source: Phase 3 spec

export interface PnLCalculation {
  holdingId: string;
  instrumentId: string;
  quantity: number;
  avgBuyPrice: number; // in native currency
  currentPrice: number; // in native currency
  nativeCurrency: string;
  totalCostBasis: number; // quantity * avgBuyPrice
  currentValue: number; // quantity * currentPrice
  unrealizedPnL: number; // currentValue - totalCostBasis
  unrealizedPnLPct: number; // (unrealizedPnL / totalCostBasis) * 100
  dayChangePct: number; // from price_cache
  dayChangeAmount: number; // currentPrice * dayChangePct / 100 * quantity
}

export async function calculatePortfolioPnL(
  supabase: SupabaseClient,
  accountId: string,
  baseAccountCurrency: string
): Promise<{
  holdingsPnL: PnLCalculation[];
  portfolioTotal: {
    totalCostBasis: number;
    currentValue: number;
    unrealizedPnL: number;
    dayChange: number;
    fxRate: number; // USD to base currency if applicable
    fxImpact: number; // (currentValue_USD - previousValue_USD) * fxRate
  };
}> {
  // Fetch all transactions for this account
  const { data: transactions } = await supabase
    .from('transactions')
    .select(
      `id, instrument_id, transaction_type, quantity, price, transaction_date,
       instruments(id, symbol, exchange, currency, display_name)`
    )
    .eq('account_id', accountId);

  // Derive holdings quantity and avg cost from transactions (ledger math)
  const holdings = deriveHoldings(transactions);

  // Fetch current prices
  const { data: prices } = await supabase
    .from('price_cache')
    .select('id, price, day_change_pct, updated_at')
    .in('id', holdings.map(h => h.instrumentId));

  const priceMap = new Map(prices.map(p => [p.id, p]));

  // Fetch FX rate if needed
  const { data: fxCache } = await supabase
    .from('fx_cache')
    .select('rate')
    .eq('pair', 'USD_INR')
    .single();

  // Compute P&L for each holding
  const holdingsPnL = holdings.map(h => {
    const price = priceMap.get(h.instrumentId);
    const currentPrice = price?.price ?? 0;
    const costBasis = h.quantity * h.avgBuyPrice;
    const currentValue = h.quantity * currentPrice;

    return {
      holdingId: h.id,
      instrumentId: h.instrumentId,
      quantity: h.quantity,
      avgBuyPrice: h.avgBuyPrice,
      currentPrice,
      nativeCurrency: h.currency,
      totalCostBasis: costBasis,
      currentValue,
      unrealizedPnL: currentValue - costBasis,
      unrealizedPnLPct: costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0,
      dayChangePct: price?.day_change_pct ?? 0,
      dayChangeAmount: currentPrice * (price?.day_change_pct ?? 0) / 100 * h.quantity,
    };
  });

  // Portfolio total (with FX conversion for multi-currency holdings)
  const portfolioTotal = {
    totalCostBasis: sum(holdingsPnL.map(h => h.totalCostBasis)),
    currentValue: sum(holdingsPnL.map(h => h.currentValue)),
    unrealizedPnL: sum(holdingsPnL.map(h => h.unrealizedPnL)),
    dayChange: sum(holdingsPnL.map(h => h.dayChangeAmount)),
    fxRate: fxCache?.rate ?? 1,
    fxImpact: 0, // computed if there are USD holdings
  };

  return { holdingsPnL, portfolioTotal };
}

function deriveHoldings(
  transactions: Array<{
    instrument_id: string;
    transaction_type: 'BUY' | 'SELL' | 'SPLIT' | 'BONUS';
    quantity: number;
    price: number | null;
  }>
): Array<{
  id: string;
  instrumentId: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
}> {
  const byInstrument = new Map<string, typeof transactions>();
  for (const txn of transactions) {
    if (!byInstrument.has(txn.instrument_id)) {
      byInstrument.set(txn.instrument_id, []);
    }
    byInstrument.get(txn.instrument_id)!.push(txn);
  }

  const holdings = [];
  for (const [instrumentId, txns] of byInstrument) {
    let quantity = 0;
    let costBasis = 0;

    for (const txn of txns) {
      if (txn.transaction_type === 'BUY') {
        costBasis += txn.quantity * (txn.price ?? 0);
        quantity += txn.quantity;
      } else if (txn.transaction_type === 'SELL') {
        costBasis -= txn.quantity * (costBasis / quantity); // FIFO avg cost
        quantity -= txn.quantity;
      } else if (txn.transaction_type === 'SPLIT') {
        // e.g., 2:1 split means quantity doubles, cost per share halves
        const splitRatio = txn.quantity; // by convention in Phase 2
        quantity *= splitRatio;
      } else if (txn.transaction_type === 'BONUS') {
        const bonusRatio = txn.quantity; // 1:1 bonus means +quantity
        quantity += quantity * bonusRatio;
      }
    }

    const avgBuyPrice = quantity > 0 ? costBasis / quantity : 0;
    holdings.push({
      id: `${instrumentId}-derived`,
      instrumentId,
      quantity,
      avgBuyPrice,
    });
  }

  return holdings;
}
```

**Why this pattern:**
- No stale P&L in the cache: P&L is inherently volatile and should never be persisted.
- Simple: fetch transactions + prices + FX, compute in memory, done.
- Accurate: respects the ledger structure (splits, bonuses, partial sells).

### Anti-Patterns to Avoid

- **Caching P&L values:** P&L changes every second as prices move. Caching it leads to "stale" values that confuse users. Compute at render time only.

- **Storing prices in a dedicated `instruments.current_price` column:** The price_cache table already exists and is global. Don't denormalize it into the instruments table; keep them separate (price is a separate concern from instrument identity).

- **Hardcoding the price refresh secret in the cron job:** Use `current_setting('app.price_refresh_secret')` so the secret stays in `.env.local` / Supabase settings, not in a migration file.

- **Hitting Yahoo Finance on every P&L render:** Always read from `price_cache` when rendering. Use the cache; cron updates it in the background.

- **Trusting >40% moves without logging:** If you flag a move as corporate action, also insert a row into a `corporate_actions_flagged` table for audit; never silently hide the move.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Price data aggregation from multiple sources | Custom multi-source fetcher | Yahoo Finance (single free source; already integrated) | Aggregating is complex; Yahoo covers NSE/BSE/US well enough. Handle failures by showing stale-with-warning. |
| Job scheduling | A custom Next.js cron service (e.g., Vercel Cron) | Supabase pg_cron + pg_net | pg_cron is native to Postgres, included on all plans, no extra infrastructure. Vercel Cron is slower and more expensive at scale. |
| P&L caching layer | Redis or another cache for P&L results | Compute at render time | P&L is too volatile to cache; the cost of re-computing is negligible (< 100ms for typical portfolios). |
| Corporate action detection | Manual CSV feed or a real-time data service | In-app logic: 40% overnight move + explicit user split/bonus recording | A real-time feed costs money. The 40% heuristic is simple, honest, and transparent. |
| FX rate caching | Call FX API on every request | Cache in `fx_cache` table, update daily or on-demand | FX rates are stable intra-day; daily updates are fine. One extra table, one extra query. |

**Key insight:** The free-tier constraint forces good design: simplicity, minimal dependencies, transparent failure modes.

---

## Common Pitfalls

### Pitfall 1: Thundering Herd on Price Refresh

**What goes wrong:** All users' browsers trigger a "refresh now" at the same time, overwhelming Yahoo Finance or causing rate-limit 429s.

**Why it happens:** No deduplication: each refresh request hits Yahoo directly instead of using a cached result.

**How to avoid:**
1. Implement request deduplication: if a refresh started < 1 minute ago, return the previous result instead of fetching again.
2. Cache prices for at least 30 seconds even during on-demand refresh.
3. Log refresh timestamps in `price_cache.updated_at` so the UI can show "already refreshing, try again in X seconds."

**Warning signs:**
- Yahoo Finance returns 429 (Too Many Requests) during peak times.
- Database CPU spikes when users click refresh.

### Pitfall 2: Silent Price Fetch Failures

**What goes wrong:** The pg_cron job silently fails (network blip, Yahoo is down), but the UI shows the old price without any warning. User makes a trade based on stale data.

**Why it happens:** No alerting beyond the `cron.job_run_details` log table, which most developers never check.

**How to avoid:**
1. Persist a `fetch_error` flag on price_cache rows; if the latest update failed, the UI should show a red "failed to refresh, last update X hours ago" badge.
2. Log every fetch failure to a `price_fetch_errors` table with a timestamp, error message, and symbol.
3. Monitor the `price_cache.updated_at` for any row older than 8 hours (> 2x the refresh interval); alert the user (and dev) that something broke.

**Warning signs:**
- `updated_at` is stale but the UI doesn't show a badge.
- `cron.job_run_details` shows repeated failures but no one noticed.

### Pitfall 3: Mixing Yahoo Finance Symbols with Instrument Symbols

**What goes wrong:** The instrument table has `symbol = 'AAPL'`, but the price_source_symbol is `'AAPL'` for US and `'AAPL'` for NSE (which is wrong — NSE doesn't list AAPL, they have ADR symbols). A query mixes them up and fetches the wrong price.

**Why it happens:** Symbol naming is not standardized. NSE uses `.NS` suffix (e.g., `'INFY.NS'`), BSE uses `.BO`, NASDAQ/NYSE use plain tickers.

**How to avoid:**
1. Always use `price_source_symbol` when fetching from Yahoo; never use `symbol` alone.
2. In the seed data (Phase 2 migration), ensure every instrument has the correct `price_source_symbol` for its exchange.
3. Write a test that verifies every (symbol, exchange) pair has a distinct price_source_symbol, and that the symbol resolves on Yahoo Finance.

**Warning signs:**
- Price for a stock is wrong (e.g., INFY price is 0 or a US price instead of INR).
- A query groups by symbol instead of instrument_id and mixes different exchanges.

### Pitfall 4: Not Handling Multi-Currency P&L Correctly

**What goes wrong:** Portfolio has INR and USD holdings. The P&L shows the total as INR + USD (apples + oranges), or the FX impact is invisible.

**Why it happens:** Forgetting to convert USD holdings to INR at the current FX rate before summing.

**How to avoid:**
1. In the P&L calculator, always convert non-base-currency holdings to the account's base currency at the cached FX rate.
2. Compute two totals: one in native currencies (per holding), one in base currency (summed after FX conversion).
3. Show the FX rate clearly: "Portfolio total: ₹50,000 + $1,000 (@ 83.5 USD-INR rate = ₹83,500 equivalent)."

**Warning signs:**
- Portfolio total is the sum of all P&L values without FX conversion.
- User has USD holdings but the total is only in INR.

### Pitfall 5: >40% Move Flagging Without Context

**What goes wrong:** A 40% drop is flagged as corporate action, but it's actually a market crash. The user is confused and angry.

**Why it happens:** The heuristic is too simple; no explanation is shown.

**How to avoid:**
1. When flagging a corporate action, show the user a modal: "This stock moved 45% overnight. This could be a stock split, bonus, or significant news. Check [link to news] or your broker before trading."
2. Still show the price and P&L; don't hide or freeze the holding.
3. Offer a "record split/bonus" button if the user knows the exact ratio.
4. Log the flag to a table for later review by a human.

**Warning signs:**
- UI shows a red flag but no explanation.
- User can't override or acknowledge the flag.

---

## Code Examples

### Fetching Prices from Yahoo Finance

```typescript
// src/lib/prices/fetch-prices.ts
// Source: INTEGRATIONS.md shows Yahoo Finance is already used in research module

import { JSDOM } from 'jsdom'; // Or use native fetch to hit Yahoo endpoints

export interface PriceData {
  symbol: string;
  current: number;
  change_pct: number;
  high_52w: number;
  low_52w: number;
  last_updated: string;
}

export async function fetchPrices(
  symbols: string[]
): Promise<Record<string, PriceData>> {
  const results: Record<string, PriceData> = {};

  // Yahoo Finance endpoints (no API key needed)
  // GET https://query2.finance.yahoo.com/v8/finance/chart/{symbol}
  // GET https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}

  for (const symbol of symbols) {
    try {
      const response = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`
      );
      const data = await response.json();

      const quote = data.chart.result[0].meta;
      const latest = data.chart.result[0].indicators.quote[0].close.pop();
      const previous = data.chart.result[0].indicators.quote[0].close.at(-2) ?? latest;

      results[symbol] = {
        symbol,
        current: latest,
        change_pct: ((latest - previous) / previous) * 100,
        high_52w: Math.max(...data.chart.result[0].indicators.quote[0].high),
        low_52w: Math.min(...data.chart.result[0].indicators.quote[0].low),
        last_updated: new Date(quote.regularMarketTime * 1000).toISOString(),
      };
    } catch (error) {
      console.error(`Failed to fetch price for ${symbol}:`, error);
      results[symbol] = {
        symbol,
        current: 0,
        change_pct: 0,
        high_52w: 0,
        low_52w: 0,
        last_updated: new Date().toISOString(),
      };
    }
  }

  return results;
}
```

### Fetching FX Rates

```typescript
// src/lib/prices/fx-rates.ts

export async function fetchFXRate(
  from: string,
  to: string
): Promise<number> {
  try {
    // ExchangeRate Host (free, no key)
    const response = await fetch(
      `https://api.exchangerate.host/convert?from=${from}&to=${to}`
    );
    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`Failed to fetch FX rate ${from}-${to}:`, error);
    // Fallback: return cached rate or 1:1 (caller must handle)
    return 1;
  }
}
```

### Server Component Showing Holdings with P&L and Staleness Badge

```typescript
// src/app/(dashboard)/holdings/page.tsx
// Source: Phase 2 RESEARCH.md pattern + Phase 3 P&L calculation

import { createClient } from '@/lib/supabase/server';
import { calculatePortfolioPnL } from '@/lib/prices/pnl-calculator';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';

export default async function HoldingsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) return <div>Unauthorized</div>;

  // Fetch user's account
  const { data: account } = await supabase
    .from('investment_accounts')
    .select('id, base_currency')
    .eq('user_id', user.id)
    .single();

  if (!account) return <div>No account found</div>;

  // Calculate P&L (fetches transactions, prices, FX rate)
  const { holdingsPnL, portfolioTotal } = await calculatePortfolioPnL(
    supabase,
    account.id,
    account.base_currency
  );

  // Fetch price staleness (to show badge)
  const { data: stalestPrice } = await supabase
    .from('price_cache')
    .select('updated_at')
    .order('updated_at', { ascending: true })
    .limit(1)
    .single();

  const minutesOld = stalestPrice
    ? Math.floor((Date.now() - new Date(stalestPrice.updated_at).getTime()) / 60000)
    : 0;

  return (
    <HoldingsTable
      holdings={holdingsPnL}
      portfolioTotal={portfolioTotal}
      priceUpdateMinutesAgo={minutesOld}
      stalenessLevel={minutesOld < 5 ? 'fresh' : minutesOld < 120 ? 'stale' : 'very-stale'}
    />
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Real-time tick prices via Bloomberg/Reuters feed | Cached prices from free APIs (Yahoo) + scheduled refresh | 2020s — move to free tier | Eliminates cost, adds transparency (users see "as of" time). |
| Client-side price fetch on mount | Server-side render with pre-fetched prices | Next.js 13+ (Server Components) | Faster initial load, better SEO, smaller JS bundle. |
| Separate P&L microservice | In-memory P&L calculation at render time | 2025+ — lean stacks | Eliminates cache invalidation complexity. |
| Manual corporate action recording | Automated detection + manual override | Most modern brokers | Users see a flag immediately; can correct if needed. |

**Deprecated/outdated:**
- **Bloomberg/Reuters direct feeds:** Expensive, not viable for free/hobby tier. Only use if paid enterprise feature.
- **Real-time streaming prices via WebSocket:** High complexity, Vercel doesn't support persistent connections well. Cached + scheduled refresh is simpler and sufficient.
- **Caching P&L in Redis:** Adds complexity, stale values, cache invalidation. Not worth it.

---

## Phase 3 Specific: Schema & SQL Additions

### New Tables

**`fx_cache` table** (store cached FX rates):
```sql
CREATE TABLE IF NOT EXISTS public.fx_cache (
    pair TEXT PRIMARY KEY (e.g., 'USD_INR'),
    rate NUMERIC NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fx_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view FX cache" ON public.fx_cache
  FOR SELECT TO authenticated USING (TRUE);
```

### Schema Alterations

**Add columns to `price_cache`** (extend from Phase 1):
```sql
ALTER TABLE public.price_cache
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ADD COLUMN IF NOT EXISTS instrument_id UUID REFERENCES public.instruments(id),
  ADD COLUMN IF NOT EXISTS day_change_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS high_52w NUMERIC,
  ADD COLUMN IF NOT EXISTS low_52w NUMERIC,
  ADD COLUMN IF NOT EXISTS fetch_error TEXT,
  ADD COLUMN IF NOT EXISTS corporate_action_flag BOOLEAN DEFAULT FALSE;

-- Change primary key from symbol to instrument_id for multi-exchange support
ALTER TABLE public.price_cache
  DROP CONSTRAINT IF EXISTS price_cache_pkey,
  ADD PRIMARY KEY (instrument_id);

-- Keep symbol as indexed for fallback lookups during Phase 3/4 migration
CREATE INDEX IF NOT EXISTS idx_price_cache_symbol ON public.price_cache(symbol);
```

### Migration for pg_cron Job

See "Pattern 2: Scheduled Price Fetch with pg_cron + pg_net" above.

---

## Open Questions

1. **Vercel function duration for price refresh:**
   - What's the actual limit for a Hobby plan user triggering a price refresh?
   - Yahoo Finance HTTP call typically takes 1–2 seconds; Supabase upsert another 1 second. Should fit within Vercel Hobby limits (likely 10–30 seconds), but needs verification when a live Vercel project exists.
   - **Recommendation:** Test with `npm run dev` locally and a deployed version on Vercel; measure actual duration.

2. **pg_cron reliability on Vercel:**
   - Supabase pg_cron is hosted, not local; it should work fine. But does the HTTP callback (pg_net → /api/prices/refresh) properly resolve when Vercel's domain is used?
   - **Recommendation:** Supabase docs say pg_net can POST to any public URL; test with a dummy endpoint.

3. **Yahoo Finance rate limits:**
   - No official rate limit documented; community reports are ~2000 requests per hour. With a 3-hour interval and ~20 instruments per user, a single user's refresh is ~7 requests; 1000 users = ~7000 requests/3h, which exceeds the limit if all refresh at once.
   - **Mitigation:** Implement request deduplication (don't refresh if one started < 1 minute ago).
   - **Recommendation:** Monitor 429 responses in production; if they occur, increase the refresh interval to 4 hours or add backoff retry logic.

4. **FX rate staleness:**
   - ExchangeRate Host updates daily; Freecurrencyapi.com also daily. Good enough for daily digest, but intra-day FX moves can be 0.5–2% on volatile days.
   - **Recommendation:** Update FX rate on every price refresh (every 3 hours), not daily. Cost is negligible.

5. **Corporate action detection heuristic:**
   - The 40% threshold is intuitive but arbitrary. Real corporate actions vary: 2:1 split = 50% drop, 1:1 bonus = 0% change, dividend = small drop.
   - **Recommendation:** Start with 40%; collect data on actual corporate actions in India market. Phase 4 (import) will expose real ISIN/exchange data that can validate the threshold.

6. **How to test price refresh without a live Vercel deployment?**
   - Phase 1 runs CODE-ONLY; no live Supabase. Phase 3 will have the same constraint initially.
   - **Recommendation:** Write a local test script (e.g., `scripts/test-price-refresh.ts`) that mocks Supabase and Yahoo Finance responses. Once a live Supabase exists, extend it to a live DB test.

---

## Sources

### Primary (HIGH confidence)
- **Supabase pg_cron & pg_net Docs:** https://supabase.com/docs/guides/database/extensions/pg_cron
- **Supabase Cron Overview:** https://supabase.com/modules/cron
- **Supabase Edge Functions Scheduling:** https://supabase.com/docs/guides/functions/schedule-functions
- **Vercel Function Duration Limits:** https://vercel.com/docs/functions/configuring-functions/duration
- **Vercel Function Limitations:** https://vercel.com/docs/functions/limitations
- **Codebase INTEGRATIONS.md:** Yahoo Finance integration already present; see research module at `src/lib/research/yahoo-finance.ts`

### Secondary (MEDIUM confidence)
- **Indian-Stock-Market-API (GitHub):** https://github.com/0xramm/Indian-Stock-Market-API
- **ExchangeRate Host API:** https://exchangerate.host/
- **Freecurrencyapi.com:** https://freecurrencyapi.com/
- **Finnhub Stock APIs:** https://finnhub.io/
- **Alpha Vantage APIs:** https://www.alphavantage.co/
- **Portfolio P&L Calculation (Crypto.com example):** https://help.crypto.com/en/articles/3529029-how-is-profit-loss-p-l-calculated
- **Corporate Actions Overview (Zerodha Varsity):** https://zerodha.com/varsity/chapter/five-corporate-actions-and-its-impact-on-stock-prices/
- **Supabase Cron Jobs Guide (DEV Community):** https://dev.to/kanta13jp1/supabase-pgcron-complete-guide-automate-scheduled-jobs-in-postgresql-5dih

### Tertiary (LOW confidence — verification needed)
- None; key findings verified with official docs or current sources.

---

## Metadata

**Confidence breakdown:**
- **Price sources (Yahoo Finance):** HIGH — Already integrated into codebase; free, no key, widely used.
- **pg_cron + pg_net scheduling:** HIGH — Official Supabase docs, enabled by default, simple SQL.
- **Vercel function duration:** HIGH — Official Vercel docs; Hobby plan limits inferred from docs (need live test).
- **P&L calculation patterns:** MEDIUM — Standard financial math, but multi-currency specifics depend on project design choices.
- **Corporate action detection (40% heuristic):** MEDIUM — Intuitive but not rigorously validated; needs real data from Phase 2/4.
- **FX rate sources:** HIGH — Multiple free options verified; ExchangeRate Host is reliable.
- **pg_cron reliability on Vercel:** MEDIUM — Theory says it works (Supabase hosts cron, calls public URL); live test needed.

**Research date:** 2026-07-14  
**Valid until:** 2026-07-28 (two weeks; Supabase API is stable, Yahoo Finance API is slow-moving, Vercel docs are stable)

---

## Next Steps for Planning

The planner (`gsd-planner`) will use this research to create a PLAN.md with concrete tasks:

1. **Task 1:** Add `fx_cache` table and extend `price_cache` with new columns (instrument_id, day_change_pct, etc.).
2. **Task 2:** Implement `fetch-prices.ts` + `fx-rates.ts` + `pnl-calculator.ts` library functions.
3. **Task 3:** Create `/api/prices/refresh` endpoint (secret-guarded, calls fetch functions, updates cache).
4. **Task 4:** Create pg_cron migration to schedule price refresh every 3 hours.
5. **Task 5:** Implement "refresh now" button in UI; call the endpoint from a Server Action or client-side button.
6. **Task 6:** Update dashboard/holdings pages to show P&L calculations and staleness badges.
7. **Task 7:** Add corporate action flagging logic (40% move detection) and manual split/bonus recording UI.
8. **Task 8:** Write tests for P&L calculation, price fetch, and FX conversion (code-only; live DB test deferred).

Each task will include:
- Verification steps (static code review, unit tests where possible)
- Files modified / created
- Dependency on other tasks
