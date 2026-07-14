# Feature Research

**Domain:** Personal stock portfolio tracker with market-news intelligence (India NSE/BSE + US markets)
**Researched:** 2026-07-13
**Confidence:** MEDIUM-HIGH (competitor feature sets verified against official product pages; CSV export format details MEDIUM/LOW — verify against real Groww/Robinhood exports during implementation)

Competitors surveyed: Ghostfolio (open source, closest architectural analog), Portfolio Performance (desktop, gold standard for correctness), Delta, Simply Wall St, INDmoney (closest market analog — India + US dual coverage), Kubera, Snowball Analytics, Sharesight.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the tool doesn't replace a spreadsheet, let alone Groww/Robinhood's own apps.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Manual add/edit/delete of holdings (ticker, qty, avg buy price, buy date, account) | Every tracker (Delta, Ghostfolio, INDmoney) starts here; without persistence the app is a demo | LOW-MED | Store as **buy transactions/lots**, not a mutable holdings snapshot — see Dependency Notes. UI already exists (HoldingsTable); wire to Supabase with RLS |
| Watchlist add/remove (persisted) | Universal; watchlist drives news matching for stocks you don't own yet | LOW | Same persistence layer as holdings; ticker + optional target price |
| Current price per holding (delayed OK) | The number users check daily; every competitor shows live/near-live | MED | Yahoo Finance free endpoints cover both `.NS`/`.BO` and US symbols. 2–4h auto-refresh + on-demand refresh matches constraint. Must show "as of" timestamp — stale data presented as fresh destroys trust |
| Per-holding unrealized P&L (₹/$ and %) | The core question: "am I up or down?" Every tracker computes qty × (current − avg cost) | LOW | Depends on prices + cost basis. Show day-change and total-change separately (universal pattern) |
| Portfolio-level totals: value, invested, total P&L, day change | KPI cards are the front door of Delta/INDmoney/Simply Wall St; dashboard shell already has them | LOW | Aggregation over holdings; currency handling below |
| Multi-currency display: INR and USD holdings, one combined total in a base currency | User holds both markets; INDmoney (the direct analog) shows INR-converted US holdings plus native USD | MED | Keep P&L **native per holding** (US stocks in USD, Indian in INR); convert only for the combined total, with user-selectable base currency (INR default). Free FX: Yahoo `USDINR=X` or exchangerate.host. Don't mix FX gain into stock gain silently — see edge cases |
| CSV import (Groww, Robinhood) | Nobody re-types 30 holdings; import is the #1 onboarding feature in Sharesight/Ghostfolio/Portfolio Performance | MED-HIGH | Groww exports **holdings XLSX** (symbol, ISIN, qty, avg price) from web; Robinhood exports **transaction-history CSV** (date, symbol, qty, price, type) via Reports & Statements (only ~1yr history). Two different shapes: snapshot vs ledger. Preview-before-commit + duplicate detection are the parts users judge |
| Ticker-matched news feed for held + watched stocks | The project's stated heartbeat; INDmoney and Simply Wall St both anchor on "news about *your* stocks" | MED | Free sources: Yahoo Finance RSS per ticker, Google News RSS queries, Economic Times/Moneycontrol RSS for India. Ticker↔article matching is the hard part (company name aliases, "HDFC Bank" vs "HDFCBANK") |
| Allocation view (by holding, by market/currency) | Already built (AllocationChart); every competitor has it | LOW | Recompute from real holdings; add India-vs-US split — high value for this user |
| Auth + per-user data isolation | Required by "could go public later"; Supabase RLS from day one per PROJECT.md | MED | Supabase Auth already scaffolded; replace demo cookie. Everything persistent depends on this |
| Price/percent alerts (threshold-based) | INDmoney, Delta, Simply Wall St all ship price alerts; alerts UI already exists on mock data | MED | Needs a scheduled job (cron) checking prices vs rules; delivery via Telegram below |

### Differentiators (Competitive Advantage)

Aligned with the core value: "know what's happening with *my* stocks without digging through noise."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-summarized, portfolio-relevance-filtered news with "why it matters" | Simply Wall St's "intelligent alerts that summarize impactful changes" is a paid flagship; doing it personalized with Gemini free tier is this app's edge | MED-HIGH | Depends on news pipeline + real holdings. Filter (is this material to a holding?) then summarize. Cache summaries — LLM per article per user doesn't scale on free tier |
| Daily digest (portfolio snapshot + top news) via Telegram | "Open the app or get a Telegram message" — no mainstream tracker does Telegram digests; common in self-hosted/DIY setups precisely because it's loved | MED | One cron job composing: total P&L, top movers, 3–5 summarized news items. Depends on prices + news + Telegram bot |
| Telegram alerts (price moves, significant news) | Push without building mobile app or paying for WhatsApp Business API; Telegram bot API is free and instant to set up | LOW-MED (bot) | Bot setup is trivial; the alert *engine* (rules, dedup, cooldowns so one volatile day ≠ 20 messages) is the real work |
| India + US in one view with native-currency P&L and FX-aware total | Delta/Ghostfolio handle multi-currency generically; INDmoney handles it but locks you into their broker ecosystem. A clean dual-market personal view is genuinely underserved | MED | Mostly falls out of doing multi-currency correctly (table stakes row) — the differentiator is doing it *well*: market-hours awareness (NSE closes 15:30 IST, US opens 19:00 IST), per-market day-change |
| Integrated research module on holdings (already built) | Click a holding → full AI research report; Simply Wall St charges for this depth | LOW (wiring) | Exists. Just link HoldingsTable rows → research page with ticker prefilled |
| YouTube channel sentiment tied to holdings (already built) | No competitor does this; unique intelligence source | LOW (wiring) | Surface "channels mentioned your holding X" in news feed/digest |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Broker API live sync (Groww/Robinhood/Plaid) | "Why do I have to import CSVs?" | No free public API for either broker; scraping breaks and violates ToS; Plaid costs money | CSV import + manual edit (already decided in PROJECT.md) |
| Real-time streaming quotes | Feels premium, competitors show flashing numbers | Free sources rate-limit hard; websocket infra for one user is waste; drives Yahoo blocks | 2–4h refresh + on-demand "refresh now" with visible timestamp |
| Full tax engine (FIFO lots, STCG/LTCG, wash sales, Form 8949 / Indian ITR) | Tax season pain is real | Two tax regimes (India + US), grandfathering rules, LIFO/FIFO elections — a product in itself; Sharesight charges precisely for this | Track buy lots so data *supports* future tax features; export CSV so user can hand it to a tax tool. Note: average cost is fine for display P&L, but India taxes equity sells FIFO — don't claim tax accuracy |
| TWR/IRR/XIRR performance analytics | Portfolio Performance/Sharesight users expect it; "is my return real?" | Requires complete, gap-free transaction + cash-flow history; wrong-by-default with snapshot imports; Portfolio Performance's own users report currency-handling errors here | Simple absolute + % P&L now; store transactions so XIRR is *possible* later (v2+) |
| Automatic corporate-action adjustment (splits/bonus auto-applied) | Unadjusted splits make P&L look catastrophically wrong | Reliable free corporate-actions feeds for NSE/BSE don't exist; auto-adjusting wrongly is worse than not adjusting | Manual "record split/bonus" action on a holding (qty ×N, avg cost ÷N) + a sanity flag when price moves >40% overnight suggesting a corporate action |
| Tracking every asset class (MF, FD, EPF, crypto, real estate) | INDmoney/Kubera do it; "one net worth number" | Each class = new data sources, valuation logic, import formats; dilutes the stocks+news core | Stocks + watchlist only. Optional manual "other assets" line item at most, later |
| News firehose (all market news) | "More news = more informed" | Directly contradicts core value (no noise); every general feed becomes ignored | Ticker-matched only, AI relevance filter, hard cap per digest |
| In-app notification center with read states, per-alert channels config | Notification systems balloon | One user, one channel (Telegram) — inbox semantics are overkill | Alerts table (exists) as history log; Telegram as the only push channel |

## Feature Dependencies

```
Supabase Auth (real login + RLS)
    └──required by──> Holdings/Watchlist persistence (manual CRUD)
                          ├──required by──> CSV import (Groww/Robinhood)
                          ├──required by──> Live prices for held tickers
                          │                     ├──required by──> P&L (per holding + portfolio)
                          │                     │                     └──requires──> FX rates (INR/USD combined total)
                          │                     └──required by──> Price alerts ──> Telegram delivery
                          └──required by──> Ticker-matched news feed
                                                └──required by──> AI summaries / relevance filter
                                                                      └──required by──> Daily digest (also needs P&L + Telegram)

Telegram bot setup ──required by──> alerts delivery, daily digest
Transaction/lot data model ──enables──> partial sells, avg cost, future tax/XIRR (v2+)
Research module (exists) ──enhanced by──> real holdings (deep-link per holding)
```

### Dependency Notes

- **Auth first:** Every persistent feature needs `user_id` + RLS. Retrofitting isolation later is the classic rewrite; PROJECT.md already mandates this.
- **Prices before news:** P&L is the daily-habit hook (user's chosen first win); news matching needs real tickers from real holdings anyway.
- **Transactions vs snapshot (key modeling decision):** Ghostfolio and Portfolio Performance model *activities* (buy/sell/dividend) and derive holdings; Delta-style quick entry edits a snapshot. Recommendation: store **buy/sell transactions** in Supabase and derive holdings + average cost. Reasons: (1) Robinhood CSV *is* transactions, (2) partial sells are impossible to represent correctly in a snapshot, (3) it keeps tax/XIRR doors open. Keep UX snapshot-like: "add holding" form creates one buy transaction behind the scenes; Groww's snapshot import creates one synthetic opening buy per holding at its avg price.
- **Digest is a composition, not a feature:** it reuses P&L, news summaries, and Telegram — schedule it last.
- **Alert engine conflicts with naive cron:** free-tier hosting (Vercel cron / Supabase cron) has invocation limits; batch all alert checks into one scheduled run, not per-alert jobs.

## Edge Cases That Matter (from competitor behavior and user complaints)

| Edge case | What competitors do | What this app should do |
|-----------|--------------------|-----------------------|
| **Stock splits / bonus issues** (very common on NSE — bonus issues are an Indian-market staple) | Simply Wall St auto-adjusts; Portfolio Performance requires manual split entry; unhandled splits are the #1 "my P&L is wrong" complaint | Manual "apply split/bonus N:M" action adjusting qty and avg cost on the holding; anomaly flag on >40% overnight price move |
| **Partial sells** | Transaction-based trackers reduce quantity, keep avg cost (average-cost method), and book realized P&L | Sell transaction reduces derived qty; avg cost unchanged (average-cost display method); realized P&L can be stored but surfaced later |
| **Average cost across multiple buys** | Universal: weighted avg = Σ(qty×price)/Σqty per holding per account | Derive from transactions; Groww import seeds it directly from their avg-price column |
| **Multi-currency cost basis** | Best practice (Portfolio Performance, Capitally): keep cost basis in the security's native currency; convert at display time; FX gain shown separately or not mixed silently | Native-currency P&L per holding; combined total converted at current FX with an "includes FX effect" tooltip. Do NOT convert each buy at historical FX (correct for tax, confusing for display, and Groww/Robinhood CSVs don't carry FX anyway) |
| **Dividends** | Full trackers (Snowball, Sharesight) track dividend income/calendar; cash dividends do NOT change cost basis | Out of MVP; data model should allow a `DIVIDEND` transaction type later. Never auto-adjust cost basis for cash dividends |
| **Same company on NSE and BSE / US ADR** (e.g., INFY vs INFY.NS) | Ticker-matching is a known pain; Simply Wall St ships a dedicated matching algorithm | Store exchange with each holding (`NSE`, `BSE`, `NASDAQ`...); map to Yahoo symbol (`.NS`/`.BO` suffix) at fetch time; treat listings as distinct holdings |
| **Duplicate import** (re-importing same CSV) | Good importers (Ghostfolio) dedupe on date+symbol+qty+price hash and preview before commit | Import preview screen with per-row dedupe/skip; idempotent re-import |
| **Market hours / stale prices** | Trackers show per-market day change and "as of" times; naive ones show US day-change of 0% all Indian daytime | Timestamp every quote; compute day-change vs correct previous close per exchange; badge "market closed" |
| **Delisted/renamed tickers** | Price fetch fails silently → silent mock fallback (current codebase bug) | Fail *visibly*: keep last known price with stale badge, never fabricate |
| **Symbol not found on import** | Best-in-class: unmatched rows flagged for manual mapping, not dropped | Import preview lists unmatched symbols with a manual Yahoo-symbol override field (ISIN→symbol lookup helps for Groww) |

## MVP Definition

### Launch With (v1)

- [ ] Supabase Auth (replace demo cookie) + RLS schema — everything depends on it
- [ ] Holdings + watchlist CRUD persisted as transactions (manual entry) — the spreadsheet replacement
- [ ] Live/delayed prices (Yahoo, `.NS`/`.BO` + US) with auto-refresh + refresh-now + visible timestamps
- [ ] Per-holding and portfolio P&L, native currency + INR-converted total
- [ ] CSV import: Groww holdings export + Robinhood transaction export, with preview/dedupe
- [ ] Ticker-matched news feed (RSS-based) for held + watched tickers

### Add After Validation (v1.x)

- [ ] AI news summaries + relevance filter — once raw feed proves ticker matching works
- [ ] Telegram bot + price alerts — once prices are reliable (alerting on flaky data = spam)
- [ ] Daily digest — once P&L, summaries, and Telegram all exist (it composes them)
- [ ] Manual split/bonus adjustment action — first time a holding splits (HDFC-family corporate actions make this near-certain for an Indian portfolio)

### Future Consideration (v2+)

- [ ] Dividend tracking + income view — needs `DIVIDEND` transaction type; defer until asked
- [ ] Realized P&L / XIRR — needs complete transaction history discipline first
- [ ] Tax-report CSV export (India FIFO / US lots) — a product in itself
- [ ] Multi-user polish (onboarding, public launch hardening) — "could go public later"

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auth + RLS | HIGH (enabler) | MEDIUM | P1 |
| Holdings/watchlist persistence (manual) | HIGH | MEDIUM | P1 |
| Live prices (both markets) | HIGH | MEDIUM | P1 |
| P&L + multi-currency totals | HIGH | LOW-MED | P1 |
| CSV import Groww/Robinhood | HIGH | MEDIUM-HIGH | P1 |
| Ticker-matched news feed | HIGH | MEDIUM | P1/P2 |
| AI summaries + "why it matters" | HIGH | MEDIUM-HIGH | P2 |
| Telegram price/news alerts | MEDIUM-HIGH | MEDIUM | P2 |
| Daily digest | HIGH | LOW (once P2 done) | P2 |
| Split/bonus manual adjustment | MEDIUM | LOW | P2 |
| Dividend tracking | MEDIUM | MEDIUM | P3 |
| XIRR/TWR, realized P&L, tax exports | MEDIUM | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Ghostfolio | Portfolio Performance | INDmoney | Simply Wall St | Our Approach |
|---------|-----------|----------------------|----------|----------------|--------------|
| Holdings model | Activities (buy/sell/dividend/fee), holdings derived | Full transaction ledger, FIFO lots | Broker-synced snapshot | Import + AI-mapped transactions | Transactions in Supabase, snapshot-style UX |
| Import | CSV/JSON/API | CSV with column mapping (users call it clunky) | Auto (own broker) | CSV + broker connect, auto split/dividend handling | Targeted parsers for exactly 2 formats (Groww XLSX/CSV, Robinhood CSV) with preview — narrower but smoother |
| Multi-currency | Yes, base-currency conversion | Yes (ECB rates), most correct but complex | INR-centric with US stocks converted | Yes | Native P&L per holding + INR combined total; skip historical-FX cost basis |
| News | None | None | Real-time market news + portfolio health report | Curated "Updates" feed per holding: earnings, dividends, valuation changes | Ticker-matched RSS + Gemini relevance filter/summary — our edge |
| Alerts | None built-in | None | Price alerts, index alerts | Daily intelligent alerts (paid) | Telegram bot: price thresholds + significant-news, with cooldowns |
| Digest | None | None | Daily portfolio health report | Weekly/daily email summaries | Daily Telegram digest: P&L + top movers + summarized news |
| Corporate actions | Manual | Manual split entry | Auto (broker data) | Auto-adjusted | Manual split/bonus action + anomaly detection flag |

## Sources

- [Ghostfolio official](https://www.ghostfol.io/en), [GitHub](https://github.com/ghostfolio/ghostfolio), [Ghostfolio review 2026](https://www.findmymoat.com/tools/ghostfolio) — activities model, import/export, allocation/X-ray (HIGH confidence)
- [Portfolio Performance](https://www.portfolio-performance.info/en/), [manual: dividends](https://help.portfolio-performance.info/en/reference/transaction/dividend/), [manual: currency](https://help.portfolio-performance.info/en/reference/file/currency/) — FIFO, multi-currency via ECB rates, manual splits; user complaints about import clunkiness (HIGH)
- [Simply Wall St portfolio features](https://simplywall.st/features/portfolio), [What's New](https://support.simplywall.st/hc/en-us/articles/7894830045199-What-s-New) — ticker-matching algorithm, auto split/dividend handling, Updates feed, intelligent alerts (HIGH)
- [INDmoney track-all-investments](https://www.indmoney.com/features/track-all-investments), [US stocks analytics](https://www.indmoney.com/blog/us-stocks/tracking-us-stocks-from-india-just-got-smarter-with-indmoney-analytics) — India+US dual coverage, price alerts, daily health report (HIGH)
- [Kubera comparison](https://www.kubera.com/blog/delta-vs-blockfolio-vs-kubera), [WallStreetZen tracker roundup](https://www.wallstreetzen.com/blog/best-stock-portfolio-tracker/), [stockanalysis.com roundup](https://stockanalysis.com/article/best-stock-portfolio-tracker/) — market landscape (MEDIUM)
- [Schwab: cost basis](https://www.schwab.com/learn/story/save-on-taxes-know-your-cost-basis), [Fidelity: cost basis](https://www.fidelity.com/learning-center/personal-finance/what-is-cost-basis), [Novel Investor: calculating cost basis](https://novelinvestor.com/calculating-cost-basis/) — FIFO vs average cost, split/dividend basis mechanics (HIGH)
- [AllInvestView multi-currency guide](https://www.allinvestview.com/articles/multi-currency-portfolio-guide/), [trackyourportfol.io multi-currency](https://trackyourportfol.io/blog/portfolio-performance-multiple-currencies) — FX attribution, base-currency conversion practices (MEDIUM)
- [BSE corporate actions PDF](https://www.bseindia.com/downloads1/PPT5_CorporateActionDividendsBonusplits.pdf), [INDmoney corporate actions](https://www.indmoney.com/blog/stocks/track-corporate-actions-on-indstocks) — Indian bonus/split mechanics, record dates (HIGH)
- [Robinhood CSV export guides](https://www.xmodulo.com/export-robinhood-transaction-data.html), [Pocket Portfolio Robinhood import](https://www.pocketportfolio.app/import/robinhood), [TradeLog Robinhood CSV](https://support.tradelogsoftware.com/hc/en-us/articles/360050771193-Importing-from-a-CSV-File-Robinhood) — CSV columns, ~1yr history limit (MEDIUM — verify with a real export)
- [Groww export tooling](https://github.com/sivunq/Export-Groww.in-Investment-Data-To-Excel-Sheet), [Portseido Groww import](https://www.portseido.com/portfolio-tracker/groww/) — Groww has no first-class transaction CSV; holdings XLSX from web app is the practical path (LOW — must verify against a real Groww account export)
- [PortfolioTrackr Telegram alerts](https://portfoliotrackr.com/blog/telegram-stock-alerts), [Indian-market Telegram bot example](https://github.com/anshumankmr/telegram-stockprice-bot) — Telegram alert patterns (MEDIUM)

---
*Feature research for: personal stock portfolio tracker (India + US) with news intelligence*
*Researched: 2026-07-13*
