# Phase 2: Schema + Persistence + Hydration - Research

**Researched:** 2026-07-14  
**Domain:** Next.js data fetching patterns, Supabase RLS, multi-table schema design, client-server data flow  
**Confidence:** HIGH

## Summary

Phase 2 adds the transactions-ledger schema, instruments master table, and server-side data fetching to replace the client-side mock portfolio store. The phase goal is straightforward: enable users to persist holdings and watchlist data in Supabase, derive holdings from transactions, and have the UI read real data instead of mock. This is a "follow the patterns already established" phase rather than a novel architecture phase — Next.js 16 (current codebase version) has stable, well-documented patterns for server-side fetching, and Supabase's RLS-based multi-tenancy is already in use from Phase 1.

The main technical decision is **how to fetch persisted data in the UI**: Server Components (simplest, no JavaScript in the browser for data loading) vs. Server Actions (explicit fetch boundaries) vs. Client Components with `useEffect` + API routes (most control, adds complexity). The research strongly recommends **Server Components as the default**, with Server Actions for mutations (POST/PUT/DELETE), falling back to client-side fetching only when real-time updates or client-side state management are non-negotiable.

**Primary recommendation:** Use Next.js Server Components to query Supabase directly in component code; wrap mutations in Server Actions. Delete the mock portfolio store, mock data, and all client-side portfolio state. Add a `transactions` table (BUY/SELL/SPLIT/BONUS) and an `instruments` master table (ISIN, symbol, exchange, currency, price source). Compute holdings quantity and average cost as derived views or in-query calculations. Do not hand-roll custom fetching logic — Supabase client library handles streaming, caching, and error states.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.9 | React framework with Server Components (RSC) | Already in codebase; RSC is the de facto standard for data fetching in Next.js 13+ |
| @supabase/supabase-js | 2.108.2 | Supabase client library | Established in Phase 1; handles RLS, authentication, real-time subscriptions |
| @supabase/ssr | 0.12.0 | Server-safe Supabase client for RSC | Already in codebase; enables server-side auth context without exposing keys to browser |
| Zustand | 5.0.14 | Client-side state management | Already in codebase; lightweight, minimal boilerplate |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React | 19.2.4 | UI library | Already in codebase |
| server-only | 0.0.1 | Build-time guard to prevent server code in client | Already in codebase; enforce server context |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server Components for fetching | Client Components + API routes | More explicit boundaries, but adds HTTP roundtrips and client JS; use only for mutations |
| Server Actions for mutations | API route handlers (POST/PUT/DELETE) | More verbose; use Server Actions for simplicity |
| Supabase RLS for authorization | Custom middleware on API routes | Duplicate authorization logic; RLS is already there, use it |

**Why the stack is stable:**
- Server Components (`'use server'` directive) are stable in Next.js 13+ and are the direction the React ecosystem is moving.
- Supabase's RLS-based multi-tenancy is battle-tested; no need to rebuild authorization in API routes.
- The SSR client library is specifically designed to work with Server Components and handle the auth context correctly.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── supabase/
│   │   ├── server.ts          # SSR client for Server Components
│   │   ├── client.ts          # Browser client (already exists)
│   │   └── utils.ts           # Shared Supabase utilities (queries, row type definitions)
│   ├── types.ts               # Shared TypeScript types (Holding, WatchlistItem, Transaction, Instrument, etc.)
│   └── derived-values.ts      # Utility functions to compute holdings quantity/avg cost from transactions
├── app/
│   ├── api/
│   │   └── portfolio/         # API routes for any client-initiated mutations
│   │       ├── add-holding/route.ts
│   │       ├── delete-holding/route.ts
│   │       └── [...]
│   ├── (dashboard)/
│   │   ├── page.tsx           # Server Component — fetch and render dashboard
│   │   ├── holdings/
│   │   │   └── page.tsx       # Server Component — fetch and render holdings
│   │   └── layout.tsx         # Already exists, may stay as Client Component for sidebar
│   └── [...]
├── server-actions/            # Optional: grouped Server Actions (alternative to API routes)
│   └── portfolio.ts           # add/edit/delete holdings, watchlist, transactions
└── store/
    ├── usePortfolioStore.ts   # TO BE DELETED
    └── useAppStore.ts         # Keep: only for UI state (theme, sidebar collapse)
```

### Pattern 1: Server Components with Direct Supabase Queries

**What:** A Server Component queries Supabase directly at render time using the SSR client.  
**When to use:** Initial page load, any data that doesn't need real-time updates. This is the default pattern for all pages.  
**Example:**

```typescript
// src/app/(dashboard)/holdings/page.tsx
// Source: Next.js Server Components (official docs) + Supabase SSR (official docs)

import { createClient } from '@/lib/supabase/server';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';

export default async function HoldingsPage() {
  const supabase = await createClient();

  // Fetch holdings for the authenticated user's account
  // RLS automatically filters to user's data
  const { data: accounts } = await supabase
    .from('investment_accounts')
    .select('id, user_id, name, base_currency')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id!)
    .single();

  const { data: holdings } = await supabase
    .from('holdings')
    .select(
      `id, account_id, instrument_id, quantity, avg_buy_price,
       instruments(isin, symbol, exchange, display_name, currency, price_source_symbol)`
    )
    .eq('account_id', accounts.id);

  // Compute derived values (quantity, avg_cost) from transactions if needed
  // const enrichedHoldings = await enrichWithTransactions(holdings, supabase);

  return <HoldingsTable holdings={holdings} />;
}
```

**Why this pattern:**
- No client-side fetch code, no loading states to manage.
- Supabase RLS enforces authorization server-side (user can't read other users' data even if they craft an API request).
- Smaller JavaScript bundle (no fetch logic in browser).
- Build-time type safety: TypeScript knows the shape of data at compile time.

### Pattern 2: Server Actions for Mutations

**What:** A Server Action (marked with `'use server'`) handles POST/PUT/DELETE operations and returns updated data.  
**When to use:** Creating, editing, or deleting holdings, watchlist items, transactions — any mutation.  
**Example:**

```typescript
// src/server-actions/portfolio.ts
// Source: Next.js Server Actions (official docs) + Supabase SSR

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function addHolding(formData: FormData) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Unauthorized');

  const instrumentId = formData.get('instrument_id') as string;
  const quantity = parseFloat(formData.get('quantity') as string);
  const avgBuyPrice = parseFloat(formData.get('avg_buy_price') as string);

  // Get user's account (assume single account for now; Phase 2 simplification)
  const { data: account } = await supabase
    .from('investment_accounts')
    .select('id')
    .eq('user_id', user.id)
    .single();

  // Add a BUY transaction
  const { error } = await supabase.from('transactions').insert({
    account_id: account.id,
    instrument_id: instrumentId,
    transaction_type: 'BUY',
    quantity,
    price: avgBuyPrice,
    transaction_date: new Date(),
  });

  if (error) throw error;

  // Revalidate holdings page to show updated data
  revalidatePath('/holdings');

  return { success: true };
}
```

**Why this pattern:**
- Server Actions are framework-native: no API route boilerplate.
- `revalidatePath()` automatically refreshes the page's cached data.
- Authorization (RLS) is enforced before the mutation reaches the database.
- Can be called directly from form submissions or client-side buttons without a separate API request.

### Pattern 3: Client Components with Suspense Boundaries (for Real-Time or Client-Driven Updates)

**What:** A Client Component uses `useEffect` + Supabase client to subscribe to real-time updates, or explicitly fetches on user interaction.  
**When to use:** ONLY when real-time updates are required (e.g., price ticker, live P&L), or when the page is heavily interactive and you need client-side state for control. **Avoid for initial data load.**  
**Example:**

```typescript
// src/components/dashboard/WatchlistTable.tsx (IF real-time updates are needed)
// Source: Supabase real-time subscriptions (official docs)

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { WatchlistItem } from '@/lib/types';

export function WatchlistTable() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const supabase = createClient();

  useEffect(() => {
    // Initial fetch
    supabase
      .from('watchlist_items')
      .select('*')
      .then(({ data }) => setWatchlist(data || []));

    // Subscribe to changes
    const subscription = supabase
      .from('watchlist_items')
      .on('*', (payload) => {
        // Refetch or update state based on payload
        setWatchlist(prev => /* update based on payload */);
      })
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  return <div>{/* render watchlist */}</div>;
}
```

**Why use sparingly:**
- Adds client-side JavaScript and state management complexity.
- Real-time subscriptions incur Supabase connection overhead.
- For Phase 2, real-time updates are not a requirement; defer to Phase 3 (prices) or later.

### Anti-Patterns to Avoid

- **Fetching in a Client Component without Suspense:** Using `useEffect` to fetch data in a Client Component without wrapping the component in a Suspense boundary creates a waterfall (layout renders → client hydrates → effect runs → data fetches). Use Server Components instead, or wrap in Suspense.
  
- **Storing persisted data in Zustand:** The portfolio store's mock data must be deleted. Do not replace it with a Zustand store that fetches and caches Supabase data; instead, fetch server-side or use React Query (not in codebase) for client-side caching. Phase 2 has no real-time requirement, so Server Components are better.

- **Making multiple Supabase queries per page:** If a page needs data from 3 tables, don't make 3 separate `supabase.from()` calls in `useEffect`. Instead, use Supabase's `select()` with joins to fetch all data in one query.

- **Mixing authorization checks in the application code and RLS:** RLS is already enforced; don't add additional permission checks in route handlers or Server Actions (it's redundant and can create bugs). Trust RLS to do its job.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deriving holdings from transactions | A custom state machine that recalculates holdings on every data change | Computed views in the database (PostgreSQL views or a `view_holdings` query) or in-memory aggregation at render time using `.reduce()` | Database-level aggregation is more efficient and correct; in-memory aggregation is acceptable for Phase 2 given expected data volume (~100s of holdings per user). Custom state machines are error-prone. |
| Ensuring RLS is enforced | Application-layer permission checks before Supabase calls | Supabase RLS policies alone; no application-layer checks | RLS is already set up from Phase 1; adding another permission layer is redundant and creates maintenance burden. Trust the database. |
| Handling Supabase authentication state across pages | A custom hook that subscribes to `auth.onAuthStateChange()` in every component | Use the SSR client on the server side; for the client, the layout's `useEffect` (already in code) is sufficient | The current layout already fetches `auth.getUser()` on mount; no need to duplicate. Server Components have auth context built-in. |
| Syncing UI state with database | A Zustand store that manually fetches and caches portfolio data | `revalidatePath()` after mutations to trigger Server Component re-renders | Server Components naturally re-fetch data on navigation or after mutations. Zustand adds unnecessary complexity. |
| Implementing a transaction ledger for holdings | A custom BUY/SELL event system | A simple `transactions` table (instrument_id, account_id, type, quantity, price, date) with a view or computed field for derived quantity/cost | The schema is already designed for this (from roadmap research); just implement it. |

**Key insight:** The codebase already has auth (Phase 1), RLS (Phase 1), and a Supabase client library. Phase 2's job is to *use* these correctly, not to rebuild them.

---

## Common Pitfalls

### Pitfall 1: Confusing when to use Server Components vs. Server Actions

**What goes wrong:** Developers new to Server Components often try to put form handling and mutations inside a Server Component's render function, leading to errors like "ReferenceError: fetch is not defined" or "function called on the server cannot return a component."

**Why it happens:** In traditional React, components are client-side; mixing server-side logic (database calls) with client-side rendering is new. The `'use server'` directive is easy to forget.

**How to avoid:**
1. **Pages and layouts are Server Components by default** (no `'use client'` directive). They can fetch data directly and render.
2. **Mutations and form handlers go in Server Actions** (`'use server'` at the top of the function). They run on the server, can write to the database, and return values to the client.
3. **Interactive UI (dropdowns, modals, real-time updates) goes in Client Components** (`'use client'` at the top). They can call Server Actions.
4. **Rule of thumb:** If a function reads from the database and renders HTML, put it in a Server Component. If it modifies the database or takes user input before deciding what to do, put it in a Server Action. If it needs `useState`, put it in a Client Component.

**Warning signs:**
- Error: "Cannot use fetch in a Server Component without 'use server'."
- Seeing `async function` inside a Client Component that's not a Server Action.
- Multiple `useEffect` hooks each making independent Supabase queries.

### Pitfall 2: N+1 queries when fetching holdings with related data

**What goes wrong:** Fetching holdings and then looping through each holding to fetch its instrument data results in 1 + holdings.length queries.

**Why it happens:** Developers coming from REST APIs are used to "fetch resource, then fetch relations;" Supabase's `.select()` with joins is unfamiliar.

**How to avoid:**
```typescript
// SLOW: N+1 queries
const { data: holdings } = await supabase.from('holdings').select('*');
const enriched = await Promise.all(
  holdings.map(h => supabase.from('instruments').select('*').eq('id', h.instrument_id).single())
);

// FAST: One query with joins
const { data: holdings } = await supabase
  .from('holdings')
  .select(`id, quantity, avg_buy_price, instruments(symbol, exchange, currency)`);
```

**Warning signs:**
- Page load time increases with number of holdings.
- Network tab shows many requests to `/functions/v1` or similar.

### Pitfall 3: Forgetting that RLS filters are invisible

**What goes wrong:** Developer queries `SELECT * FROM holdings WHERE id = '...'` and gets an empty result, then spends hours debugging why. The reason: RLS silently filtered the row because the user's account_id doesn't match.

**Why it happens:** RLS failures don't throw errors; they just return empty result sets. Debugging requires knowing the RLS policy.

**How to avoid:**
1. Always check the RLS policies for the table you're querying. Ensure your `WHERE` clause (or the current user) satisfies the policy.
2. In development, test with two different users to confirm one can't read the other's data.
3. Log the authenticated user ID when debugging: `console.log((await supabase.auth.getUser()).data.user?.id)` and cross-check against the rows' `account_id` or `user_id`.

**Warning signs:**
- Query returns empty even though you know the row exists.
- Another user's session doesn't see their own data.

### Pitfall 4: Mixing up `account_id` and `user_id`

**What goes wrong:** The schema has both `user_id` on `investment_accounts` and `account_id` on `holdings`, alerts, etc. A query accidentally filters by user_id when it should filter by account_id, or vice versa.

**Why it happens:** The naming is intentional (to distinguish the auth user from the account entity), but it's easy to mix them up.

**How to avoid:**
1. Always think of `user_id` as "the auth user" and `account_id` as "which portfolio this row belongs to."
2. When writing a query, ask: "Which user am I logged in as?" (`user_id`) vs. "Which account are they viewing?" (`account_id`).
3. Follow this pattern: get the user → get their account → query by account_id.

**Warning signs:**
- Queries return data from the wrong user's account.
- After switching accounts, the UI still shows the old account's data.

### Pitfall 5: Not revalidating after a mutation

**What goes wrong:** User adds a holding, the Server Action succeeds and returns, but the page still shows the old holdings list.

**Why it happens:** Next.js caches the result of Server Component renders. After a mutation, you must tell Next.js to re-render the affected page.

**How to avoid:**
```typescript
'use server';

export async function addHolding(data: AddHoldingInput) {
  const supabase = await createClient();
  // ... add the holding ...
  
  // MUST call this to trigger a re-render
  revalidatePath('/holdings');
  revalidatePath('/'); // dashboard also shows holdings
}
```

**Warning signs:**
- Data doesn't update on the page after a mutation, even though the server log shows success.
- Manual refresh (F5) shows the updated data.

---

## Code Examples

### Fetching a user's holdings with instruments (Server Component)

```typescript
// src/app/(dashboard)/holdings/page.tsx
// Source: Next.js Server Components (official docs) + Supabase (official docs)

import { createClient } from '@/lib/supabase/server';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import type { Holding } from '@/lib/types';

export default async function HoldingsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    // The middleware should have redirected to /login, so this shouldn't happen
    return <div>Unauthorized</div>;
  }

  // Fetch user's account
  const { data: account, error: accountError } = await supabase
    .from('investment_accounts')
    .select('id')
    .eq('user_id', user.id)
    .single(); // Assume one account; Phase 2 simplification

  if (accountError || !account) {
    return <div>Error loading account</div>;
  }

  // Fetch holdings with instrument details
  const { data: holdings, error: holdingsError } = await supabase
    .from('holdings')
    .select(
      `
      id,
      instrument_id,
      quantity,
      avg_buy_price,
      created_at,
      instruments(
        id,
        isin,
        symbol,
        exchange,
        display_name,
        currency,
        asset_type
      )
      `
    )
    .eq('account_id', account.id)
    .order('created_at', { ascending: false });

  if (holdingsError) {
    return <div>Error loading holdings: {holdingsError.message}</div>;
  }

  // Transform to component shape
  const formattedHoldings: Holding[] = (holdings || []).map(h => ({
    id: h.id,
    ticker: h.instruments.symbol,
    name: h.instruments.display_name,
    quantity: h.quantity,
    avgPrice: h.avg_buy_price,
    currency: h.instruments.currency,
    // Other fields like currentPrice come from a separate price cache query or Phase 3
  }));

  return <HoldingsTable holdings={formattedHoldings} />;
}
```

### Server Action to add a holding

```typescript
// src/server-actions/portfolio.ts
// Source: Next.js Server Actions (official docs) + Supabase (official docs)

'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface AddHoldingInput {
  instrumentId: string;
  quantity: number;
  avgBuyPrice: number;
}

export async function addHolding(input: AddHoldingInput) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) {
    throw new Error('Unauthorized');
  }

  // Get user's account
  const { data: account, error: accountError } = await supabase
    .from('investment_accounts')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (accountError || !account) {
    throw new Error('Could not find account');
  }

  // Insert a BUY transaction (which will be aggregated into holdings quantity)
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      account_id: account.id,
      instrument_id: input.instrumentId,
      transaction_type: 'BUY',
      quantity: input.quantity,
      price: input.avgBuyPrice,
      transaction_date: new Date().toISOString(),
    })
    .select();

  if (error) {
    throw new Error(`Failed to add holding: ${error.message}`);
  }

  // Invalidate the cache so the holdings page re-renders
  revalidatePath('/holdings');
  revalidatePath('/'); // Dashboard also shows holdings

  return { success: true, transactionId: data[0]?.id };
}
```

### Client Component calling a Server Action from a form

```typescript
// src/components/AddHoldingDialog.tsx
// Source: Next.js Server Actions + React Forms (official docs)

'use client';

import { useState } from 'react';
import { addHolding } from '@/server-actions/portfolio';

export function AddHoldingDialog() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: FormData) => {
    setLoading(true);
    setError(null);

    try {
      await addHolding({
        instrumentId: formData.get('instrument_id') as string,
        quantity: parseFloat(formData.get('quantity') as string),
        avgBuyPrice: parseFloat(formData.get('avg_buy_price') as string),
      });
      // Page will automatically re-render with new data after revalidatePath
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form action={handleSubmit} className="space-y-4">
      {/* form fields */}
      <button type="submit" disabled={loading}>
        {loading ? 'Adding...' : 'Add Holding'}
      </button>
      {error && <div className="text-red-500">{error}</div>}
    </form>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fetching data in `useEffect` client-side | Server Components (Server-Side Rendering) | Next.js 13 (2022) | Eliminates waterfalls, reduces client JS, improves performance and SEO. Now the default pattern. |
| Custom API route handlers for every mutation | Server Actions (`'use server'`) | Next.js 14 (2023) | Simpler code, built-in cache invalidation with `revalidatePath()`. No need to write API routes. |
| Redux or Context for all state | Client-side state only for UI (Zustand, form state) + Server-Side Rendering for data | React 16.8+ (Hooks); Next.js 13+ (RSC) | Cleaner separation: server owns data, client owns UI state. Less boilerplate. |
| REST API as the boundary between frontend and backend | Direct database calls in Server Components (RLS-protected) + Server Actions for mutations | Next.js 13+ | Fewer HTTP roundtrips, auth/RLS at the source, simpler mental model. |

**Deprecated/outdated:**
- **`getServerSideProps` and `getStaticProps`:** Replaced by Server Components (`async` render function). Still supported but less preferred.
- **Custom Redux middleware for API calls:** Replaced by Server Actions + `revalidatePath()`.
- **Storing authentication token in localStorage:** Replaced by Supabase's SSR client, which handles token refresh securely.

---

## Phase 2 Specific: Data Migration & Schema Additions

### 1. New Tables to Add

Based on the roadmap and requirements, Phase 2 adds:

**`transactions` table** (replaces the mock holdings with a ledger):
```sql
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES investment_accounts(id) ON DELETE CASCADE NOT NULL,
  instrument_id UUID REFERENCES instruments(id) ON DELETE RESTRICT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('BUY', 'SELL', 'SPLIT', 'BONUS')),
  quantity NUMERIC NOT NULL,
  price NUMERIC, -- NULL for SPLIT/BONUS
  transaction_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage transactions for their accounts" ON transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM investment_accounts WHERE id = account_id AND user_id = auth.uid())
  );
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_instrument_id ON transactions(instrument_id);
```

**`instruments` table** (ISIN + exchange master):
```sql
CREATE TABLE instruments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  isin TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE', 'NASDAQ', 'NYSE', 'OTHER')),
  display_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stocks', 'etf', 'crypto')),
  currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD')),
  price_source_symbol TEXT, -- Symbol to use when querying price APIs
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(isin, exchange)
);
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view instruments" ON instruments
  FOR SELECT TO authenticated USING (TRUE); -- Shared, read-only
CREATE INDEX idx_instruments_symbol_exchange ON instruments(symbol, exchange);
CREATE INDEX idx_instruments_isin ON instruments(isin);
```

### 2. Migration of Existing Holdings Data

**Current situation:** The schema from Phase 1 has a `holdings` table (from `schema.sql`), but it stores single snapshots of quantity and average cost, not transactions.

**For Phase 2:** You have two options:
1. **Keep the `holdings` table and create a `transactions` ledger alongside:** Write a data migration that converts each existing holding into a BUY transaction, then compute derived holdings on-the-fly.
2. **Replace the `holdings` table with computed holdings:** Drop the `holdings` table and create a view that calculates quantity and average cost from the `transactions` table.

**Recommendation:** Option 1 (keep both tables initially, add transactions) because:
- Less risky (no data destruction).
- Easier rollback.
- Phase 2 does not require splitting/bonus actions, so complex ledger math is avoided.
- Can migrate to pure-ledger model in Phase 3 if desired.

### 3. Dropping the Mock Portfolio Store

**Files to delete:**
- `src/store/usePortfolioStore.ts` (the Zustand store with mock data)
- `src/lib/mock-portfolio.ts` (mock data definitions)

**Files to update:**
- All pages and components that import from `usePortfolioStore` — convert to Server Components or fetch via Server Actions.

### 4. New Server Actions Required

```
src/server-actions/portfolio.ts:
  - addHolding(instrumentId, quantity, avgBuyPrice)
  - deleteHolding(holdingId)
  - editHolding(holdingId, quantity, avgBuyPrice)
  - addToWatchlist(instrumentId)
  - removeFromWatchlist(watchlistItemId)
  - recordSplit(holdingId, splitRatio)
  - recordBonus(holdingId, bonusRatio)
```

Each action:
1. Validates the user is authenticated.
2. Checks the account exists and belongs to the user (RLS will enforce this, but explicit check is safer).
3. Inserts or updates the appropriate row(s) in Supabase.
4. Calls `revalidatePath()` to trigger Server Component re-renders.
5. Returns `{ success: true, ... }` or throws an error.

---

## Open Questions

1. **Account scope:** Should Phase 2 assume a single account per user (simplest) or support multiple accounts?
   - **Current codebase:** The mock store has 3 hardcoded accounts (`acc_1`, `acc_2`, `acc_3`), but the UI layout already has an account switcher.
   - **Recommendation:** Phase 2 scope: assume single account (`investment_accounts` created on signup per Phase 1 trigger). The account switcher UI stays; it will work once Phase 2 queries respect `account_id`. No new logic needed.

2. **Instruments master data:** How will instruments be populated?
   - **For Phase 2:** Assume a small seed dataset (10–20 common Indian stocks, a few US stocks, crypto). Manually insert via a migration or a one-time seed script.
   - **For later phases:** Phase 4 (import) will need to match user-provided symbols to instruments by ISIN; Phase 6 (news) will need to match tickers.

3. **Derived quantity and average cost:** Should these be computed in the database (PostgreSQL view) or in application code?
   - **Database view (cleaner):** Create a view `view_holdings` that aggregates `transactions` grouped by `instrument_id`, calculates quantity as `SUM(CASE WHEN type='BUY' THEN quantity ELSE -quantity END)`, and average cost as `SUM(quantity * price) / SUM(quantity)`.
   - **Application code (more flexible):** Fetch transactions, aggregate in JavaScript, return holdings.
   - **Recommendation for Phase 2:** Compute in application code (simpler to debug, fewer DB objects). Migrate to view later if performance becomes an issue.

4. **Real-time prices vs. cached prices:** Phase 3 will add a price cache. Should Phase 2 include a placeholder for prices?
   - **Recommendation:** Phase 2 does not fetch prices. A "current price" column in the UI can remain empty or show "—" with a note "prices available after Phase 3."

5. **Middleware for auth redirection:** Phase 1 said it implemented a proxy, but I don't see a `middleware.ts` file. Does it exist, or is auth gating done in components?
   - **If middleware exists:** Verify it redirects unauthenticated users to `/login`. Phase 2 Server Components will work correctly with a middleware that enforces auth.
   - **If not:** Auth gating must happen in `getUser()` calls in Server Components, returning an error page if not authenticated. Verify this is safe (prevents rendering protected pages).
   - **Recommendation:** Check the actual middleware implementation. If missing, Phase 2 should add one using Supabase's SSR documentation.

---

## Sources

### Primary (HIGH confidence)
- **Next.js 16 Official Docs** — Server Components, Server Actions, caching, `revalidatePath()`
  - https://nextjs.org/docs/app/building-your-application/rendering/server-components
  - https://nextjs.org/docs/app/building-your-application/data-fetching/patterns
  - https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
- **Supabase Official Docs** — SSR client, RLS, TypeScript client
  - https://supabase.com/docs/guides/auth/server-side/server-side-rendering
  - https://supabase.com/docs/guides/database/postgres/row-level-security
  - https://supabase.com/docs/reference/javascript/select
- **Codebase inspection** — Phase 1 schema, existing auth setup, current component patterns

### Secondary (MEDIUM confidence)
- Supabase community discussions on schema design for transactions ledger
- Next.js community examples of Server Components + database patterns

### Tertiary (LOW confidence)
- None; no unverified sources used for critical guidance

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — Next.js 16 and Supabase SSR are stable, documented, and already in the codebase.
- **Architecture Patterns:** HIGH — Server Components + Server Actions are the current best practice for Next.js 13+.
- **Data Schema (transactions, instruments):** MEDIUM — The schema matches the roadmap research decisions (ISIN+exchange, transactions ledger), but the exact table structure for Phase 2 is not yet designed; the migration SQL is illustrative.
- **Pitfalls:** MEDIUM — Based on known Next.js + Supabase gotchas; specific project gotchas (e.g., multi-account handling) will emerge during planning.
- **Open Questions:** HIGH — These are genuine unknowns that the planner should resolve.

**Research date:** 2026-07-14  
**Valid until:** 2026-07-28 (two weeks; Next.js releases are infrequent, Supabase API is stable)

---

## Next Steps for Planning

The planner (`gsd-planner`) will use this research to create a PLAN.md with concrete tasks:

1. **Task 1:** Add migrations for `transactions` and `instruments` tables.
2. **Task 2:** Seed the `instruments` table with common stocks/crypto.
3. **Task 3:** Delete the mock portfolio store (`usePortfolioStore.ts`, `mock-portfolio.ts`).
4. **Task 4:** Convert dashboard, holdings, and watchlist pages to Server Components.
5. **Task 5:** Create Server Actions for add/edit/delete holdings and watchlist items.
6. **Task 6:** Update the research module to deep-link from real instruments (WIRE-01).
7. **Task 7:** Update the YouTube module to read real channel data (WIRE-02).

Each task will include:
- Verification steps (typecheck, runtime test where possible)
- Files modified / created
- Dependency on other tasks
