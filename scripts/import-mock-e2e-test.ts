/**
 * IMPT end-to-end proof on REALISTIC mock broker exports (USER REQUIREMENT:
 * "for imports make sure to build and test with the mock data sheet with 5
 * stocks from each market").
 *
 * Run:  npm run test:import-mock   (-> tsx scripts/import-mock-e2e-test.ts)
 *
 * Unlike scripts/import-parse-test.ts (which unit-tests each pure function on
 * hand-built micro-fixtures), this script drives the ENTIRE import pipeline,
 * in production order, over two files that look like the real thing:
 *
 *   scripts/fixtures/mock-groww-5stocks.xlsx     (5 NSE stocks + 1 unmatched + 1 MF)
 *   scripts/fixtures/mock-robinhood-5stocks.csv  (5 US stocks + 1 unmatched + 2 non-Buy)
 *
 * Pipeline exercised per file, exactly as the Server Actions do it:
 *   detectBroker(bytes)            -> auto-detect groww vs robinhood from bytes
 *   parseGroww / parseRobinhood    -> ParsedRow[]
 *   matchInstruments(rows, seeds)  -> resolve broker symbol/ISIN to a seeded instrument
 *   computeRowHashes(normalized)   -> deterministic per-row hash (idempotency linchpin)
 *   detectDuplicates(rows, empty)  -> first-import path: nothing pre-existing
 *
 * The instrument universe fed to matchInstruments is PARSED AT TEST TIME from
 * the real seed migration (supabase/migrations/20260714160838_seed_instruments.sql)
 * so this test can never drift from the 16-instrument symbol master the app ships.
 *
 * Asserts (both files): 5 matched rows, exactly 1 unmatched-but-reported
 * symbol (never silently dropped), non-Buy/MF rows reported-with-reason,
 * broker auto-detected correctly, and re-running the whole pipeline yields
 * byte-identical row hashes (the precondition for re-import idempotency).
 *
 * Same dependency-free style as the other scripts/*-test.ts: node:assert/strict,
 * console.log('PASS') + process.exit(0) on success, throw on failure. Do NOT
 * weaken these assertions to make the script pass -- a failure means a fixture
 * or a pipeline module is wrong; fix that, not the test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { detectBroker } from '../src/lib/import/detect-broker';
import { parseGroww } from '../src/lib/import/parse-groww';
import { parseRobinhood } from '../src/lib/import/parse-robinhood';
import { matchInstruments } from '../src/lib/import/match-instruments';
import { detectDuplicates } from '../src/lib/import/detect-duplicates';
import { computeRowHashes } from '../src/lib/import/row-hash';
import type { NormalizedRow, ParsedRow } from '../src/lib/import/types';
import type { AssetType, Currency, Exchange, Instrument } from '../src/lib/types';

const ROOT = process.cwd();
const FIXTURES_DIR = join(ROOT, 'scripts', 'fixtures');
const SEED_SQL = join(ROOT, 'supabase', 'migrations', '20260714160838_seed_instruments.sql');

const GROWW_FILE = 'mock-groww-5stocks.xlsx';
const ROBINHOOD_FILE = 'mock-robinhood-5stocks.csv';

// ------------------------------------------------------------
// Instrument universe: parsed from the real seed migration so the
// test's matching candidates are exactly what the DB ships (never a
// hand-maintained copy that could drift). Each seeded row's synthetic
// id mirrors its (isin, exchange) primary key.
// ------------------------------------------------------------
const SEED_TUPLE =
  /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;

function loadSeedInstruments(): Instrument[] {
  const sql = readFileSync(SEED_SQL, 'utf8');
  const instruments: Instrument[] = [];
  for (const m of sql.matchAll(SEED_TUPLE)) {
    const [, isin, symbol, exchange, displayName, assetType, currency, priceSourceSymbol] = m;
    instruments.push({
      id: `${isin}-${exchange}`,
      isin,
      symbol,
      exchange: exchange as Exchange,
      displayName,
      assetType: assetType as AssetType,
      currency: currency as Currency,
      priceSourceSymbol,
    });
  }
  return instruments;
}

// ------------------------------------------------------------
// Hashing helper -- mirrors detect-duplicates.ts exactly (same
// NON_HASHABLE_STATUSES gate and toNormalizedRow shape) so we can
// observe the deterministic hashes detectDuplicates computes
// internally and prove they are stable across independent runs.
// ------------------------------------------------------------
const NON_HASHABLE = new Set<ParsedRow['status']>(['unmatched', 'unsupported', 'invalid']);

function toNormalizedRow(row: ParsedRow): NormalizedRow | null {
  if (row.txnType == null || row.quantityStr == null || row.dateISO == null) return null;
  return {
    broker: row.broker,
    symbol: row.symbol,
    isin: row.isin,
    txnType: row.txnType,
    quantityStr: row.quantityStr,
    priceStr: row.priceStr,
    dateISO: row.dateISO,
  };
}

function hashEligibleRows(rows: ParsedRow[]): string[] {
  const normalized: NormalizedRow[] = [];
  for (const row of rows) {
    if (NON_HASHABLE.has(row.status)) continue;
    const n = toNormalizedRow(row);
    if (n != null) normalized.push(n);
  }
  return computeRowHashes(normalized);
}

// ------------------------------------------------------------
// One full pipeline pass over one file, in production order.
// ------------------------------------------------------------
interface PipelineResult {
  broker: 'groww' | 'robinhood' | 'unknown';
  parsed: ParsedRow[];
  matched: ParsedRow[];
  deduped: ParsedRow[];
  hashes: string[];
}

function runPipeline(fileName: string, instruments: Instrument[]): PipelineResult {
  const isXlsx = fileName.endsWith('.xlsx');
  const buf = readFileSync(join(FIXTURES_DIR, fileName));
  const bytes = new Uint8Array(buf);

  const broker = detectBroker(bytes, fileName);
  const parsed = broker === 'groww' ? parseGroww(bytes) : parseRobinhood(buf.toString('utf8'));

  // No saved per-symbol mappings on a first import.
  const matched = matchInstruments(parsed, instruments, []);
  const hashes = hashEligibleRows(matched);

  // First-import path: no prior hashes, no manual transactions, nothing held.
  const deduped = detectDuplicates(matched, new Set<string>(), [], new Set<string>());

  void isXlsx;
  return { broker, parsed, matched, deduped, hashes };
}

const HEX64 = /^[0-9a-f]{64}$/;

// ============================================================
// Case group A: mock Groww statement (5 NSE stocks)
// ============================================================
const GROWW_MATCHED_ISINS: Record<string, string> = {
  INE002A01018: 'INE002A01018-NSE', // RELIANCE
  INE467B01029: 'INE467B01029-NSE', // TCS
  INE009A01021: 'INE009A01021-NSE', // INFY (NSE; the NYSE ADR has a different ISIN)
  INE040A01034: 'INE040A01034-NSE', // HDFCBANK
  INE090A01021: 'INE090A01021-NSE', // ICICIBANK
};
const GROWW_UNMATCHED_ISIN = 'INE075A01022'; // Wipro Ltd -- real NSE equity, NOT in the seeds
const GROWW_MF_ISIN = 'INF200K01VT2'; // mutual fund -- valid ISIN, unsupported (not an equity)

function testGroww(instruments: Instrument[]): void {
  const { broker, parsed, matched, deduped } = runPipeline(GROWW_FILE, instruments);

  assert.equal(broker, 'groww', 'A0: broker auto-detected as groww from the xlsx (zip) bytes');

  // 7 emitted rows: 6 equities (5 matched + 1 unmatched) + 1 MF. The Total
  // footer has no ISIN, so the parser stops there -- never guesses past it.
  assert.equal(parsed.length, 7, 'A1: 7 rows parsed (6 equities + 1 MF); Total footer dropped');

  const matchedRows = matched.filter((r) => r.status === 'valid' && r.instrumentId != null);
  assert.equal(matchedRows.length, 5, 'A2: exactly 5 matched NSE stocks');

  for (const row of matchedRows) {
    assert.equal(row.txnType, 'BUY', `A3: matched row ${row.isin} is a synthetic opening BUY`);
    assert.equal(row.dateISO, '2026-07-15', `A3: statement date scanned from the title block for ${row.isin}`);
    const expectedId = GROWW_MATCHED_ISINS[row.isin ?? ''];
    assert.ok(expectedId, `A4: matched ISIN ${row.isin} is one of the 5 expected seeds`);
    assert.equal(row.instrumentId, expectedId, `A4: ${row.isin} resolved to the NSE seed instrument`);
  }
  assert.equal(
    new Set(matchedRows.map((r) => r.isin)).size,
    5,
    'A4b: the 5 matched rows are 5 DISTINCT seeded ISINs'
  );

  // Exactly ONE unmatched symbol -- reported with its symbol/ISIN, never dropped.
  const unmatched = matched.filter((r) => r.status === 'unmatched');
  assert.equal(unmatched.length, 1, 'A5: exactly 1 unmatched-but-reported symbol');
  assert.equal(unmatched[0].isin, GROWW_UNMATCHED_ISIN, 'A5: the unmatched row is the un-seeded Wipro ISIN');
  assert.equal(unmatched[0].symbol, 'Wipro Ltd', 'A5: unmatched row carries its broker symbol (not silently dropped)');
  assert.equal(unmatched[0].instrumentId, undefined, 'A5: unmatched row has no instrument attached');

  // The MF row is a recognized-but-unsupported holding: reported WITH a reason.
  const unsupported = matched.filter((r) => r.status === 'unsupported');
  assert.equal(unsupported.length, 1, 'A6: exactly 1 unsupported (mutual fund) row');
  assert.equal(unsupported[0].isin, GROWW_MF_ISIN, 'A6: unsupported row is the INF... mutual fund ISIN');
  assert.ok(unsupported[0].statusReason, 'A6: unsupported row carries a human-readable reason, not a silent drop');

  // First-import dedup: nothing pre-existing, so no matched row flips to duplicate,
  // and the unmatched/unsupported rows are left exactly as they were.
  const dedupMatched = deduped.filter((r) => r.status === 'valid' && r.instrumentId != null);
  assert.equal(dedupMatched.length, 5, 'A7: all 5 matched rows stay valid through first-import dedup');
  assert.equal(deduped.filter((r) => r.status === 'duplicate').length, 0, 'A7: no false duplicates on a first import');
  assert.equal(deduped.filter((r) => r.status === 'unmatched').length, 1, 'A7: unmatched row untouched by dedup');
  assert.equal(deduped.filter((r) => r.status === 'unsupported').length, 1, 'A7: unsupported row untouched by dedup');
}

// ============================================================
// Case group B: mock Robinhood activity report (5 US stocks)
// ============================================================
const ROBINHOOD_MATCHED: Record<string, string> = {
  AAPL: 'US0378331005-NASDAQ',
  MSFT: 'US5949181045-NASDAQ',
  NVDA: 'US67066G1040-NASDAQ',
  TSLA: 'US88160R1014-NASDAQ',
  INFY: 'US4567881085-NYSE', // Infosys ADR -- USD/NYSE, NOT the INR/NSE listing
};
const ROBINHOOD_UNMATCHED_SYMBOL = 'GOOGL'; // Alphabet -- real ticker, NOT in the seeds

function testRobinhood(instruments: Instrument[]): void {
  const { broker, parsed, matched, deduped } = runPipeline(ROBINHOOD_FILE, instruments);

  assert.equal(broker, 'robinhood', 'B0: broker auto-detected as robinhood from the CSV header text');

  // 8 emitted rows: 6 Buy (5 matched + 1 unmatched) + CDIV + DFEE. The trailing
  // disclaimer line has no parseable date, so it produces NO row (not emitted).
  assert.equal(parsed.length, 8, 'B1: 8 rows emitted (6 Buy + 2 non-Buy); disclaimer footer yields none');

  const matchedRows = matched.filter((r) => r.status === 'valid' && r.instrumentId != null);
  assert.equal(matchedRows.length, 5, 'B2: exactly 5 matched US stocks');

  for (const row of matchedRows) {
    assert.equal(row.txnType, 'BUY', `B3: matched Robinhood row ${row.symbol} is a BUY`);
    assert.ok(row.price != null && row.price > 0, `B3: ${row.symbol} carries a parsed dollar price`);
    const expectedId = ROBINHOOD_MATCHED[row.symbol];
    assert.ok(expectedId, `B4: matched symbol ${row.symbol} is one of the 5 expected seeds`);
    assert.equal(row.instrumentId, expectedId, `B4: ${row.symbol} resolved to its USD US-exchange seed`);
  }
  assert.equal(
    new Set(matchedRows.map((r) => r.symbol)).size,
    5,
    'B4b: the 5 matched rows are 5 DISTINCT US tickers'
  );

  // Exactly ONE unmatched ticker -- reported, never dropped.
  const unmatched = matched.filter((r) => r.status === 'unmatched');
  assert.equal(unmatched.length, 1, 'B5: exactly 1 unmatched-but-reported ticker');
  assert.equal(unmatched[0].symbol, ROBINHOOD_UNMATCHED_SYMBOL, 'B5: the unmatched row is the un-seeded GOOGL ticker');
  assert.equal(unmatched[0].instrumentId, undefined, 'B5: unmatched row has no instrument attached');

  // Non-Buy rows (CDIV dividend, DFEE fee) are recognized-but-unsupported:
  // reported WITH a reason, never silently dropped.
  const unsupported = matched.filter((r) => r.status === 'unsupported');
  assert.equal(unsupported.length, 2, 'B6: 2 non-Buy rows (CDIV + DFEE) reported as unsupported');
  for (const row of unsupported) {
    assert.ok(row.statusReason, `B6: unsupported ${row.rawFields['Trans Code']} row carries a reason (skip-but-report)`);
    assert.equal(row.txnType, null, 'B6: unsupported row has no transaction type');
  }
  const transCodes = new Set(unsupported.map((r) => r.rawFields['Trans Code']));
  assert.ok(transCodes.has('CDIV') && transCodes.has('DFEE'), 'B6: both CDIV and DFEE are the reported non-Buy rows');

  // First-import dedup path.
  const dedupMatched = deduped.filter((r) => r.status === 'valid' && r.instrumentId != null);
  assert.equal(dedupMatched.length, 5, 'B7: all 5 matched rows stay valid through first-import dedup');
  assert.equal(deduped.filter((r) => r.status === 'duplicate').length, 0, 'B7: no false duplicates on a first import');
}

// ============================================================
// Case group C: idempotency precondition -- re-running the whole
// pipeline (fresh file reads, fresh parse/match) yields byte-identical
// row hashes. This is what makes re-import a no-op at commit time.
// ============================================================
function testIdempotentHashes(instruments: Instrument[]): void {
  for (const file of [GROWW_FILE, ROBINHOOD_FILE]) {
    const runA = runPipeline(file, instruments);
    const runB = runPipeline(file, instruments);

    assert.equal(runA.hashes.length, 5, `C1(${file}): 5 eligible rows hashed (the 5 matched trades)`);
    assert.deepEqual(runA.hashes, runB.hashes, `C2(${file}): identical hashes across two independent pipeline runs`);
    assert.equal(new Set(runA.hashes).size, 5, `C3(${file}): all 5 row hashes are distinct within the file`);
    for (const h of runA.hashes) {
      assert.match(h, HEX64, `C4(${file}): each row hash is a 64-char sha256 hex digest`);
    }
  }
}

function main(): void {
  const instruments = loadSeedInstruments();
  assert.equal(instruments.length, 16, 'Seed migration parsed: 16 instruments loaded from the symbol master');

  testGroww(instruments);
  testRobinhood(instruments);
  testIdempotentHashes(instruments);

  console.log(
    'PASS: import-mock-e2e -- 5 matched + 1 unmatched-but-reported + non-Buy-reported per file, ' +
      'broker auto-detected, hashes stable across runs (idempotency precondition holds) on realistic Groww + Robinhood mock exports'
  );
  process.exit(0);
}

main();
