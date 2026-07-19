# 08-02 — Mock broker exports + end-to-end import test

**User requirement:** "for imports make sure to build and test with the mock
data sheet with 5 stocks from each market."

## What was built

Two realistic mock broker export fixtures and one end-to-end test that drives
the **real** import pipeline over them (no mocks, no DB, no network).

### Fixtures (`scripts/fixtures/`)

- **`mock-groww-5stocks.xlsx`** — a Groww holdings statement in the exact
  title-block / header / `Total`-footer layout `parse-groww.ts` scans for.
  - 5 NSE equities that exist in the seed instrument master (matched by ISIN):
    RELIANCE `INE002A01018`, TCS `INE467B01029`, INFY `INE009A01021`,
    HDFCBANK `INE040A01034`, ICICIBANK `INE090A01021`.
  - 1 **unmatched-but-reported** equity: Wipro Ltd `INE075A01022` (a real NSE
    stock deliberately absent from the seeds).
  - 1 **unsupported** mutual-fund row: `INF200K01VT2` (valid ISIN, INF prefix).
  - A `Total` footer with no ISIN — the parser stops there, dropping it.

- **`mock-robinhood-5stocks.csv`** — a Robinhood activity report in the
  9-column layout `parse-robinhood.ts` reads, `M/D/YYYY` dates, `$` prices,
  `($xxx)` buy amounts.
  - 5 US stocks that exist in the seeds (matched by ticker + US exchange + USD):
    AAPL, MSFT, NVDA, TSLA, and INFY (the NYSE ADR `US4567881085`, distinct
    from the INR/NSE listing).
  - 1 **unmatched-but-reported** ticker: GOOGL (real ticker, not seeded).
  - 2 **non-Buy** rows (CDIV dividend, DFEE fee) to exercise skip-with-reason.
  - A trailing disclaimer line that must yield **no** row.

### Test (`scripts/import-mock-e2e-test.ts`, `npm run test:import-mock`)

Drives the pipeline in production order per file:
`detectBroker → parse{Groww,Robinhood} → matchInstruments → computeRowHashes
→ detectDuplicates(empty existing state)`.

The instrument universe fed to `matchInstruments` is **parsed at test time**
from `supabase/migrations/20260714160838_seed_instruments.sql` (16 rows), so
the test can never drift from the shipped symbol master.

**Assertions (both files, all green):**
- broker auto-detected from bytes (`groww` from the xlsx zip magic;
  `robinhood` from the CSV header text);
- exactly **5 matched** rows, each resolving to the expected seeded instrument
  id and 5 distinct symbols/ISINs;
- exactly **1 unmatched** symbol per file, still carrying its symbol/ISIN
  (never silently dropped) with no instrument attached;
- **non-Buy / MF rows reported with a reason** (Groww MF unsupported;
  Robinhood CDIV + DFEE unsupported), never dropped;
- first-import dedup produces **no false duplicates**; unmatched/unsupported
  rows are left untouched;
- **idempotency precondition**: two independent pipeline runs over each file
  yield byte-identical `sha256` row hashes (5 distinct 64-hex digests each).

## Verification

- `npx tsx scripts/import-mock-e2e-test.ts` — PASS (run twice, identical output).
- `npm run test:import-mock` — PASS.
- `npx tsc --noEmit` — clean (exit 0).

## Commits

- `44558856` — fixtures (xlsx + csv).
- `15b4cc5f` — e2e test + `test:import-mock` npm script.
- this summary (committed alone).
