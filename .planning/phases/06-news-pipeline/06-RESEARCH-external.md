# Phase 6: News Pipeline + Summarization — External API/Stack Research

**Researched:** 2026-07-17 (all endpoint claims verified LIVE this day unless marked otherwise)
**Domain:** External news sources (Finnhub, Google News RSS, Indian publisher RSS) + `@google/genai` SDK
**Confidence:** HIGH for everything live-probed; each finding is marked. Companion to `06-RESEARCH-codebase.md` (integration surface — treat as baseline truth).

## Summary

All three free news sources are alive and behave as the requirements assume, with one structural surprise that shapes the dedup design: **Google News RSS article links are Google redirect URLs** (`news.google.com/rss/articles/CBMi...`), not publisher URLs — so URL-based dedup can never match a Google News item against the same story fetched from Finnhub or a publisher feed. The normalized-title hash (NEWS-02) is therefore the *primary* cross-source dedup key, and the Google News `<title>` carries a ` - Publisher` suffix that normalization must strip. Finnhub's company-news endpoint is confirmed free-tier, **North-American-symbols-only** (its own swagger says so verbatim), which matches the requirement's US/India source split exactly. The `@google/genai` SDK is at **v2.12.0**, needs Node ≥ 20, throws `ApiError` with a numeric `.status` (429 = quota, confirmed `RESOURCE_EXHAUSTED` on the official rate-limits page), and supports strict JSON output via `config.responseMimeType: 'application/json'` + `responseSchema`/`responseJsonSchema` (confirmed on the SDK's own typedoc). Google **no longer publishes free-tier RPM/RPD numbers** in docs (moved to the AI Studio dashboard), so NEWS-05's degrade path must be budget-agnostic: detect 429 at runtime, never assume a quota number.

**Primary recommendation:** Install `@google/genai` (new, for news summarization only) alongside the legacy `@google/generative-ai` (3 existing call sites untouched — coexistence, not migration); parse RSS with `fast-xml-parser@^5` (v5 keeps the v4 `XMLParser` API); dedup on canonical-URL + normalized-title sha256 (row-hash precedent); model `gemini-2.5-flash` (same model/key/quota pool the repo already uses).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NEWS-01 | Fetch news for held+watched tickers from free sources | Finnhub company-news (US, key-gated, live-probed §1); Google News RSS search with India locale (no key, live-fetched §2); ET Markets + LiveMint RSS (live-fetched §3) |
| NEWS-02 | Dedup by URL + normalized-title hash; word-boundary matching | Google-redirect-URL finding (§2) makes title-hash the primary cross-source key; title normalization must strip ` - Publisher` suffix; sha256 via `node:crypto` (row-hash precedent) |
| NEWS-03 | Portfolio-filtered feed, newest first, source + timestamp | All three sources provide source name + RFC-822 pubDate (or unix `datetime` for Finnhub); Google News exposes publisher via `<source>` element (§2) |
| NEWS-04 | Batched AI summaries via `@google/genai`, persisted, never regenerated | SDK v2.12.0 verified (§4): `GoogleGenAI`, `ai.models.generateContent`, JSON schema output, `.text` accessor |
| NEWS-05 | AI budget exhausted → headlines-only, never fail | `ApiError.status === 429` / `RESOURCE_EXHAUSTED` confirmed (§4); free-tier numbers unpublished → detect-at-runtime design mandatory |
| ALRT-04 | Significant held-ticker news → Telegram via outbox | No external dependency beyond the above; dedupe-key shape `news_alert:{userId}:{urlHash}` already prescribed in `src/lib/alerts/evaluate.ts:102` |
</phase_requirements>

*(No CONTEXT.md exists for Phase 6 — no user constraints to carry.)*

## 1. Finnhub company-news — VERIFIED LIVE (HIGH)

**Endpoint (live-probed 2026-07-17 + Finnhub's own swagger at `https://finnhub.io/static/swagger.json`):**

```
GET https://finnhub.io/api/v1/company-news?symbol=AAPL&from=YYYY-MM-DD&to=YYYY-MM-DD&token=<your-key-here>
```

- All three query params (`symbol`, `from`, `to`) are **required**; auth is the `token` **query param** (swagger `securityDefinitions`: `apiKey`, name `token`, in `query`). A header alternative (`X-Finnhub-Token`) exists in docs; use the query param (swagger-canonical).
- **Live probe without token → HTTP 401 `{"error":"Please use an API key."}`; with a bogus token → HTTP 401 `{"error":"Invalid API key"}`.** Both are clean JSON — the "not configured"/"invalid key" honest-error paths (telegram/api.ts precedent) have exact observable shapes.
- **Free tier: yes** — swagger `freeTier: "1 year of historical news and new updates"`.
- **Coverage limit (verbatim from swagger description): "This endpoint is only available for North American companies."** NSE/BSE symbols will return nothing useful — India MUST go through Google News + publisher RSS. This exactly matches NEWS-01's source split; do not attempt Finnhub for NSE/BSE instruments.
- **Response:** JSON array of `CompanyNews` objects, fields verbatim from swagger definitions:

| Field | Type | Note |
|-------|------|------|
| `category` | string | e.g. "company news" |
| `datetime` | integer (int64) | **UNIX seconds** — multiply by 1000 for JS Date |
| `headline` | string | |
| `id` | integer | Finnhub's own id (not useful as our key) |
| `image` | string | thumbnail URL |
| `related` | string | related symbols |
| `source` | string | publisher name |
| `summary` | string | publisher-provided abstract (NOT an AI summary — do not confuse with NEWS-04's summary) |
| `url` | string | **original article URL** — real publisher URL, good for URL-dedup |

- **Rate limit:** free tier is commonly documented as 60 calls/min (MEDIUM — not in swagger; not live-verifiable without a key). Design for it: fetch symbols **sequentially** (outbox `sendSequentially` precedent), one call per US symbol per run.
- **Key provisioning (user action):** create a free account at finnhub.io → dashboard shows the API key. Classify exactly like `TELEGRAM_BOT_TOKEN`: labeled placeholder in gitignored `.env.local` (`FINNHUB_API_KEY=<your-key-here>`), unset → honest "not configured" result, live verification deferred to the checkpoint plan.

## 2. Google News RSS search — VERIFIED LIVE (HIGH; this needs NO key, so fetch-path checks belong in the fetch plan, not the checkpoint)

**URL pattern (live-fetched 2026-07-17, returned valid RSS 2.0 with fresh items):**

```
https://news.google.com/rss/search?q=<URL-encoded query>&hl=en-IN&gl=IN&ceid=IN:en
```

- India locale params: `hl=en-IN` (language), `gl=IN` (country), `ceid=IN:en` (country:language edition id). Confirmed working — channel `<language>` came back `en-IN`, items were Indian-market stories minutes old.
- Query supports quoted phrases and OR: `q=%22Infosys%22%20OR%20%22INFY%22` worked live. Quote company names to reduce false positives at the source.
- **Item shape observed live:**
  - `<title>`: `Headline text - The Economic Times` — **carries a trailing ` - <Publisher>` suffix.** Title normalization for the hash MUST strip the last ` - X` segment (or the same story from the publisher's own feed hashes differently).
  - `<link>`: `https://news.google.com/rss/articles/CBMi...?oc=5` — **a Google redirect URL, NOT the publisher URL.** Stable per-article (usable as a dedup URL within Google News) but will NEVER equal the Finnhub/publisher URL for the same story. ⇒ normalized-title hash is the primary cross-source dedup key.
  - `<guid isPermaLink="false">`: same opaque Google id.
  - `<pubDate>`: RFC-822, GMT (`Fri, 17 Jul 2026 05:25:44 GMT`) — `new Date(pubDate)` parses it.
  - `<source url="https://m.economictimes.com">The Economic Times</source>` — **publisher name + home URL are available**; use `<source>` text as the item's source, never "Google News".
  - `<description>`: HTML anchor soup — ignore (no clean abstract).
- No API key, no auth. Feed copyright states personal, non-commercial use — fine for this personal tool.
- Practical scoping: ONE request per NSE/BSE instrument per run (query = quoted company name OR symbol), fetched sequentially with a polite delay; do not fan out to dozens of parallel hits on news.google.com.

## 3. Indian publisher RSS — VERIFIED LIVE (HIGH)

Both fetched 2026-07-17, HTTP 200, valid RSS 2.0, items minutes-to-hours old:

| Feed | URL | Item shape notes |
|------|-----|------------------|
| ET Markets | `https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms` | `<title>` and `<description>` are **CDATA**; `<link>`/`<guid>` are REAL publisher article URLs; `<pubDate>` RFC-822 `+0530`; description is a clean text abstract |
| LiveMint Markets | `https://www.livemint.com/rss/markets` | Everything CDATA-wrapped (title, link, description, pubDate, guid); real publisher URLs; `<pubDate>` `+0530`; clean text abstracts |

- Both are **market-wide feeds** (not per-ticker): every item must go through the word-boundary/company-name instrument matcher (NEWS-02); items matching no portfolio instrument are dropped (the "no news firehose" out-of-scope rule).
- Publisher-feed URLs are real, so URL-dedup works between these feeds and (rarely) Finnhub; title-hash covers the Google News overlap.
- Source attribution: hardcode per feed ("ET Markets", "LiveMint") — RSS 2.0 items here carry no per-item source element.
- These feeds need no key ⇒ their fetch+parse path is **live-verifiable during the fetch-wrapper plan itself** (tsx one-off script), unlike Finnhub/Gemini.

## 4. `@google/genai` SDK — VERIFIED (HIGH except where marked)

- **Package:** `@google/genai`, latest **2.12.0** (npm registry, live-checked 2026-07-17). ESM-first with CJS `require` export; **Node ≥ 20** (repo's tsx/Node 24 is fine). This is Google's current unified SDK; the repo's existing `@google/generative-ai@^0.24.1` is the LEGACY deprecated SDK.
- **Coexistence decision (resolves codebase-research Pitfall 5):** REQUIREMENTS.md NEWS-04 names `@google/genai` explicitly → install it for the news module. The 3 legacy call sites (`src/lib/gemini.ts`, `src/lib/ai-provider.ts`, `src/app/api/research/analyze/route.ts`) keep using `@google/generative-ai` UNTOUCHED — different package names/import paths, zero conflict. Migration of legacy call sites is explicitly OUT OF SCOPE for Phase 6 (they are YouTube/research features, not news). Both SDKs share the same `GEMINI_API_KEY` value and the same underlying quota pool.
- **Auth:** `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`. ⚠️ The SDK auto-reads **`GOOGLE_API_KEY`** (not `GEMINI_API_KEY`) from env in Node — the repo's var is `GEMINI_API_KEY`, so the apiKey MUST be passed explicitly to the constructor; never rely on auto-pickup.
- **Call shape (SDK README, verified):**

```ts
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: prompt,
  config: {
    responseMimeType: 'application/json',
    responseSchema: {/* OpenAPI-subset Schema */},
    // or responseJsonSchema: {/* plain JSON Schema */} — both exist on GenerateContentConfig
    temperature: 0.2,
    maxOutputTokens: 4096,
  },
});
const text = response.text; // string | undefined — accessor concatenating first candidate's text parts
```

  `responseMimeType`/`responseSchema`/`responseJsonSchema`/`maxOutputTokens`/`temperature` all confirmed on the SDK's own `GenerateContentConfig` typedoc; `.text` accessor confirmed on `GenerateContentResponse` typedoc (returns `undefined` when no text parts — handle honestly, never assume).
- **Error/429 detection (NEWS-05's trigger):** SDK throws `ApiError` with `.name`, `.message`, and numeric `.status` (HTTP status). Official rate-limits docs confirm: exceeding limits → **`429 RESOURCE_EXHAUSTED`**. Detection rule: `error.status === 429` (plus defensive `/quota|RESOURCE_EXHAUSTED/i` message test for non-ApiError shapes). MEDIUM-confidence nuance: daily-quota 429s are not worth retrying within a run — on first 429, stop summarizing, leave remaining rows pending, report degraded.
- **Free-tier quota numbers: NOT published in docs anymore** (the rate-limits page now defers to the AI Studio dashboard). The repo's legacy comment "15 req/min" is stale/unverifiable. ⇒ Design constraint: never hardcode a quota assumption; batch to minimize calls (many headlines per call) and treat 429 as the budget signal. (LOW confidence on any specific number; HIGH confidence that 429 is the signal.)
- **Model id:** `gemini-2.5-flash` still exists (present in current official docs model tables) and is what the repo's other Gemini call sites use — same key, same quota pool, known-cheap. Newer `gemini-3.x` flash models exist (docs mention Gemini 3.5 Flash / 3.1 Flash Lite) but their free-tier availability is unverified ⇒ default to `gemini-2.5-flash` as a single named constant so a later swap is one line. (Model choice: HIGH that 2.5-flash works; MEDIUM that it remains the best free choice.)
- **Batching (NEWS-04):** one `generateContent` call per batch of ~10 headlines, with `responseSchema` = array of `{id, summary, whyItMatters, sentimentLabel, importance}` items. JSON mode + schema means the response parses deterministically or fails loudly — no regex extraction from prose.

## 5. RSS parsing — `fast-xml-parser` (HIGH for version; MEDIUM for option details)

- Latest **5.10.1** (npm registry, live-checked). Official README: "Version 5 has the same functionalities as version 4" — the `XMLParser` class API is stable:

```ts
import { XMLParser } from 'fast-xml-parser';
const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'item' });
const doc = parser.parse(xmlText); // doc.rss.channel.item: always an array via isArray
```

- **Don't hand-roll XML parsing with regex** — CDATA sections (ET/LiveMint wrap everything in CDATA), entity decoding, and attribute forms (`<source url="...">`) are exactly the edge cases a regex approach gets wrong. fast-xml-parser is zero-dependency and returns CDATA content merged as text by default.
- Pitfall to pin in TDD: a single-item channel parses to an OBJECT not an array unless `isArray` forces it — a required test case.
- Alternative considered: `rss-parser` (wraps xml2js, heavier, callback-era) — rejected; fast-xml-parser is lighter and the house style separates fetch (wrapper) from interpretation (pure function fed a string), which a plain XML→JS parser fits better.

## Don't Hand-Roll (external-facing)

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSS/XML parsing | regex over XML | `fast-xml-parser@^5` `XMLParser` | CDATA, entities, attributes, self-closing tags |
| JSON-from-LLM | prose parsing/regex extraction | `responseMimeType: 'application/json'` + `responseSchema` | schema-enforced output; parse or fail loudly |
| Quota accounting | request counters/token budgets | 429 detection (`ApiError.status === 429`) | free-tier numbers are unpublished and change; the API is the source of truth |
| Legacy SDK reuse for news | extending `src/lib/gemini.ts` | new `@google/genai` module under `src/lib/news/` | requirement names the new SDK; legacy is deprecated; keeps 3 legacy call sites untouched |

## Common Pitfalls (external)

1. **Google News link ≠ publisher URL** — URL dedup alone will double-insert the same story from Google News + a publisher feed. Title-hash (after stripping the ` - Publisher` title suffix) is the cross-source key. Both keys required, exactly as NEWS-02 states.
2. **`GOOGLE_API_KEY` auto-pickup trap** — `new GoogleGenAI()` with no args silently looks for `GOOGLE_API_KEY`, which doesn't exist in this repo → always pass `{ apiKey: process.env.GEMINI_API_KEY }` explicitly and keep the placeholder-value guard (`gemini.ts:31` precedent).
3. **Finnhub for Indian symbols** — returns empty/irrelevant data (North America only, per their own swagger). Route NSE/BSE through Google News + publisher RSS unconditionally.
4. **Unix-seconds vs ISO** — Finnhub `datetime` is unix SECONDS; RSS `pubDate` is RFC-822 (GMT for Google, +0530 for ET/LiveMint). Normalize everything to ISO-8601 UTC at parse time, before anything is stored or compared.
5. **`response.text` can be `undefined`** — e.g. a blocked/empty candidate. Treat as a per-batch honest failure (items stay pending), never `JSON.parse(undefined!)`.
6. **429 mid-run** — quota can exhaust between batches. Each batch must be independently durable: write each batch's summaries as soon as that batch succeeds, so a later 429 degrades only the remainder (NEWS-05).

## Sources

### Primary (HIGH confidence — live probes and official machine-readable specs, 2026-07-17)
- Live `curl` probes: `finnhub.io/api/v1/company-news` (401 shapes), `news.google.com/rss/search` (full RSS document), ET Markets + LiveMint feeds (full RSS documents)
- `https://finnhub.io/static/swagger.json` — company-news operation, `CompanyNews` definition, `securityDefinitions`
- npm registry: `@google/genai@2.12.0`, `fast-xml-parser@5.10.1`
- `googleapis/js-genai` README + typedoc (`GenerateContentConfig`, `GenerateContentResponse`)
- `ai.google.dev/gemini-api/docs/rate-limits` — 429 `RESOURCE_EXHAUSTED`; free-tier numbers no longer published

### Secondary (MEDIUM)
- Finnhub free-tier 60 calls/min (docs knowledge, not machine-verified); `fast-xml-parser` option details (`isArray`, CDATA defaults) — README confirms v4/v5 parity, exact behavior pinned by TDD at implementation time

## Metadata

**Confidence breakdown:** Finnhub endpoint/auth/fields HIGH (own swagger + live 401s); Google News URL/shape HIGH (live fetch); publisher feeds HIGH (live fetch); `@google/genai` API surface HIGH (own typedoc); quota numbers LOW by design (unpublished — runtime 429 detection is the contract).

**Research date:** 2026-07-17
**Valid until:** ~30 days for endpoints; re-verify `@google/genai` minor version at install time (`npm view @google/genai version`)
