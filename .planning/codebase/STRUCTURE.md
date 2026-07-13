# Codebase Structure

**Analysis Date:** 2026-07-13

## Directory Layout

```
PortfolioUpdates/
├── src/
│   ├── app/                           # Next.js App Router pages and API routes
│   │   ├── layout.tsx                 # Root layout wrapper
│   │   ├── globals.css                # Global Tailwind CSS directives
│   │   ├── (dashboard)/               # Route group for authenticated dashboard
│   │   │   ├── layout.tsx             # Dashboard navigation sidebar + header
│   │   │   ├── page.tsx               # Dashboard home (/)
│   │   │   ├── holdings/
│   │   │   │   └── page.tsx           # Holdings detail page
│   │   │   ├── news/
│   │   │   │   └── page.tsx           # News feed page
│   │   │   ├── research/
│   │   │   │   └── page.tsx           # Stock research intelligence page
│   │   │   ├── youtube/
│   │   │   │   └── page.tsx           # YouTube analysis page
│   │   │   ├── alerts/
│   │   │   │   └── page.tsx           # Price/sentiment alerts page
│   │   │   └── settings/
│   │   │       └── page.tsx           # Account and API key settings
│   │   ├── api/                       # Server-side route handlers
│   │   │   ├── research/
│   │   │   │   └── analyze/
│   │   │   │       └── route.ts       # POST endpoint for Gemini stock research
│   │   │   ├── youtube/
│   │   │   │   ├── analyze/
│   │   │   │   │   └── route.ts       # Analyze YouTube video transcripts
│   │   │   │   ├── channel/
│   │   │   │   │   └── route.ts       # Fetch YouTube channel metadata
│   │   │   │   ├── scan/
│   │   │   │   │   └── route.ts       # Scan channel for new videos
│   │   │   │   └── videos/
│   │   │   │       └── route.ts       # Get video list for channel
│   │   │   └── settings/
│   │   │       └── keys/
│   │   │           └── route.ts       # Get/save API keys to .env.local
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.ts           # Auth callback handler
│   │   └── login/
│   │       └── page.tsx               # Login page
│   ├── components/                    # React components
│   │   ├── dashboard/
│   │   │   ├── KPICard.tsx            # Key metric card component
│   │   │   ├── HoldingsTable.tsx      # Holdings portfolio table
│   │   │   ├── WatchlistTable.tsx     # Watchlist tracking table
│   │   │   ├── NewsFeed.tsx           # News articles display
│   │   │   ├── AlertsTable.tsx        # Price/sentiment alerts table
│   │   │   └── AllocationChart.tsx    # Portfolio allocation pie chart
│   │   ├── research/                  # Research module components
│   │   │   ├── StockSearchBar.tsx     # Ticker search and autocomplete
│   │   │   ├── CompanyHeader.tsx      # Stock profile header
│   │   │   ├── OverviewTab.tsx        # Company overview section
│   │   │   ├── FinancialsTab.tsx      # Financial metrics table
│   │   │   ├── ValuationTab.tsx       # Valuation multiples section
│   │   │   ├── OwnershipRisksTab.tsx  # Ownership and red flags
│   │   │   ├── NewsTimelineTab.tsx    # News events timeline
│   │   │   ├── ScenariosTab.tsx       # Bull/Base/Bear scenarios
│   │   │   ├── SourcesTab.tsx         # Data sources and references
│   │   │   ├── ResearchScorecard.tsx  # Scoring widget
│   │   │   ├── ProsConsCard.tsx       # Pros and cons layout
│   │   │   ├── RedFlagCard.tsx        # Risk warnings display
│   │   │   ├── MetricExplainer.tsx    # Tooltip explainers
│   │   │   └── ResearchDisclaimer.tsx # Compliance disclaimer
│   │   ├── youtube/
│   │   │   ├── ChannelPanel.tsx       # Channel info sidebar
│   │   │   ├── VideoAnalysisModal.tsx # Video transcript analysis
│   │   │   └── EmptyState.tsx         # No data state
│   │   ├── ui/                        # Reusable UI primitives
│   │   │   ├── button.tsx             # Styled button
│   │   │   ├── card.tsx               # Card container
│   │   │   ├── dialog.tsx             # Modal dialog
│   │   │   ├── tabs.tsx               # Tab navigation
│   │   │   ├── select.tsx             # Dropdown select
│   │   │   ├── switch.tsx             # Toggle switch
│   │   │   └── scroll-area.tsx        # Scrollable container
│   │   └── ThemeProvider.tsx          # Theme context provider
│   ├── lib/                           # Business logic and services
│   │   ├── research/
│   │   │   ├── research-service.ts    # Search, fetch reports, handle caching
│   │   │   ├── research-types.ts      # TypeScript types for reports
│   │   │   ├── research-service.ts    # Data fetching service
│   │   │   ├── scoring-engine.ts      # Report score calculations
│   │   │   ├── stocks-list.ts         # Registered stocks database
│   │   │   ├── yahoo-finance.ts       # Yahoo Finance data fetching
│   │   │   ├── mock-research-data.ts  # Pre-compiled research reports
│   │   │   └── cache/                 # Cached JSON reports
│   │   │       └── [TICKER].json
│   │   ├── mock-portfolio.ts          # Mock holdings, watchlist, news data
│   │   ├── mock-youtube-data.ts       # Mock YouTube channel data
│   │   ├── youtube-api.ts             # YouTube Data API wrapper
│   │   ├── youtube-types.ts           # YouTube data types
│   │   ├── youtube-scraper.ts         # Channel/video scraping logic
│   │   ├── transcript.ts              # YouTube transcript handling
│   │   ├── ticker-extractor.ts        # Extract ticker symbols from text
│   │   ├── gemini.ts                  # Gemini AI setup
│   │   ├── ai-provider.ts             # AI provider abstraction
│   │   └── cn.ts                      # Class name merging utility
│   ├── store/                         # Zustand state management
│   │   ├── useAppStore.ts             # Theme, sidebar state
│   │   └── usePortfolioStore.ts       # Portfolio, holdings, accounts
│   ├── hooks/                         # React custom hooks
│   │   ├── use-settings.ts            # AI provider settings management
│   │   └── use-channels.ts            # YouTube channel state
│   └── utils/
│       ├── cn.ts                      # Tailwind class merging
│       └── supabase/
│           ├── client.ts              # Browser Supabase client
│           ├── server.ts              # Server-side Supabase client
│           └── middleware.ts          # Auth middleware
├── public/                            # Static assets (images, icons)
├── supabase/                          # Supabase config and SQL migrations
├── .planning/
│   └── codebase/                      # GSD codebase analysis docs
├── package.json                       # Dependencies and scripts
├── tsconfig.json                      # TypeScript configuration
├── tailwind.config.js                 # Tailwind CSS configuration
├── next.config.js                     # Next.js configuration
└── .env.local                         # Environment variables (secrets)
```

## Directory Purposes

**src/app:**
- Purpose: Next.js App Router structure; defines all routes, pages, and API endpoints
- Contains: Page components, layout wrappers, route handlers
- Key files: `layout.tsx` (root), `(dashboard)/layout.tsx` (dashboard nav), `api/*/route.ts` (handlers)

**src/components:**
- Purpose: Reusable React components organized by feature area
- Contains: Dashboard widgets, research tabs, YouTube components, UI primitives
- Key files: Dashboard components (KPICard, HoldingsTable), Research tabs (OverviewTab, FinancialsTab), UI components (button, card, dialog)

**src/lib:**
- Purpose: Shared business logic, data services, and type definitions
- Contains: Research service, Yahoo Finance integration, mock data, AI providers
- Key files: `research/research-service.ts` (data layer), `mock-portfolio.ts` (mock data), `youtube-scraper.ts` (YouTube logic)

**src/store:**
- Purpose: Global state management using Zustand
- Contains: App state (theme, UI), Portfolio state (accounts, holdings, news, alerts)
- Key files: `useAppStore.ts`, `usePortfolioStore.ts`

**src/hooks:**
- Purpose: Custom React hooks for reusable stateful logic
- Contains: Settings management, channel tracking, fetch hooks
- Key files: `use-settings.ts` (AI provider config), `use-channels.ts` (YouTube)

**src/utils:**
- Purpose: Utility functions and cross-cutting concerns
- Contains: Supabase clients, class utilities, middlewares
- Key files: `supabase/client.ts`, `cn.ts` (Tailwind class merging)

**public:**
- Purpose: Static assets served directly without processing
- Contains: Favicon, images, SVG icons
- Key files: `favicon.ico`

**supabase:**
- Purpose: Database configuration and migrations
- Contains: SQL schema, RLS policies
- Key files: Migration files

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root application layout
- `src/app/(dashboard)/page.tsx`: Dashboard home page
- `src/app/login/page.tsx`: Login page
- `src/app/(dashboard)/layout.tsx`: Dashboard navigation wrapper

**Configuration:**
- `package.json`: Dependencies and scripts
- `tsconfig.json`: TypeScript compiler options
- `tailwind.config.js`: Tailwind CSS theme and plugins
- `next.config.js`: Next.js runtime configuration
- `.env.local`: Environment variables (secrets)

**Core Logic:**
- `src/store/usePortfolioStore.ts`: Portfolio and account state
- `src/lib/research/research-service.ts`: Research report fetching and caching
- `src/app/api/research/analyze/route.ts`: Gemini stock analysis endpoint
- `src/app/(dashboard)/layout.tsx`: Main dashboard navigation and layout

**Styling:**
- `src/app/globals.css`: Global Tailwind directives and CSS variables
- `src/components/ui/`: Radix UI component library styled with Tailwind
- Tailwind CSS v4 configuration via `tailwind.config.js`

**Testing:**
- No test files detected; testing infrastructure not present

## Naming Conventions

**Files:**
- Page components: `page.tsx` (Next.js convention)
- API route handlers: `route.ts` (Next.js convention)
- Layout files: `layout.tsx` (Next.js convention)
- Components: PascalCase with `.tsx` extension (e.g., `HoldingsTable.tsx`)
- Services/utilities: camelCase with `.ts` extension (e.g., `research-service.ts`)
- Stores: `use*` prefix for Zustand hooks (e.g., `useAppStore.ts`)

**Directories:**
- Feature grouping: lowercase with hyphens (e.g., `src/components/dashboard`)
- Nested routes: use parentheses for route groups (e.g., `(dashboard)`)
- API routes: RESTful structure (e.g., `/api/research/analyze`, `/api/youtube/channel`)

**Functions:**
- React components: PascalCase (e.g., `HoldingsTable`, `ResearchDisclaimer`)
- Service functions: camelCase (e.g., `getResearchReport()`, `searchCompanies()`)
- Zustand actions: camelCase (e.g., `switchAccount()`, `toggleTheme()`)

**Variables:**
- Component props: PascalCase interface (e.g., `HoldingsTableProps`)
- State: camelCase (e.g., `selectedAccountId`, `isLoading`)
- Constants: UPPER_SNAKE_CASE (e.g., `MOCK_HOLDINGS`, `CACHE_DIR`)

**Types:**
- Interfaces: PascalCase with suffix `State`, `Props`, `Result` (e.g., `AccountState`, `ResearchReport`)
- Enums: PascalCase (e.g., `AIProvider`)

## Where to Add New Code

**New Feature:**
- Primary code: Create folder in `src/app/(dashboard)/[feature]/page.tsx`
- Components: Create folder in `src/components/[feature]/` and export from there
- Store state: Add to `src/store/` if global state needed, else use local useState
- Tests: Create `src/__tests__/` directory with test files

**New Component/Module:**
- Reusable UI components: `src/components/ui/` (primitives) or `src/components/[feature]/` (feature-specific)
- Layout wrapper: Place in `src/app/` or `src/app/(route-group)/` as `layout.tsx`
- Page/route: Place in `src/app/[path]/page.tsx` following Next.js convention

**New API Endpoint:**
- Create folder structure: `src/app/api/[resource]/[action]/route.ts`
- Example: `/api/youtube/analyze/route.ts` handles `POST /api/youtube/analyze`
- Use `NextResponse` for responses, handle errors with status codes

**Utilities:**
- Shared helpers: `src/utils/` (e.g., `supabase/client.ts`, `cn.ts`)
- Service logic: `src/lib/` (e.g., `research/research-service.ts`)
- Custom hooks: `src/hooks/` (e.g., `use-settings.ts`)

**Data/Mock Files:**
- Mock data: `src/lib/mock-[feature].ts` (e.g., `mock-portfolio.ts`, `mock-youtube-data.ts`)
- Types: `src/lib/[feature]-types.ts` (e.g., `research-types.ts`, `youtube-types.ts`)

## Special Directories

**src/lib/research/cache/:**
- Purpose: Runtime cache for compiled research reports
- Generated: Yes (created at runtime by API endpoint)
- Committed: No (`.gitignore` should exclude)
- Cleanup: Manual deletion of old cached reports

**src/components/ui/:**
- Purpose: Radix UI component library with Tailwind styling
- Generated: No (hand-crafted components)
- Committed: Yes (version-controlled)
- Pattern: Each component is a reusable, style-agnostic UI primitive

**src/app/(dashboard)/:**
- Purpose: Route group for authenticated dashboard pages
- Generated: No (app structure)
- Committed: Yes (route definitions)
- Pattern: Shared layout via `layout.tsx`; child routes inherit layout

**.env.local:**
- Purpose: Local environment variables for development
- Contains: API keys (Gemini, Supabase, YouTube), secrets
- Committed: No (add to `.gitignore`)
- Warning: Never commit secrets or credentials

**supabase/:**
- Purpose: Database migrations and schema management
- Generated: No (manually created migrations)
- Committed: Yes (schema history)
- Pattern: SQL migration files with timestamps
