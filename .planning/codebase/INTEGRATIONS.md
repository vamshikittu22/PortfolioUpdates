# External Integrations

**Analysis Date:** 2026-07-13

## APIs & External Services

**AI & Analysis:**
- Google Gemini 2.5 Flash - Video transcript analysis and equity research report generation
  - SDK/Client: `@google/generative-ai` 0.24.1
  - Auth: `GEMINI_API_KEY` (env var)
  - Usage: `src/lib/gemini.ts`, `src/lib/ai-provider.ts`, `src/app/api/research/analyze/route.ts`
  - Features: Extracts ticker mentions, sentiment analysis, key themes from financial content

- Multiple LLM Provider Support (fallback system) - Pluggable AI analysis providers
  - OpenAI - GPT-4o mini (`OPENAI_API_KEY`)
    - Endpoint: `https://api.openai.com/v1/chat/completions`
  - Anthropic Claude - Sonnet 3.5 (`CLAUDE_API_KEY`)
    - Endpoint: `https://api.anthropic.com/v1/messages`
  - OpenRouter - Open source LLM access (`OPENROUTER_API_KEY`)
    - Endpoint: `https://openrouter.ai/api/v1/chat/completions`
  - Nvidia - Enterprise LLM inference (`NVIDIA_API_KEY`)
    - Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`
  - HuggingFace - Inference API (`HUGGINGFACE_API_KEY`)
    - Endpoint: `https://api-inference.huggingface.co/models/...`
  - Implementation: `src/lib/ai-provider.ts` (lines 106-208)

**Video Content:**
- YouTube Data API v3 - Channel and video metadata retrieval
  - SDK/Client: Native `fetch` via googleapis.com
  - Auth: `YOUTUBE_API_KEY` (env var)
  - Usage: `src/lib/youtube-api.ts`
  - Features: Channel resolution, video listing, statistics (views, subscriber counts)
  - Endpoints:
    - `https://www.googleapis.com/youtube/v3/channels` - Channel lookup
    - `https://www.googleapis.com/youtube/v3/playlistItems` - Video playlist
    - `https://www.googleapis.com/youtube/v3/videos` - Video stats
  - API Routes: `src/app/api/youtube/channel/route.ts`, `src/app/api/youtube/videos/route.ts`, `src/app/api/youtube/scan/route.ts`

- youtube-transcript - YouTube transcript extraction
  - SDK/Client: `youtube-transcript` npm package 1.3.1
  - Auth: None (public content)
  - Usage: `src/lib/transcript.ts`
  - Features: Fetch full transcript text from video IDs, language detection

**Financial Data:**
- Yahoo Finance - Real-time stock quotes and historical data (public, no API key)
  - Endpoint: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}`
  - Endpoint: `https://query2.finance.yahoo.com/v8/finance/chart/{symbol}`
  - Usage: `src/lib/research/yahoo-finance.ts`
  - Features: 
    - Current price, 52-week high/low, volume
    - PE ratio, PB ratio, ROE, debt-to-equity, dividend yield
    - 5-year historical monthly prices
  - Caching: 1 hour for quotes, 24 hours for chart data (via Next.js `revalidate`)
  - API Route: `src/app/api/research/analyze/route.ts` (lines 68-88)

## Data Storage

**Databases:**
- Supabase PostgreSQL - Primary database for portfolio data, authentication, and research cache
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (env vars)
  - Client: Supabase JavaScript SDK (`@supabase/supabase-js` 2.108.2)
  - Authentication: Supabase Auth with session management via cookies
  - Usage: `src/utils/supabase/server.ts`, `src/utils/supabase/client.ts`, `src/utils/supabase/middleware.ts`

**File Storage:**
- Local filesystem (server-side only) - Caching compiled research reports
  - Location: `src/lib/research/cache/` (dynamically created)
  - Format: JSON files named by ticker symbol (e.g., `HDFCBANK.json`)
  - Purpose: Caches generated research reports to avoid re-querying Gemini
  - Implementation: `src/app/api/research/analyze/route.ts` (lines 9, 31-46)

**Caching:**
- Next.js ISR (Incremental Static Regeneration) - Used for Yahoo Finance API calls
  - Configuration: `revalidate: 3600` for quotes (1 hour), `revalidate: 86400` for historical (24 hours)
  - Location: `src/lib/research/yahoo-finance.ts` (lines 55, 75)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth - OAuth + password-based authentication
  - Implementation approach: SSR-compatible auth flow
  - Session management: Cookie-based (handled via `@supabase/ssr`)
  - Middleware: `src/middleware.ts` - Refreshes session on every request
  - Callback handler: `src/app/auth/callback/route.ts` - Exchanges OAuth code for session
  - Protected routes: All dashboard routes in `src/app/(dashboard)/` require authentication

## Monitoring & Observability

**Error Tracking:**
- Console logging - Basic error handling via `console.error()` and `console.warn()`
- No external error tracking service detected

**Logs:**
- Server-side console logging in API routes
- Examples: `src/lib/gemini.ts` (line 157), `src/app/api/research/analyze/route.ts` (line 399)

## CI/CD & Deployment

**Hosting:**
- Vercel (implied via Next.js 16.2.9 optimization)
- Self-hostable via Node.js server (via `npm run start`)

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, or other CI workflow files found

## Environment Configuration

**Required env vars (public - can be exposed):**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (safe for browser)
- `NEXT_PUBLIC_ENABLE_RESEARCH_MODULE` - Feature flag for research module

**Required env vars (private - server-side only):**
- `GEMINI_API_KEY` - Google Gemini API key
- `YOUTUBE_API_KEY` - YouTube Data API v3 key

**Optional env vars (fallback AI providers):**
- `OPENAI_API_KEY` - OpenAI API key
- `CLAUDE_API_KEY` - Anthropic Claude API key
- `OPENROUTER_API_KEY` - OpenRouter API key
- `NVIDIA_API_KEY` - Nvidia API key
- `HUGGINGFACE_API_KEY` - HuggingFace API key

**Secrets location:**
- `.env.local` - File-based configuration (contains secrets)
- Note: `.env.local` is in `.gitignore` and should never be committed

## Webhooks & Callbacks

**Incoming:**
- `src/app/auth/callback/route.ts` - OAuth callback endpoint for Supabase Auth
  - Path: `/auth/callback`
  - Purpose: Exchanges authorization code for session token

**Outgoing:**
- None detected - Application is consumer of external APIs only, no webhook subscriptions to external services

## API Route Endpoints

**Research Module:**
- `POST /api/research/analyze` - Generate equity research report for a ticker using Gemini + Yahoo Finance
  - Input: `{ ticker: string }`
  - Output: `{ success: boolean, report: ResearchReport, source: 'gemini-live' | 'hybrid-fallback-mock' | 'cache' }`

**YouTube Module:**
- `POST /api/youtube/channel` - Resolve YouTube channel from URL/handle/@handle
  - Input: Channel URL or handle
  - Output: Channel metadata (name, subscriber count, uploads playlist ID)

- `GET /api/youtube/videos` - Fetch latest videos from a channel
  - Query: `?uploadsPlaylistId=...&maxResults=10`
  - Output: Video items with metadata

- `POST /api/youtube/scan` - Scan YouTube videos and analyze transcripts
  - Combines video fetching + transcript extraction

- `POST /api/youtube/analyze` - Analyze YouTube transcript with AI
  - Input: Transcript text
  - Output: Financial analysis (tickers, sentiment, themes)

**Settings Module:**
- `POST /api/settings/keys` - Manage API keys (user-provided fallback providers)
  - Input: API key configuration
  - Output: Confirmation

## Data Flow Summary

1. **Portfolio Dashboard** → Supabase (read holdings, alerts, news)
2. **YouTube Analysis** → YouTube API → Transcript extraction → Gemini/LLM → Store results
3. **Research Reports** → Yahoo Finance (live pricing) → Gemini (report generation) → Local cache
4. **Authentication** → Supabase Auth → Session cookies → Protected routes

---

*Integration audit: 2026-07-13*
