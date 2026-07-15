# Phase 4: CSV Import - Research

**Researched:** 2026-07-15
**Domain:** Broker file parsing (Groww XLSX / Robinhood CSV) → transactions-ledger import with preview, symbol mapping, and idempotency
**Confidence:** MEDIUM-HIGH overall (stack + architecture HIGH; Robinhood layout MEDIUM; Groww exact layout LOW-MEDIUM, mitigated by prescribed header-scan parsing + real-file fixture)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Import flow & entry point**
- **Single progressive page, not a wizard** — dropping/choosing a file reveals the preview below it, with the commit action at the bottom. Everything visible at once, no gated steps.
- **After a successful commit: result summary screen** — stays in the import flow showing counts (imported / skipped / duplicates) with a link to Holdings. Do NOT auto-redirect; the audit trail of what just happened matters. Imported holdings must show live P&L when the user follows the link (success criterion 4).

**Preview & row control**
- **Compact rows with expandable detail** — key fields visible per row (symbol, type, quantity, status badge); clicking a row expands full parsed fields and any validation messages.
- **Bulk-only skip/override controls** — category-level toggles (e.g., "import valid rows", "skip duplicates", "import duplicates anyway"), NOT per-row checkboxes. IMPT-03's skip/override operates at category granularity.

**Symbol mapping**
- **Multi-exchange ambiguity auto-resolves by broker** — a symbol matching instruments on multiple exchanges (e.g., INFY on both NSE and NYSE) is auto-picked using the source broker: Groww implies Indian exchanges (NSE/BSE), Robinhood implies US exchanges. The auto-pick is shown in the preview and is overridable. Only truly unmatched symbols go through the mapping UI.

**Duplicate & re-import behavior**
- User delegated all four sub-decisions to Claude (see Claude's Discretion). Hard requirement regardless of choices: re-importing the same file is idempotent via an import batch id (IMPT-05), and nothing is ever silently dropped (IMPT-04).

### Claude's Discretion
- **Entry point** — dedicated /import page vs dialog from Holdings; pick based on how much room the preview/mapping needs and existing app patterns.
- **Broker detection** — auto-detect from file (extension + headers) vs explicit broker pick before upload; pick based on how reliably Groww XLSX and Robinhood CSV can be distinguished.
- **Commit policy** — partial commit (import good rows, report skipped) vs all-or-nothing; pick the safer default for a transactions ledger.
- **Preview defaults** — which rows are pre-selected for import vs pre-set to skip when the preview loads.
- **Mapping placement** — dedicated "resolve symbols" section (one entry per unique unmatched symbol) vs inline per-row pickers.
- **New-instrument creation** — whether the user can add a missing instrument (ticker, ISIN, exchange, currency) during import, or only map to existing symbol-master entries; either way unmatched rows must be reported, never silently dropped.
- **Mapping persistence** — whether resolved mappings (broker symbol → instrument) are remembered and auto-applied on future imports.
- **Duplicate rule** — row-level field match against existing transactions vs file-level (hash/batch) only.
- **Same-file re-upload experience** — short-circuit "already imported" banner vs normal preview with all rows flagged duplicate.
- **Duplicate comparison scope** — whether manually-entered transactions count as duplicate candidates or only previously imported rows.
- **Import history UI** — whether past batches (date, broker, file, counts) surface in the UI this phase, or batch id stays internal-only.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| IMPT-01 | User can import holdings from a Groww export (XLSX) with the rows parsed into transactions | Groww layout findings + header-scan parser pattern; SheetJS 0.20.3 (official CDN tarball); snapshot-holding → synthetic BUY modeling (see Pattern 3) |
| IMPT-02 | User can import transactions from a Robinhood export (CSV) | Robinhood activity-report layout (columns, Trans Codes, money/date quirks) verified by two independent sources; PapaParse header-driven parsing |
| IMPT-03 | Import shows a preview with per-row validation, duplicate detection, and skip/override before committing | Two-action flow (previewImport / commitImport); row-status categories + bulk toggles; duplicate detection design (row hash + field match) |
| IMPT-04 | Unmatched symbols during import can be mapped to the correct instrument (by ISIN/exchange) rather than silently dropped | Instrument matching pipeline (ISIN-first for Groww, symbol+US-exchange for Robinhood); mapping section; `find_or_create_instrument` SECURITY DEFINER RPC to add missing instruments without breaking Phase 2's RLS discipline |
| IMPT-05 | Re-importing the same file is idempotent (no duplicate transactions), tracked by an import batch id | `import_batches` table + `transactions.import_batch_id` + deterministic `import_row_hash` with partial UNIQUE index as DB backstop; file-hash detection banner |
</phase_requirements>

## Summary

Phase 4 is two pure parsers, one matching/dedup pipeline, one small schema addition, and one progressive page — most of the machinery this phase needs (transactions ledger, instrument master, Server Action conventions, price refresh) already exists from Phases 2–3. The genuinely new decisions are (a) which XLSX/CSV libraries to use, (b) how the file travels (Server Action FormData both for preview and commit), and (c) how idempotency is enforced at the database level rather than by application politeness.

The two broker files are structurally different in kind, not just format: a **Robinhood activity report is a true transaction log** (Buy/Sell/SPL rows with dates and prices — maps 1:1 onto the ledger), while a **Groww holdings statement is a point-in-time snapshot** (instrument, quantity, average buy price — no dates, no individual lots). IMPT-01's "rows parsed into transactions" therefore means one *synthetic opening BUY per Groww row* at the stated average price. This preserves cost basis exactly through `deriveHoldings` (avg price × qty in → same avgCost out) and must be labeled honestly in `notes`. This distinction drives the duplicate rules: Robinhood rows dedupe by row identity; Groww rows must flag "instrument already held" because a newer snapshot of the same portfolio is *not* the same file and would silently double positions.

The riskiest unknown is the exact cell layout of the Groww XLSX (title block above headers, exact header spellings) — no authoritative public sample exists. The mitigation is structural, not informational: the parser must *scan* for the header row by recognizable column names ("ISIN" + a quantity-like header), read columns by name not position, and fail loudly with an "unrecognized format" error showing what it saw. The plan must include a fixture step where the user's real Groww export (and real Robinhood export) are added as test fixtures before UAT — consistent with this project's never-fabricate discipline.

**Primary recommendation:** Parse server-side in two Server Actions (`previewImport`, `commitImport`) using SheetJS 0.20.3 from the official CDN tarball (npm's `xlsx` is frozen at 0.18.5 with known CVEs) and PapaParse 5.5.x; enforce idempotency with a deterministic per-row SHA-256 hash and a partial unique index on `transactions(account_id, import_row_hash)`, with `import_batches` recording the audit trail.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xlsx` (SheetJS CE) | **0.20.3 from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`** | Parse Groww XLSX server-side | De-facto standard XLSX reader; handles messy real-world sheets (merged title cells, mixed types). **Do NOT `npm i xlsx` from the registry** — the npm package is abandoned at 0.18.5 (last publish 2022) and carries known CVEs (prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363) fixed only in the CDN-distributed versions. Verified live: 0.20.3 tarball is the latest on cdn.sheetjs.com (0.20.4+/0.21.x return 404). |
| `papaparse` | ^5.5.4 | Parse Robinhood CSV server-side | Battle-tested CSV parser; `header: true` gives name-keyed rows (required — Robinhood has at least two column-count variants); handles quoted fields containing commas (Description column has them). Latest 5.5.4 published 2026-06-19 (verified npm registry). |
| `@types/papaparse` | ^5.5.2 | TS types for papaparse | papaparse ships no types. |
| `node:crypto` | built-in | SHA-256 file hash + row hashes | No dependency needed; `createHash('sha256')` on the uploaded bytes. |

### Supporting (already in project — reuse, do not add)

| Existing | Where | Use In This Phase |
|----------|-------|-------------------|
| `requireAuthedContext` pattern | `src/server-actions/portfolio.ts` | Both import actions copy this exact auth + accountId pattern (cookie-bound client, never admin) |
| `searchInstrumentsAction` | `src/server-actions/portfolio.ts` | The mapping UI's instrument picker — reuse as-is |
| `deriveHoldings` / `getHoldings` | `src/lib/portfolio/`, `src/lib/supabase/portfolio.ts` | Imported transactions flow through unchanged; nothing new to build for P&L |
| `refreshPricesNow` | `src/server-actions/prices.ts` | Fire after successful commit so newly imported instruments get priced (success criterion 4) |
| Radix dialogs/tabs, Tailwind glass-card styles | `src/components/` | Preview table + mapping section follow existing component idioms |
| `tsx` + `node:assert/strict` test scripts | `scripts/*.ts` | `scripts/import-parse-test.ts` + npm script `test:import-parse` — same pattern as `test:price-pnl` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SheetJS 0.20.3 (CDN tarball) | `exceljs` 4.4.0 | On npm proper, but effectively unmaintained since 2023, much heavier, and worse at tolerating odd layouts. Only pick if the CDN-tarball install is unacceptable. |
| SheetJS | `read-excel-file` 9.3.1 | Actively maintained (July 2026) but schema-first API fights the "scan for the header row" requirement. |
| PapaParse | hand-rolled `String.split` | Forbidden — see Don't Hand-Roll. |
| Server-side parsing | client-side parsing (xlsx+papaparse in browser) | Avoids body-size limits but the server must re-validate everything anyway; two parser deployment targets; violates "server is the trust boundary". Rejected. |

**Installation:**
```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz papaparse
npm install -D @types/papaparse
```
(The tarball URL is pinned in package.json as the `xlsx` dependency — this is SheetJS's officially documented install method.)

## Broker File Formats (the phase's central facts)

### Robinhood activity report CSV (IMPT-02) — confidence: MEDIUM (two independent sources agree)

Downloaded from robinhood.com → Account → Reports and statements → Activity reports (takes a while to generate). Header:

```
"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"
```

An 11-column variant with `Account Type` and `Suppressed` also exists in the wild → **parse by header name, never by position.**

Parsing facts:
- **Dates:** `M/D/YYYY` (e.g. `9/18/2023`) → convert to ISO `YYYY-MM-DD`.
- **Money:** `$` prefixes, thousands commas, parentheses for negatives — `($43.64)` is a debit. Strip/normalize explicitly; a parse failure is a row validation error, never a silent `0` (project discipline).
- **Quantity:** fractional shares to 6 decimal places. `SPL` rows are logged to only 4 dp (known Robinhood quirk).
- **Blank fields:** dividend rows (`CDIV`) have empty Quantity/Price with only Amount.
- **Footer:** exports commonly end with a disclaimer text row — filter any row whose `Activity Date` doesn't parse as a date. (LOW confidence on exact footer shape; header-driven row validation makes it moot.)
- **No ISIN anywhere.** Only ticker (`Instrument`) + free-text `Description`. Symbol matching is ticker → instruments where exchange ∈ {NASDAQ, NYSE, OTHER-with-USD} per the locked broker-implies-exchange decision.

**Trans Code mapping (prescriptive):**

| Trans Code | Meaning | This app |
|------------|---------|----------|
| `Buy` | stock purchase (incl. dividend reinvestment) | → `BUY` |
| `Sell` | stock sale | → `SELL` |
| `SPL` | stock split shares received | → `SPLIT` (price null, quantity = shares received) |
| `CDIV` | cash dividend | skip + report ("dividends not supported until v2 ANLY-01") |
| `SPR` | reverse split | skip + report (would need quantity *reduction* — no ledger support; flag in preview) |
| `CONV`, `SXCH`, `MRGS` | conversion / exchange / merger | skip + report (corporate actions, v2 DATA-01) |
| `OEXP`, `OASGN`, `BTO/STC`-style option rows | options | skip + report (stocks/ETF only) |
| `ACH`, `INT`, `DFEE`, `GOLD`, `MRGN`, anything else | cash movements / fees | skip + report |

"Skip + report" means the row appears in the preview under an "unsupported type" category with a count — IMPT-04's *nothing silently dropped* applies to these too.

### Groww holdings statement XLSX (IMPT-01) — confidence: LOW-MEDIUM on exact layout, HIGH on data content

Downloaded from Groww app/web → Profile → Reports → **Stocks → Holdings statement** (XLSX). No authoritative public sample of the exact cell grid was found. What is corroborated:

- Groww's own API holdings objects carry `isin`, `trading_symbol`, `quantity`, `average_price` (HIGH — official Groww API docs), and the XLSX statement is understood to expose the same data as columns approximately: **Stock Name, ISIN, Quantity, Average buy price, Buy value, Closing price, Closing value, Unrealised P&L** (LOW-MEDIUM — community knowledge, no verified sample).
- The sheet has a **title/metadata block above the header row** (statement title, holder name, "as on DD-MM-YYYY" date) and possibly a totals row at the bottom (LOW).

**Prescribed mitigation (this is the design, not a workaround):**
1. Parse with `XLSX.read(bytes)` → `sheet_to_json(ws, { header: 1 })` (array-of-arrays), then **scan the first ~30 rows for the header row**: the row containing a cell matching `/^isin$/i` AND a cell matching `/quant/i`. Column indices come from that row's cell texts (normalize: trim, lowercase, collapse spaces).
2. Read data rows until the first row with no valid ISIN (`/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/`) — this drops totals/footer rows naturally. Mutual-fund holdings statements (`INF...` ISINs) are still valid ISINs; filter to equity by matching against the instruments master, and report non-equity rows as unsupported rather than erroring.
3. If no header row is found: **fail loudly** — error names the sheet and echoes the first rows' cell texts so the user (and the developer) sees what the file actually contains. Never guess.
4. Extract the "as on" statement date from the title block if present (scan for a `DD-MM-YYYY` / `DD MMM YYYY` pattern); it becomes the synthetic BUY `transaction_date`, falling back to today with the fallback stated in the preview.
5. **Plan must include a fixtures task:** user drops a real Groww export and real Robinhood export into `scripts/fixtures/` (gitignore if they contain personal data; a sanitized copy checked in), and `test:import-parse` runs the parsers against them plus synthetic edge-case fixtures. Layout confidence goes HIGH at that moment, before any UI work depends on it.

**Snapshot semantics:** each Groww row becomes ONE synthetic `BUY` (quantity, price = average buy price, date = statement date). Cost basis is preserved exactly (`deriveHoldings` returns the same avgCost). `notes` must say e.g. `Imported from Groww holdings statement (opening position; avg-cost snapshot)` — honest about not being real lot history.

## Architecture Patterns

### Recommended Project Structure

```
src/lib/import/
├── types.ts               # ParsedRow, RowStatus, ImportPreview, CommitChoices, ImportResult
├── detect-broker.ts       # pure: bytes+filename → 'groww' | 'robinhood' | 'unknown'
├── normalize.ts           # pure: money-string, M/D/YYYY + DD-MM-YYYY dates, quantity parsing
├── parse-groww.ts         # pure: ArrayBuffer → ParsedRow[] (header-scan; throws honest errors)
├── parse-robinhood.ts     # pure: string → ParsedRow[] (papaparse; trans-code mapping)
├── row-hash.ts            # pure: deterministic sha256 row identity (with occurrence index)
├── match-instruments.ts   # pure given (rows, instruments, savedMappings): attach instrument or mark unmatched
└── detect-duplicates.ts   # pure given (rows, existing txn digests): mark duplicates
src/server-actions/import.ts   # previewImport(formData), commitImport(formData) — requireAuthedContext pattern
src/app/(dashboard)/import/page.tsx        # Server Component shell (auth, title)
src/components/import/
├── ImportPage.tsx         # 'use client' — owns the progressive state machine (file → preview → result)
├── ImportDropzone.tsx     # file input + drag-drop
├── PreviewTable.tsx       # compact rows, expandable detail, category chips + bulk toggles
├── SymbolMappingSection.tsx  # one entry per unique unmatched broker symbol; search + create-new form
└── ImportSummary.tsx      # result screen: imported/skipped/duplicate counts + link to /holdings
supabase/migrations/XXXX_import_batches.sql
scripts/import-parse-test.ts   # node:assert/strict against fixtures (npm run test:import-parse)
```

All of `src/lib/import/*` is pure (zero I/O) — same discipline as `derive-holdings.ts` and `pnl-calculator.ts`, and what makes `test:import-parse` possible without a DB.

### Pattern 1: Two Server Actions, file re-sent on commit (trust boundary stays server-side)

**What:** `previewImport(formData)` receives the `File`, parses, matches, dedupes, and returns the full preview JSON (rows with statuses, categories, detected broker, file hash, prior-batch banner info). The client renders it and collects *choices only* (bulk toggles + symbol mappings). `commitImport(formData)` receives the **same file again** plus a JSON `choices` field, re-parses, re-validates, applies choices, and inserts. Parsing is deterministic, so both runs agree; the server never trusts client-supplied row data.

**When to use:** always here — files are small (Groww XLSX tens of KB; Robinhood CSV usually well under 1MB), and this avoids both a staging table (serverless-unsafe in-memory state) and trusting the client's parsed rows.

**Config prerequisite:** Server Action body limit is 1MB by default. Bump it in `next.config.ts` (verified against this exact Next.js 16.2.9's bundled docs — still under `experimental`):

```ts
// next.config.ts — verified: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md
const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
};
```

**File handling in the action (standard Web API, works in Node runtime):**
```ts
'use server';
export async function previewImport(formData: FormData): Promise<ImportPreview> {
  const { supabase, accountId } = await requireAuthedContext();
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'No file received' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  // detect broker → parse → match → dedupe → return preview
}
```

### Pattern 2: Idempotency = deterministic row hash + partial unique index (DB is the backstop)

**What:** every imported transaction stores `import_batch_id` and `import_row_hash`. The row hash is computed from *normalized source content*, not DB ids:

```
sha256(broker | isin-or-symbol | txnType | quantity(normalized string) | price(normalized string) | date(ISO) | occurrenceIndex)
```

`occurrenceIndex` is the 1-based count of identical tuples *within the same file* — a real export can legitimately contain two identical trades on the same day; the index lets both import while keeping re-imports exactly idempotent (1st maps to 1st, 2nd to 2nd).

**Schema (new migration):**
```sql
CREATE TABLE public.import_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
  broker TEXT NOT NULL CHECK (broker IN ('groww', 'robinhood')),
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,          -- sha256 hex; detection/banner only, deliberately NOT unique
  row_count INT NOT NULL,
  imported_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- RLS: same account-ownership pattern as transactions (SELECT/INSERT/UPDATE via investment_accounts.user_id = auth.uid())

ALTER TABLE public.transactions
  ADD COLUMN import_batch_id UUID REFERENCES public.import_batches(id) ON DELETE SET NULL,
  ADD COLUMN import_row_hash TEXT;

CREATE UNIQUE INDEX uniq_transactions_import_row_hash
  ON public.transactions(account_id, import_row_hash)
  WHERE import_row_hash IS NOT NULL;   -- manual transactions (hash NULL) unaffected
```

**Why `file_hash` is NOT unique:** enforcement lives at the row level, where duplication actually matters. A unique file hash would break on the orphan-batch edge case (batch row written, transaction insert failed) and adds nothing the row constraint doesn't already guarantee. The file hash powers the "this exact file was imported on DATE" banner.

**Commit write order (partial-commit policy, atomic write):** insert the `import_batches` row → single bulk `.insert(rows[])` of all committed transactions (one PostgREST statement = atomic — all rows or none) → update batch counts. If the transactions insert fails, delete the batch row (compensation) and return the error. Use plain `.insert`, NOT upsert-ignore-duplicates: the preview already decided what to import; if the DB constraint fires anyway it is a real race/logic error the user must see, not silently swallow.

### Pattern 3: Instrument matching pipeline (IMPT-04) with a controlled create path

**Matching order (per row):**
1. **Groww:** ISIN exact match against `instruments.isin`. Multiple rows (e.g., same ISIN on NSE and BSE) → auto-pick NSE (broker preference, locked decision), shown + overridable.
2. **Robinhood:** ticker match against `instruments.symbol` filtered to US exchanges (NASDAQ/NYSE, currency USD). Multi-match → auto-pick shown + overridable.
3. Saved mapping (`symbol_mappings`, below) applied before 1–2 short-circuits the search on re-imports.
4. No match → row goes to the "Resolve symbols" section (one entry per unique unmatched broker symbol; resolving one fixes all its rows).

**Creating a missing instrument — the RLS collision the planner must respect:** `instruments` is a shared reference table whose migration explicitly forbids adding a permissive write policy (writes are service-role only, by design). Phase 2's discipline also forbids Server Actions using the admin client. The clean path that violates neither: a **`SECURITY DEFINER` Postgres function** in this phase's migration, `find_or_create_instrument(p_isin, p_symbol, p_exchange, p_display_name, p_currency)`, that validates inputs (ISIN regex, exchange/currency against the existing CHECK lists), derives `price_source_symbol` deterministically (NSE → `SYMBOL.NS`, BSE → `SYMBOL.BO`, US → `SYMBOL` — matches the seed data and Phase 3's Yahoo conventions), inserts with `ON CONFLICT (isin, exchange) DO NOTHING`, and returns the instrument id. `GRANT EXECUTE TO authenticated`. This is a controlled write path, not a permissive policy — the table's RLS posture stays closed.

- Groww unmatched rows can prefill the whole create form (ISIN comes from the file).
- Robinhood provides **no ISIN** — the create form requires the user to enter it (they can look it up). **Never fabricate a placeholder ISIN** — instrument identity is the project's hardest-to-reverse decision.

**Mapping persistence (recommended: yes):** small `symbol_mappings` table — `(account_id, broker, broker_symbol) UNIQUE → instrument_id`, standard account-ownership RLS. Written on commit for every user-resolved mapping; read during preview step 3. Cheap, and makes re-imports zero-friction.

### Pattern 4: Duplicate detection (Claude's-discretion sub-decisions, resolved)

| Decision | Recommendation | Why |
|----------|----------------|-----|
| Duplicate rule | **Both** row-level and file-level. Row-level: candidate row hash ∈ existing `import_row_hash` set (indexed) OR field-match (instrument_id, type, quantity, price, date) against manual transactions. File-level: `file_hash` match → banner. | Row hash catches re-imports and overlapping date-range exports; field match catches "user already typed this in by hand". |
| Comparison scope | Manual transactions **are** duplicate candidates (field match). | The Groww snapshot double-count risk: user manually added RELIANCE in Phase 2, then imports a Groww statement containing the same position. |
| Groww-specific rule | A Groww row whose instrument already has ANY transactions in this account is flagged `duplicate ("already held")`, default **skip**. | A snapshot import onto an existing position double-counts even when no field matches exactly (newer statement = different qty/avg). Safest default; override toggle exists. |
| Same-file re-upload | Banner ("this exact file was imported on DATE — batch counts") **and** normal preview with every row flagged duplicate. | Locked requirement says nothing silently dropped; user can still inspect and override. |
| Preview defaults | valid → import; duplicate → skip; invalid → excluded (not importable, only fixable at source); unmatched → excluded until mapped (then valid); unsupported type → skip (visible category). | Safe defaults; every category count visible; bulk toggles flip duplicate/unsupported categories per the locked bulk-only decision. |

### Pattern 5: Post-commit price refresh (success criterion 4)

After a successful commit, newly created/imported instruments have no `price_cache` rows — Holdings would honestly show `pending`, which technically fails "imported holdings immediately reflect live P&L". Prescription: on commit success, the client fires the existing `refreshPricesNow()` Server Action (03-04; already auth-gated, already scoped to held+watchlisted instruments, already calls `revalidatePath('/holdings')`) in the background while the result summary renders. Holdings shows real prices by the time the user clicks through; if a fetch fails, the StalenessBadge machinery shows the honest error state. Do not build any new pricing code.

### Anti-Patterns to Avoid

- **Positional column access** (`row[3]` or Excel `D12`): both brokers have layout variants; both parsers must be header-name-driven with explicit normalization.
- **Coercing unparseable money/quantity to 0:** a `$--` or blank cell is a row validation error surfaced in the preview — fabricating 0 into a transactions ledger is this project's cardinal sin.
- **Client-parsed rows as commit payload:** the commit action must derive rows from the file itself (re-parse), or a tampered/buggy client writes arbitrary ledger rows.
- **Upsert-ignore-duplicates as the primary dedup mechanism:** it hides information (which rows were dropped) — the preview must do dedup *reporting*; the unique index is only the backstop.
- **A `holdings`-style snapshot table for imports:** rows become `transactions` and nothing else; `deriveHoldings` stays the single source of truth.
- **Admin client in import Server Actions:** Phase 2 discipline. The only privileged operation (instrument creation) goes through the SECURITY DEFINER RPC.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XLSX parsing | zip + XML reader | SheetJS 0.20.3 (CDN tarball) | XLSX is a zip of XML with shared-string tables, merged cells, 1900/1904 date systems — years of edge cases |
| CSV parsing | `text.split(',')` | PapaParse | Robinhood `Description` fields contain commas inside quotes; footer rows; BOM handling |
| File identity | mtime/filename comparison | `node:crypto` sha256 of bytes | Filename changes on re-download (`(1).csv`); content hash is the only stable identity |
| Transactional multi-row insert | per-row inserts in a loop | single PostgREST bulk `.insert(rows[])` | One statement = atomic; a loop half-commits on failure |
| Instrument search UI | new picker | existing `searchInstrumentsAction` + dialog idioms | Already built, already RLS-correct (PORT-06) |
| Row-status accounting | ad-hoc booleans | one `RowStatus` union (`valid \| invalid \| duplicate \| unmatched \| unsupported`) driving categories, toggles, counts, and the summary | Preview, commit filtering, and audit counts all derive from the same field — no drift |

**Key insight:** every "simple" broker file has an adversarial long tail (fractional shares, parenthesized negatives, disclaimer footers, merged title cells, column variants). The parsers should be thin adapters over hardened libraries, with all project-specific logic in pure, fixture-tested functions.

## Common Pitfalls

### Pitfall 1: Treating the Groww statement as a transaction log
**What goes wrong:** importer invents per-lot BUY dates/prices it doesn't have, or imports a second (newer) snapshot on top of the first, doubling every position.
**Why it happens:** the file *looks* like transactions (one row per stock with a price).
**How to avoid:** synthetic-opening-BUY modeling with honest `notes`; "already held" duplicate flag defaulting to skip; statement-date extraction with a visible fallback.
**Warning signs:** any Groww-parsed row with a date not traceable to the statement header; quantity doubling after a second import in testing.

### Pitfall 2: npm `xlsx` installed from the registry
**What goes wrong:** `npm i xlsx` silently delivers 0.18.5 (2022) with two public CVEs; `npm audit` flags it forever and the bugs are real (ReDoS on crafted files — user-uploaded files are exactly the threat model).
**How to avoid:** pin the CDN tarball URL in package.json; verify `npm ls xlsx` shows 0.20.3.
**Warning signs:** `xlsx@0.18.5` anywhere in the lockfile.

### Pitfall 3: Server Action 1MB body limit
**What goes wrong:** a multi-year Robinhood CSV over 1MB makes the action fail with an opaque body-size error, and (worse) commit re-sends the file so the failure appears at commit time too.
**How to avoid:** `experimental.serverActions.bodySizeLimit: '4mb'` (verified in this Next 16.2.9's bundled docs); also client-side pre-check `file.size` with an honest error.
**Warning signs:** import works with test fixtures but fails on the user's real multi-year export.

### Pitfall 4: Duplicate identical rows within one file
**What goes wrong:** naive row hash makes two legitimate identical same-day trades collide — the second row silently disappears (violates IMPT-04), or re-import imports it twice (violates IMPT-05).
**How to avoid:** occurrence-index in the row hash (Pattern 2).
**Warning signs:** `row_count` minus skipped/invalid ≠ `imported_count` on a clean first import.

### Pitfall 5: Float drift breaking idempotency
**What goes wrong:** hashing `parseFloat("36.000000")` → `36` on one run and `"36.000000"` string on another produces different hashes; re-import duplicates rows.
**How to avoid:** hash *normalized strings* (trim zeros consistently, fixed decimal canonicalization) produced by one shared `normalize.ts` function used by both preview and commit; unit-test hash stability explicitly.
**Warning signs:** re-import of an untouched file shows any row as non-duplicate.

### Pitfall 6: SELL rows arriving before their BUYs (Robinhood partial exports)
**What goes wrong:** a date-range export may contain a SELL for shares bought before the range; `deriveHoldings` clamps quantity at 0 and cost basis goes weird — silently.
**How to avoid:** preview-level warning (not a blocker): "SELL of X shares exceeds shares imported/held as of that date." Import proceeds if the user says so — their ledger, their call — but it is never silent.
**Warning signs:** negative-looking positions or 0-quantity holdings right after an import.

### Pitfall 7: RLS blocks `import_batches` reads/writes because the policy pattern was copied wrong
**What goes wrong:** the `transactions` RLS pattern references `account_id` via `investment_accounts`; a new table with a subtly different subquery fails only at runtime (empty reads look like "no history").
**How to avoid:** copy the exact EXISTS-subquery shape from the transactions migration; extend `scripts/rls-isolation-test.ts` to cover `import_batches` and `symbol_mappings` (two-user isolation), matching the AUTH-04 test discipline.
**Warning signs:** import succeeds but the banner/summary never finds prior batches.

## Code Examples

### Header-scan Groww parsing (SheetJS, defensive)
```ts
// Source: SheetJS docs (sheet_to_json header:1 array-of-arrays mode) — docs.sheetjs.com
import * as XLSX from 'xlsx';

export function parseGroww(bytes: Uint8Array): ParsedRow[] {
  const wb = XLSX.read(bytes, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const norm = (c: unknown) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const headerIdx = grid.findIndex(
    (row) => row.some((c) => norm(c) === 'isin') && row.some((c) => /quant/i.test(String(c ?? '')))
  );
  if (headerIdx === -1) {
    throw new ImportParseError(
      `Unrecognized Groww format: no header row containing "ISIN" found in sheet "${wb.SheetNames[0]}". ` +
      `First rows seen: ${JSON.stringify(grid.slice(0, 5))}`
    );
  }
  const col = Object.fromEntries(grid[headerIdx].map((c, i) => [norm(c), i]));
  // read by name: col['isin'], col['quantity'], col['average buy price'] (fuzzy-match variants)
  // stop at the first row whose ISIN cell fails /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/
}
```

### Robinhood money/date normalization (never coerce to 0)
```ts
export function parseMoney(raw: string | null): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '' || s === '—') return null;
  const negative = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[($),]/g, '').replace(/^\$/, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;   // caller marks the ROW invalid — never 0
  const n = Number(cleaned);
  return negative ? -n : n;
}

export function parseRobinhoodDate(raw: string): string | null {
  const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;                                // disclaimer/footer rows die here
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
```

### Deterministic row hash with occurrence index
```ts
import { createHash } from 'node:crypto';

export function computeRowHashes(rows: NormalizedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [r.broker, r.isin ?? r.symbol, r.txnType, r.quantityStr, r.priceStr ?? '', r.dateISO].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash('sha256').update(`${base}|${n}`).digest('hex');
  });
}
```

### Broker detection (Claude's-discretion resolution: auto-detect, show, allow override)
```ts
export function detectBroker(bytes: Uint8Array, fileName: string): 'groww' | 'robinhood' | 'unknown' {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;            // 'PK' — every .xlsx is a zip
  if (isZip) return 'groww';                                       // confirmed by header scan during parse
  const head = new TextDecoder().decode(bytes.slice(0, 2048));
  if (/Trans Code/i.test(head) && /Activity Date/i.test(head)) return 'robinhood';
  return 'unknown';                                                // honest picker fallback in UI
}
```
Detection is near-deterministic (zip magic vs CSV header text), so auto-detect with a visible "Detected: Groww (change)" label is the right discretion call.

## Discretion Resolutions (summary for the planner)

| Discretion area | Resolution |
|-----------------|------------|
| Entry point | Dedicated `/import` page under `(dashboard)` (preview + mapping need a full page; matches locked single-progressive-page decision). "Import" button next to "Add Asset" in the Holdings header links to it. |
| Broker detection | Auto-detect (zip magic + CSV header sniff), display detected broker, manual override dropdown; `unknown` → explicit picker, honest error if parse then fails. |
| Commit policy | Partial commit at row level (valid + user-selected categories import; the rest reported), atomic at write level (single bulk insert; compensating delete of the batch row on failure). |
| Preview defaults | valid → import; duplicate → skip; unsupported → skip; invalid + unmatched → excluded (unmatched becomes valid once mapped). |
| Mapping placement | Dedicated "Resolve symbols" section above the preview table, one entry per unique unmatched broker symbol. |
| New-instrument creation | Yes, via `find_or_create_instrument` SECURITY DEFINER RPC (ISIN required — prefilled for Groww, user-entered for Robinhood; never fabricated). |
| Mapping persistence | Yes — `symbol_mappings` table, auto-applied on future imports. |
| Duplicate rule | Row-level (hash vs imported + field-match vs manual) AND file-level (hash banner). Groww extra rule: already-held instrument → duplicate, default skip. |
| Same-file re-upload | Banner + full preview with rows flagged duplicate. |
| Duplicate scope | Manual transactions included as candidates. |
| Import history UI | Batch id internal-only this phase; the post-commit result summary is the audit trail. A history list is cheap later (`import_batches` has everything). |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `npm i xlsx` from registry | SheetJS distributed exclusively via cdn.sheetjs.com tarballs (0.19.3+…0.20.3) | 2023 (registry abandoned at 0.18.5) | Must pin tarball URL; registry version has open CVEs |
| API routes + multer-style upload middleware | Server Actions accept `FormData`/`File` natively (Web APIs in Node runtime) | Next 13.4+, unchanged in this repo's Next 16.2.9 (bundled docs verified) | No upload middleware, no API route needed |
| `exchangerate.host`-style "assume free tier works" | This project's discipline: verify providers live before depending on them | Phase 3 lesson (STATE.md) | Same discipline here: real export fixtures before UI work |

**Deprecated/outdated:**
- `xlsx@0.18.5` (npm registry): CVE-2023-30533 (prototype pollution), CVE-2024-22363 (ReDoS) — fixed only in CDN releases.
- `exceljs`: not deprecated but stagnant since 2023-10; do not introduce.

## Open Questions

1. **Exact Groww holdings-statement cell layout (header spellings, title-block shape, totals row)**
   - What we know: the data columns exist (ISIN, quantity, average price — HIGH via Groww API docs); approximate column set from community knowledge (LOW-MEDIUM).
   - What's unclear: exact header text, header-row offset, statement-date format in the title block.
   - Recommendation: header-scan parser (Pattern above) makes the plan robust to any reasonable variant; **first execution task should be the fixtures step** — user provides a real export, parser is verified against it before UI work. If the user has no Groww export handy, the parser still ships with synthetic fixtures and honest "unrecognized format" errors.

2. **Robinhood 9-column vs 11-column variant (Account Type / Suppressed)**
   - What we know: both appear in independent community sources; header-name-driven parsing handles either.
   - Recommendation: no action beyond name-driven access + a fixture for each variant if available.

3. **Whether Groww statements can include mutual funds / non-equity rows in the same sheet**
   - What we know: Groww exports MF and stocks statements separately (help pages), but ISIN-prefix `INF` (MF) vs `INE` (equity) rows are cheap to distinguish.
   - Recommendation: treat non-matching asset rows as `unsupported` category (reported, never dropped, never erroring the whole file).

4. **SPR (reverse split) and SELL-before-BUY ledger limitations**
   - What we know: the ledger has no quantity-*reducing* corporate action type; `deriveHoldings` clamps at 0.
   - Recommendation: skip + report SPR; warning (non-blocking) for over-sells. If the user hits these for real, that's a v2 ledger extension (DATA-01), not a Phase 4 fix.

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md` (this repo's exact Next 16.2.9) — `experimental.serverActions.bodySizeLimit`, 1MB default
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` — Server Function auth discipline, FormData actions
- npm registry (queried live 2026-07-15) — `xlsx` frozen at 0.18.5 (modified 2024-10); `papaparse` 5.5.4; `exceljs` 4.4.0 (2023-10); `read-excel-file` 9.3.1; `@types/papaparse` 5.5.2
- cdn.sheetjs.com (probed live) — `xlsx-0.20.3.tgz` HTTP 200 (2.4MB); 0.20.4/0.20.5/0.21.x → 404 (0.20.3 is latest)
- Groww Trade API docs (groww.in/trade-api) — holdings objects: `isin`, `trading_symbol`, `quantity`, `average_price`
- Project source: `supabase/migrations/20260714160720_instruments_transactions.sql` (transactions CHECK constraints, instruments RLS "no permissive write policy" comment), `src/server-actions/portfolio.ts` (action pattern), `src/lib/portfolio/derive-holdings.ts`, `src/lib/supabase/portfolio.ts`, `src/server-actions/prices.ts` (refreshPricesNow), `src/lib/prices/refresh-service.ts` (price_source_symbol conventions)

### Secondary (MEDIUM confidence)
- ghostfolio Robinhood import doc (github.com/GrantBirki/ghostfolio, docs/imports/robinhood.md) — 9-column header, Buy/CDIV examples, `($43.64)` negatives, M/D/YYYY dates, blank dividend qty/price
- AllInvestView Robinhood import guide (2026) — independent confirmation of the same 9 columns, OEXP/OASGN codes, CSV-not-PDF guidance
- nathancheek/robinhood_capital_gains_estimator — Trans Codes Buy/Sell/SPL/SPR/CONV/SXCH/MRGS; SPL 4-decimal quirk; missing cost basis on old rows
- SheetJS CVE situation: CVE-2023-30533 / CVE-2024-22363 fixed only in CDN releases (multiple advisories agree; registry freeze verified directly above)

### Tertiary (LOW confidence — flagged for fixture validation)
- Groww holdings XLSX column set ("Stock Name, ISIN, Quantity, Average buy price, Buy value, Closing price, Closing value, Unrealised P&L") and title-block-above-header layout — community knowledge, no verified public sample; mitigated by header-scan design + mandatory fixtures task
- Robinhood 11-column variant (Account Type, Suppressed) — single search-result source; mitigated by header-name-driven parsing
- Robinhood trailing disclaimer row — community parsers reference it; mitigated by date-parse row filtering

### Not available
- Context7 MCP was not available in this session; library claims were verified against official docs, the npm registry, and cdn.sheetjs.com directly.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and distribution channels verified live against registry/CDN; Next config verified against the installed version's own docs
- Architecture: HIGH — extends proven Phase 2/3 patterns already in this codebase; the one novel element (SECURITY DEFINER RPC for instrument creation) is standard Supabase practice for controlled writes to closed tables
- Robinhood format: MEDIUM — two independent sources agree on columns/quirks; variants handled structurally
- Groww format: LOW-MEDIUM on exact layout, HIGH on data content — mitigated by header-scan parsing, loud failure, and a mandatory real-file fixtures task
- Pitfalls: HIGH — derived from verified format quirks + this project's own documented disciplines

**Research date:** 2026-07-15
**Valid until:** ~2026-08-15 (stable domain; re-check cdn.sheetjs.com latest and papaparse before install)
