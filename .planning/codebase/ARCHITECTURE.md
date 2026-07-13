# Architecture

**Analysis Date:** 2026-07-13

## Pattern Overview

**Overall:** Next.js 16 App Router with multi-layered client-server architecture

**Key Characteristics:**
- Client-server component model (`'use client'` directives for interactive UI)
- API-driven data fetching with fallback chains (cache → mock → Gemini AI)
- Zustand-based global state management for portfolio and app settings
- Modular service layer abstractions for research, YouTube, and auth
- Tailwind CSS + Radix UI component system for consistent styling

## Layers

**Presentation Layer (UI Components):**
- Purpose: Render interactive dashboard views with charts, tables, and modals
- Location: `src/components/`
- Contains: React functional components using client-side state hooks
- Depends on: Zustand stores, Radix UI, Lucide icons, Recharts
- Used by: Next.js page components in `src/app/(dashboard)/`

**Page/Route Layer:**
- Purpose: Define application routes and server-side layout structure
- Location: `src/app/` (Next.js App Router)
- Contains: Page components (`page.tsx`), layout wrappers (`layout.tsx`), auth flows
- Depends on: Components, stores, services
- Used by: Next.js router; accessed by browser navigation

**API/Backend Layer:**
- Purpose: Handle server-side request processing, AI generation, external API calls
- Location: `src/app/api/`
- Contains: Route handlers for `/api/research/analyze`, `/api/youtube/*`, `/api/settings/*`
- Depends on: Google Generative AI, Yahoo Finance API, file system (cache)
- Used by: Frontend via fetch(), client-side service functions

**State Management Layer:**
- Purpose: Centralize portfolio data, account switching, theme/UI state
- Location: `src/store/`
- Contains: Zustand stores (`useAppStore`, `usePortfolioStore`)
- Depends on: Zustand v5
- Used by: All client components via React hooks

**Business Logic/Service Layer:**
- Purpose: Abstract data fetching, transformations, and external integrations
- Location: `src/lib/`
- Contains: Research service, YouTube API integration, transcript extraction, data types
- Depends on: External APIs (Gemini, Yahoo Finance, YouTube), local cache
- Used by: API handlers, client components, hooks

**Utility/Helper Layer:**
- Purpose: Provide cross-cutting concerns and reusable helpers
- Location: `src/utils/`
- Contains: Supabase client initialization, CSS class merging (`cn`), middleware
- Depends on: Supabase, external libraries
- Used by: All layers

**Custom Hooks Layer:**
- Purpose: Encapsulate reusable client-side logic and side effects
- Location: `src/hooks/`
- Contains: `use-settings` (AI provider config), `use-channels` (YouTube channels)
- Depends on: React hooks, localStorage, API endpoints
- Used by: Page components and feature components

## Data Flow

**Portfolio Dashboard Flow:**

1. User navigates to `/` (dashboard home)
2. `src/app/(dashboard)/page.tsx` renders layout with sidebar
3. `usePortfolioStore` hook retrieves portfolio accounts and selected account
4. Component reads from store: holdings, watchlist, news, alerts
5. Data initially loaded from mock data (`src/lib/mock-portfolio.ts`)
6. Components display data using presentation components (KPICard, HoldingsTable, NewsFeed)

**Research Report Flow:**

1. User navigates to `/research` and selects a stock ticker
2. `src/app/(dashboard)/research/page.tsx` calls `getResearchReport(ticker)`
3. Service layer in `src/lib/research/research-service.ts` checks:
   - Static mock data cache (`mock-research-data.ts`) → return immediately
   - Dynamic Gemini AI via `POST /api/research/analyze` → parse JSON response
   - Fallback to hybrid mock if AI fails
4. Cached reports stored in `src/lib/research/cache/` (JSON files)
5. Response displayed in tabs: Overview, Financials, Valuation, Scenarios, etc.

**YouTube Analysis Flow:**

1. User inputs YouTube channel URL in `/youtube` section
2. Client calls `POST /api/youtube/channel` (channel metadata fetch)
3. API handler calls `youtube-scraper.ts` to extract video URLs
4. Videos analyzed for transcripts via `youtube-transcript` npm package
5. Ticker extraction and sentiment scoring via `ticker-extractor.ts`
6. Results cached and returned to frontend for visualization

**State Management:**

App state flows through Zustand stores:
- `useAppStore`: Theme (dark/light), sidebar collapsed status
- `usePortfolioStore`: Current selected account, all account holdings/news/alerts, methods to add/remove holdings

Components subscribe to stores via hooks and re-render on state changes. localStorage persists theme preference.

## Key Abstractions

**ResearchReport Type:**
- Purpose: Standardized schema for stock analysis results
- Examples: `src/lib/research/research-types.ts` (TypeScript interfaces)
- Pattern: Comprehensive financial data including fundamentals, valuation, scenarios, scores

**AccountState Type:**
- Purpose: Define portfolio account structure with holdings, watchlist, alerts
- Examples: `src/store/usePortfolioStore.ts`
- Pattern: Immutable state updates via Zustand setter functions

**Service Layer Functions:**
- Purpose: Abstract external API calls with retry/fallback logic
- Examples: `searchCompanies()`, `getResearchReport()`, `fetchYahooFinanceData()`
- Pattern: Async-first with simulated delays, error handling, caching

**UI Component Patterns:**
- Purpose: Composable, styled UI building blocks
- Examples: Button, Card, Dialog, Tabs from `src/components/ui/`
- Pattern: Radix UI headless components with Tailwind CSS styling

## Entry Points

**Main Application:**
- Location: `src/app/layout.tsx`
- Triggers: App server initialization
- Responsibilities: Root layout, ThemeProvider, global CSS, fonts

**Dashboard Layout:**
- Location: `src/app/(dashboard)/layout.tsx`
- Triggers: Navigation to `/` or any dashboard route
- Responsibilities: Sidebar navigation, top header, account switcher, responsive mobile nav, theme toggle, logout

**Dashboard Home Page:**
- Location: `src/app/(dashboard)/page.tsx`
- Triggers: Navigation to `/`
- Responsibilities: Load portfolio data from store, render KPIs, holdings table, watchlist, news feed, alerts

**Auth/Login:**
- Location: `src/app/login/page.tsx`
- Triggers: Unauthenticated access
- Responsibilities: Handle login flow, set session cookie

## Error Handling

**Strategy:** Layered error handling with user-friendly fallbacks

**Patterns:**

- **API Errors**: Route handlers catch exceptions and return `NextResponse.json({ success: false, error: message }, { status: 4xx/5xx })`
- **Research Report Failures**: Fallback chain → cache → Gemini → hybrid mock data generator if Gemini fails
- **Data Fetch Errors**: Components set error state and display error message; continue with available cached data
- **Network Errors**: Try-catch blocks in service functions; console warnings logged; UI shows "Failed to load" messages
- **Validation Errors**: Ticker validation against `REGISTERED_STOCKS` list before expensive AI calls

## Cross-Cutting Concerns

**Logging:** 
- console.warn() for non-critical issues (e.g., logout cookie deletion)
- console.error() for critical failures
- No centralized logging framework; browser console and server logs

**Validation:** 
- Ticker symbol validation against registered stocks list before AI processing
- Request JSON parsing with try-catch blocks
- TypeScript interfaces enforced at compile time

**Authentication:** 
- Cookie-based session: `foliointel-session` cookie stores user email
- Cookie cleared on logout
- Read from document.cookie in client components; fallback to 'abc@g.com'
- No persistent backend auth (currently mock implementation)

**Theming:** 
- Stored in Zustand store and localStorage
- Applied to document element via classList manipulation
- Radix UI colors and Tailwind CSS classes respect theme class
- Supports dark/light modes

**Caching:**
- File-based JSON cache for research reports in `src/lib/research/cache/`
- Zustand store for runtime state (held in memory, lost on page refresh unless localStorage sync added)
- Browser cache headers not explicitly set in API responses
- localStorage for theme, settings
