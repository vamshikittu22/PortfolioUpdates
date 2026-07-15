# Requirements: PortfolioUpdates (FolioIntel)

**Defined:** 2026-07-13
**Core Value:** The user opens the app (or gets a Telegram message) and immediately knows what's happening with *their* stocks — real holdings, real prices, real news — without digging through noise.

## v1 Requirements

Requirements for this milestone. Each maps to a roadmap phase. Cross-cutting rule for every feature: **fail loudly with a visible staleness/error state, never silently fall back to mock data — and a feature is not done until its mock module is deleted.**

### Authentication

- [ ] **AUTH-01**: User can sign up and log in with email/password via Supabase Auth (demo cookie login removed)
- [ ] **AUTH-02**: User session persists across browser refresh and is validated server-side (not just cookie presence)
- [ ] **AUTH-03**: User can log out from any page, fully clearing the session
- [ ] **AUTH-04**: Each user's portfolio data is isolated by Row-Level Security — a second user cannot read or write the first user's rows (verified by a two-user isolation test)
- [ ] **AUTH-05**: Server-side/admin operations (cron jobs) use a dedicated service-role client that is never exposed to the browser and is not overridden by a user cookie session
- [ ] **AUTH-06**: The unauthenticated `/api/settings/keys` endpoint is secured behind auth (closes existing vulnerability)

### Portfolio

- [x] **PORT-01**: User can add a holding (symbol, exchange, quantity, buy price, buy date) that persists to Supabase
- [x] **PORT-02**: User can edit and delete holdings; changes persist across refresh
- [x] **PORT-03**: User can add and remove watchlist entries that persist to Supabase
- [x] **PORT-04**: Holdings are derived from a transactions ledger (BUY/SELL entries), so quantity and average cost stay correct after partial sells
- [x] **PORT-05**: User can record a manual stock split / bonus action that adjusts derived quantity and average cost without showing a false loss
- [x] **PORT-06**: Every instrument resolves against a symbol master keyed by ISIN + exchange (NSE/BSE/US), with the correct display symbol, currency, and price-source symbol
- [x] **PORT-07**: Dashboard, holdings, watchlist, and allocation views read persisted user data (mock portfolio store removed)
- [ ] **PORT-08**: User can see each holding's individual buy lots (transaction date, quantity, and the price actually paid) separately from the derived average cost
- [ ] **PORT-09**: Editing or deleting a lot affects only that transaction — other BUY lots and all SELL/SPLIT/BONUS rows survive, and average cost recomputes from the surviving ledger

### Prices & P&L

- [x] **PRICE-01**: System fetches current prices for all held and watched tickers (NSE `.NS`, BSE `.BO`, and US) from a free source into a shared price cache
- [x] **PRICE-02**: Prices auto-refresh every 2–4 hours via a scheduled job (Supabase pg_cron hitting a secret-guarded route)
- [ ] **PRICE-03**: User can trigger an on-demand "refresh now" that fetches the current live price
- [ ] **PRICE-04**: Every price display shows an "as of" timestamp / staleness badge; a failed fetch shows stale-with-warning, never a fabricated value
- [x] **PRICE-05**: System computes per-holding and total portfolio P&L (unrealized), split into day-change and total-change
- [x] **PRICE-06**: P&L is stored in each holding's native currency (INR/USD) and the combined portfolio total is converted at a cached FX rate with the FX effect visible
- [x] **PRICE-07**: A >40% overnight price move is flagged as a possible corporate action rather than shown as a large gain/loss

### Import

- [x] **IMPT-01**: User can import holdings from a Groww export (XLSX) with the rows parsed into transactions
- [x] **IMPT-02**: User can import transactions from a Robinhood export (CSV)
- [x] **IMPT-03**: Import shows a preview with per-row validation, duplicate detection, and skip/override before committing
- [x] **IMPT-04**: Unmatched symbols during import can be mapped to the correct instrument (by ISIN/exchange) rather than silently dropped
- [x] **IMPT-05**: Re-importing the same file is idempotent (no duplicate transactions), tracked by an import batch id

### News

- [ ] **NEWS-01**: System fetches news for held and watched tickers from free sources (Finnhub for US; Google News + Indian publisher RSS for NSE/BSE)
- [ ] **NEWS-02**: News items are deduplicated (by URL and normalized-title hash) and matched to the correct ticker(s) with word-boundary / company-name rules to avoid false positives
- [ ] **NEWS-03**: User sees a news feed filtered to their portfolio, newest first, with source and timestamp
- [ ] **NEWS-04**: New matched items are summarized by AI in batches (via `@google/genai`) with a short "why it matters" for the portfolio; summaries persist and are not regenerated
- [ ] **NEWS-05**: When the AI budget is exhausted, the feed degrades to matched headlines-only rather than failing

### Alerts (Telegram)

- [ ] **ALRT-01**: User can link their Telegram account to the app via a bot `/start` handshake (chat id captured, allowlisted)
- [ ] **ALRT-02**: User can set price alerts (threshold up/down) per ticker
- [ ] **ALRT-03**: System sends a Telegram message when a price alert triggers, with a cooldown so it does not repeat every refresh
- [ ] **ALRT-04**: System sends a Telegram alert when significant news is matched to a held ticker
- [ ] **ALRT-05**: Notifications are written to an outbox and dispatched separately, so a delivery failure retries on the next run instead of being lost

### Digest

- [ ] **DGST-01**: Once per day, the system composes a portfolio snapshot (total value, day P&L, top movers) plus the day's summarized portfolio news into a single Telegram digest
- [ ] **DGST-02**: User can enable/disable the daily digest and the digest respects their linked Telegram account

### Existing Modules (wiring)

- [x] **WIRE-01**: The AI research module is deep-linked from real holdings/watchlist (open research for a held ticker), reading persisted data rather than mock
- [x] **WIRE-02**: The YouTube sentiment module remains available and reads the user's persisted channel list

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Portfolio Analytics

- **ANLY-01**: Dividend tracking (DIVIDEND transaction type — schema should already allow it)
- **ANLY-02**: Realized P&L and XIRR / time-weighted return
- **ANLY-03**: Tax-report exports (India FIFO / US lots)

### Notifications

- **NOTF-01**: WhatsApp notifications (requires Meta Business API)
- **NOTF-02**: Browser push and email digest channels
- **NOTF-03**: In-app notification center with read/unread state

### Data

- **DATA-01**: Automatic corporate-action adjustment (splits/bonuses/dividends from a feed)
- **DATA-02**: Additional broker import formats (Zerodha, Upstox, etc.)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Broker API live sync (Kite Connect, Schwab, etc.) | No free/public API for Groww or Robinhood; CSV import covers the need |
| Real-time / streaming tick prices | Free-resources-only constraint; 2–4h refresh + on-demand is acceptable |
| Paid market-data feeds | No budget; free sources (Yahoo/Finnhub/RSS) only |
| Trading / order execution | This is a tracker and intelligence tool, not a trading platform |
| Mobile native app | Web-first; responsive layout is sufficient |
| Multi-asset-class net worth (crypto, real estate, etc.) | Stocks-only focus for this milestone |
| News firehose (all market news) | Portfolio-relevant news only — noise reduction is the point |

## Traceability

Which phases cover which requirements. Populated during roadmap creation (see ROADMAP.md).

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| PORT-01 | Phase 2 | Complete |
| PORT-02 | Phase 2 | Complete (edit-holding is destructive — superseded by PORT-09) |
| PORT-03 | Phase 2 | Complete |
| PORT-04 | Phase 2 | Complete |
| PORT-05 | Phase 2 | Complete |
| PORT-06 | Phase 2 | Complete |
| PORT-07 | Phase 2 | Complete |
| PORT-08 | Phase 3.1 | Pending |
| PORT-09 | Phase 3.1 | Pending |
| WIRE-01 | Phase 2 | Complete |
| WIRE-02 | Phase 2 | Complete |
| PRICE-01 | Phase 3 | Complete |
| PRICE-02 | Phase 3 | Complete |
| PRICE-03 | Phase 3 | Pending |
| PRICE-04 | Phase 3 | Pending |
| PRICE-05 | Phase 3 | Complete |
| PRICE-06 | Phase 3 | Complete |
| PRICE-07 | Phase 3 | Complete |
| IMPT-01 | Phase 4 | Complete |
| IMPT-02 | Phase 4 | Complete |
| IMPT-03 | Phase 4 | Complete |
| IMPT-04 | Phase 4 | Complete |
| IMPT-05 | Phase 4 | Complete |
| ALRT-01 | Phase 5 | Pending |
| ALRT-02 | Phase 5 | Pending |
| ALRT-03 | Phase 5 | Pending |
| ALRT-05 | Phase 5 | Pending |
| NEWS-01 | Phase 6 | Pending |
| NEWS-02 | Phase 6 | Pending |
| NEWS-03 | Phase 6 | Pending |
| NEWS-04 | Phase 6 | Pending |
| NEWS-05 | Phase 6 | Pending |
| ALRT-04 | Phase 6 | Pending |
| DGST-01 | Phase 7 | Pending |
| DGST-02 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 39 total (note: the enumerated IDs total 39; the earlier "36" was a miscount)
- Mapped to phases: 39 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-13*
*Last updated: 2026-07-13 — traceability populated during roadmap creation*
