# 08-03 — Research suggestions + YouTube channels: audit, live-test, honest fixes

Audit-and-fix pass over the two user-facing "intelligence" surfaces: per-stock
research/suggestions and the YouTube followed-channels feed. Goal: separate REAL
from mock-era wiring, live-test what is testable keylessly, and apply small honest
fixes without touching sibling-owned files.

Environment facts (from `.env.local`):
- `GEMINI_API_KEY` = **SET (real)** — the AI research/analysis path is live.
- `YOUTUBE_API_KEY` = **PLACEHOLDER (dead)** — the YouTube Data API path is unusable; keyless fallbacks carry the feature.

---

## Surface 1 — Research / "suggestions for stocks in my portfolio"

### Verdict: PARTIALLY REAL — wiring + live path are real; the default view and 3 seeded tickers are mock. Now labeled honestly.

**How you reach it (REAL).** `HoldingsTable`/`WatchlistTable` rows deep-link to
`/research?ticker=SYMBOL` (Phase 2 / WIRE-01). `research/page.tsx` reads that param
on mount. So a suggestion is opened from your *real* holdings, not a fabricated list.

**The report data itself (MIXED):**
- **HDFCBANK, TATASTEEL, YESBANK → 100% MOCK.** Served straight from
  `src/lib/research/mock-research-data.ts` (1148 lines of hand-authored figures:
  fake prices, NPAs, news events with fabricated "BSE Filing" sources, etc.).
  `mock-research-data.ts` is imported by **two** places: `research-service.ts`
  (short-circuits these 3 tickers before any network call) and
  `src/app/api/research/analyze/route.ts` (seeds them into the JSON cache).
  The page's **default landing ticker is HDFCBANK**, so the first thing a user sees
  is a fully-detailed *fabricated* report — previously presented with no "sample"
  marker, under an "Auditable… Traceable Data Policy" disclaimer. This was the
  core "silently-fake data presented as real" problem.
- **Any other registered ticker → REAL-ish.** `api/research/analyze/route.ts`
  fetches **live Yahoo Finance** data (`yahoo-finance.ts`: real price, 52w range,
  PE/PB, ROE, margins, 5y monthly chart) and asks **Gemini** (real key) to compile
  the narrative, then overwrites the AI's price/valuation numbers with the live
  Yahoo figures. If Gemini fails, `generateHybridFallbackReport` returns live Yahoo
  prices wrapped in **templated/estimated** analysis (`source: hybrid-fallback-mock`,
  `reportVersion: 1.0.0-fallback`) — semi-fabricated.

### Fix applied (commit 91e2d53) — honest provenance labeling
`getResearchReport` used to discard the API's `source` field and return only the
report. It now returns `{ report, source }` (`ResearchSource` union), tagging the 3
seeded tickers `'sample'` locally and forwarding the API's own provenance otherwise.
`research/page.tsx` renders a provenance banner above the report tabs:
- `sample`/`mock-seeded` → amber "Demonstration data … not live market data."
- `hybrid-fallback-mock` → amber "Partial data … estimated/templated analysis."
- `gemini-live`/`cache` → neutral "AI-compiled from live Yahoo Finance figures … verify against primary filings."

Contained entirely to my writable files (`research-service.ts`, `research/page.tsx`).
Only caller of `getResearchReport` is the page. `npx tsc --noEmit` clean; `next build` clean.

### Gap NOT fixed (too large for a safe small fix) — real news in the News Timeline
The research **News Timeline** tab renders `report.newsAnalysis` — mock events for
the 3 seeded tickers, Gemini-generated narrative otherwise. It does **NOT** use the
Phase-6 real feed `getNewsFeed` (`src/lib/news/read.ts`). Wiring them is **not**
small/obvious because `getNewsFeed(supabase, accountId)` is server-side, RLS-scoped,
portfolio-wide (held ∪ watched) and keyed by `instrument_id`, whereas the research
tab is a client component keyed by ticker string.

Concrete fix plan (future phase):
1. Add `GET /api/research/news?ticker=SYMBOL` (server route, cookie-bound Supabase).
2. Resolve `account_id` (same lookup as `use-channels.ts`), call `getNewsFeed`,
   filter items whose `tickers` include the requested symbol.
3. In `NewsTimelineTab`, fetch that route and merge real `NewsItem`s (headline, url,
   source, published_at, sentiment) into the timeline, clearly separated from the
   AI narrative; fall back to the AI events only when the real feed is empty.

---

## Surface 2 — YouTube followed channels

### Verdict: REAL — persistence and video listing are both real and keyless. No code fix required; verified live.

**Channel persistence (REAL).** `src/hooks/use-channels.ts` persists tracked
channels to Supabase **`public.yt_channels`**, scoped by `account_id` via RLS — NOT
localStorage. `addChannel`/`toggleChannel`/`removeChannel` all write to the table;
a brand-new user with zero channels gets an honest empty list with **no demo seed**
(explicitly documented in the hook). `avatar_color` is derived, `subscriber_count`/
`video_count` are non-persisted UI cosmetics (documented, not a bug).

**Video listing (REAL, keyless — does NOT depend on the dead API key).**
`src/app/api/youtube/videos/route.ts`: when `YOUTUBE_API_KEY` is the placeholder
(our case), it uses `scrapeChannelVideos(channelId)` and falls back to
`fetchRSSVideos(channelId)` — both in `src/lib/youtube-scraper.ts`, zero keys.
`src/app/api/youtube/channel/route.ts` similarly falls back to `scrapeChannel`.
The dead `youtube-api.ts` (Data API) path is only taken when a real key exists, so
**no switch was needed** — the keyless RSS/scrape path is already the active one.

### Live verification (keyless, real network)
- **Channel resolve (scrapeChannel logic):** `@CARachanaRanade` → real
  `UCe3qdG0A_gr-sEdat5y2twQ` ("CA Rachana Phadke Ranade"); `@zerodhaonline` → real
  `UC59YUBhNLMkS2Q8NBWBGHAA` ("Zerodha"). PASS.
- **RSS feed (fetchRSSVideos logic):** `feeds/videos.xml?channel_id=UC…` returned
  **15 entries each**, with real video IDs, titles, and **same-day publish dates**
  (2026-07-19 / 2026-07-18). PASS — the followed-channels feed pulls genuine recent
  uploads with no API key.

### Residual mock (labeled, low-priority)
- `src/app/(dashboard)/youtube/page.tsx` seeds 6 hardcoded `MOCK_VIDEOS`
  (`mock-youtube-data.ts`) as the initial feed until the user clicks "Fetch Videos".
  It is labeled with a visible **"Demo Mode"** badge (flips to "Live Data" after a
  fetch), so it is honestly marked, not silently fake. Left in place: removing it
  is a larger UX change and the `YTChannel` type in that file is still imported by
  `use-channels.ts`/`ChannelPanel.tsx`. Recommendation for a later pass: default to
  the empty/prompt state instead of demo videos, since the "Affects Portfolio"
  count is computed from those mock videos.
- `POST /api/youtube/scan` is **not called by any UI** (grep: only the route file +
  planning docs). It is a dead legacy endpoint that imports sibling-owned
  `transcript.ts`/`gemini.ts`; left untouched.

---

## Live-test log
| Check | Result |
|---|---|
| `@handle` → channel_id resolve (keyless scrape) | PASS (2 finance channels, real IDs) |
| YouTube RSS video fetch (keyless) | PASS (15 real same-day videos per channel) |
| `YOUTUBE_API_KEY` status | PLACEHOLDER (dead) — keyless path active & working |
| `GEMINI_API_KEY` status | SET (real) — research AI path live |
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run build` route table | PASS — 25/25 routes; `/research` + `/youtube` static, all api routes present |

## Commits
- `91e2d53` fix(research): label report data provenance honestly (`research-service.ts`, `research/page.tsx`)
- (this summary) committed alone.

## Files inspected (read-only, not changed)
`api/research/analyze/route.ts`, `yahoo-finance.ts`, `mock-research-data.ts`,
`stocks-list.ts`, `NewsTimelineTab.tsx`, `ResearchDisclaimer.tsx`, `news/read.ts`,
`youtube-api.ts`, `youtube-scraper.ts`, `youtube-types.ts`, `use-channels.ts`,
`youtube/page.tsx`, `mock-youtube-data.ts`, `api/youtube/{channel,videos,scan}/route.ts`.
