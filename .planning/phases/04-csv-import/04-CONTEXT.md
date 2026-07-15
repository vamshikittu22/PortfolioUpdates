# Phase 4: CSV Import - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Users load real holdings from Groww (XLSX) and Robinhood (CSV) exports safely, previewably, and idempotently. Rows are parsed into transactions (the Phase 2 ledger); a preview gates every commit with per-row validation, duplicate detection, and skip/override; unmatched symbols are mapped to instruments by ISIN/exchange rather than silently dropped; re-importing the same file adds no duplicate transactions (import batch id), and imported holdings immediately reflect live P&L via the Phase 3 pipeline. Requirements: IMPT-01..05.

</domain>

<decisions>
## Implementation Decisions

### Import flow & entry point
- **Single progressive page, not a wizard** — dropping/choosing a file reveals the preview below it, with the commit action at the bottom. Everything visible at once, no gated steps.
- **After a successful commit: result summary screen** — stays in the import flow showing counts (imported / skipped / duplicates) with a link to Holdings. Do NOT auto-redirect; the audit trail of what just happened matters. Imported holdings must show live P&L when the user follows the link (success criterion 4).

### Preview & row control
- **Compact rows with expandable detail** — key fields visible per row (symbol, type, quantity, status badge); clicking a row expands full parsed fields and any validation messages.
- **Bulk-only skip/override controls** — category-level toggles (e.g., "import valid rows", "skip duplicates", "import duplicates anyway"), NOT per-row checkboxes. IMPT-03's skip/override operates at category granularity.

### Symbol mapping
- **Multi-exchange ambiguity auto-resolves by broker** — a symbol matching instruments on multiple exchanges (e.g., INFY on both NSE and NYSE) is auto-picked using the source broker: Groww implies Indian exchanges (NSE/BSE), Robinhood implies US exchanges. The auto-pick is shown in the preview and is overridable. Only truly unmatched symbols go through the mapping UI.

### Duplicate & re-import behavior
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

</decisions>

<specifics>
## Specific Ideas

- Broker identity carries meaning beyond parsing: it drives exchange disambiguation (Groww → NSE/BSE, Robinhood → US exchanges).
- The result summary is valued as an audit trail — counts of imported/skipped/duplicates should be explicit, not just a toast.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-csv-import*
*Context gathered: 2026-07-15*
