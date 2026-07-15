/**
 * IMPT-01 / IMPT-02 / IMPT-03 / IMPT-04 / IMPT-05 -- pure-function
 * correctness proof for the import pipeline built in 04-03: both broker
 * parsers, instrument matching, and duplicate detection.
 *
 * Run:  npm run test:import-parse   (-> tsx scripts/import-parse-test.ts)
 *
 * This is a PURE unit test -- no database, no network. It exercises against
 * synthetic fixtures under scripts/fixtures/ (real-file validation against
 * the user's actual Groww/Robinhood exports is explicitly deferred to
 * 04-07 -- 04-RESEARCH Open Question 1):
 *   1. parseRobinhood on the 9-column sample -- Trans Code mapping, an
 *      unsupported CDIV row, a skipped disclaimer footer line, ISO dates.
 *   2. parseRobinhood on an 11-column variant -- identical shared-column
 *      result (proves header-name-driven access, not positional).
 *   3. parseGroww on the sample XLSX -- synthetic-opening-BUY snapshot
 *      modeling, notes marker, and cost-basis preservation through
 *      deriveHoldings.
 *   4. parseGroww on a header-less sheet -- throws ImportParseError with
 *      "First rows seen" in the message (never guesses a layout).
 *   5. parseGroww's INF... (mutual fund) row -- reported as unsupported,
 *      equity rows still parse.
 *   6. matchInstruments -- ISIN multi-exchange auto-pick (Groww), ticker +
 *      US-exchange/currency filter (Robinhood), unmatched-symbol
 *      dedup, saved-mapping short-circuit.
 *   7. detectDuplicates -- hash match, manual field-match, Groww
 *      already-held rule, and a clean row staying valid.
 *
 * Same dependency-free style as scripts/import-primitives-test.ts:
 * node:assert/strict, console.log('PASS') + process.exit(0) on success,
 * throw / non-zero exit on failure. Do NOT weaken these assertions to make
 * the script pass -- a failure means the implementation is wrong; fix the
 * parser/matcher/dedup module instead.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';

import { parseRobinhood } from '../src/lib/import/parse-robinhood';
import { parseGroww } from '../src/lib/import/parse-groww';
import { matchInstruments, type SavedMapping } from '../src/lib/import/match-instruments';
import { detectDuplicates, type ManualTxnCandidate } from '../src/lib/import/detect-duplicates';
import { computeRowHashes } from '../src/lib/import/row-hash';
import { ImportParseError } from '../src/lib/import/types';
import type { ParsedRow } from '../src/lib/import/types';
import { deriveHoldings } from '../src/lib/portfolio/derive-holdings';
import type { Instrument, Transaction } from '../src/lib/types';

const FIXTURES_DIR = join(process.cwd(), 'scripts', 'fixtures');

// ============================================================
// Case group 1: parseRobinhood on the 9-column sample fixture
// ============================================================
function testParseRobinhoodSample(): void {
  const csv = readFileSync(join(FIXTURES_DIR, 'robinhood-activity-sample.csv'), 'utf8');
  const rows = parseRobinhood(csv);

  assert.equal(rows.length, 6, 'Case 1a: 6 emitted rows (disclaimer footer line produces none)');

  const buys = rows.filter((r) => r.txnType === 'BUY');
  const sells = rows.filter((r) => r.txnType === 'SELL');
  const splits = rows.filter((r) => r.txnType === 'SPLIT');
  const unsupported = rows.filter((r) => r.status === 'unsupported');

  assert.equal(buys.length, 2, 'Case 1b: 2 BUY rows (AAPL + fractional VOO)');
  assert.equal(sells.length, 1, 'Case 1c: 1 SELL row');
  assert.equal(splits.length, 1, 'Case 1d: 1 SPLIT row');
  assert.equal(unsupported.length, 2, 'Case 1e: CDIV + DFEE both unsupported (reported, not dropped)');

  const cdiv = rows.find((r) => r.rawFields['Trans Code'] === 'CDIV');
  assert.ok(cdiv, 'Case 1f: CDIV row present');
  assert.equal(cdiv!.status, 'unsupported', 'Case 1f: CDIV row is unsupported');
  assert.ok(cdiv!.statusReason, 'Case 1f: CDIV row carries a reason, not a silent drop');

  const firstBuy = rows.find((r) => r.txnType === 'BUY' && r.symbol === 'AAPL');
  assert.ok(firstBuy, 'Case 1g: AAPL Buy row present');
  assert.equal(firstBuy!.dateISO, '2023-09-18', 'Case 1g: date normalized to ISO');
  assert.equal(firstBuy!.price, 150.25, 'Case 1g: price is the parsed dollar amount, not the raw string');
  assert.equal(firstBuy!.status, 'valid');

  const split = splits[0];
  assert.equal(split.price, null, 'Case 1h: SPLIT row has a null price by design (no cash flow)');
  assert.equal(split.quantity, 3, 'Case 1h: SPLIT quantity = shares received');

  const fractionalBuy = rows.find((r) => r.symbol === 'VOO');
  assert.ok(fractionalBuy, 'Case 1i: fractional-share VOO row present');
  assert.equal(fractionalBuy!.quantity, 0.123456, 'Case 1i: fractional share quantity preserved to 6dp');
}

// ============================================================
// Case group 2: parseRobinhood on an 11-column variant
// ============================================================
function testParseRobinhoodElevenColumnVariant(): void {
  const csv9 = readFileSync(join(FIXTURES_DIR, 'robinhood-activity-sample.csv'), 'utf8');
  const rows9 = parseRobinhood(csv9);
  const buy9 = rows9.find((r) => r.txnType === 'BUY' && r.symbol === 'AAPL')!;

  const csv11 =
    '"Activity Date","Process Date","Settle Date","Account Type","Instrument","Description","Trans Code","Quantity","Price","Amount","Suppressed"\n' +
    '"9/18/2023","9/20/2023","9/20/2023","Individual","AAPL","Apple Inc","Buy","5","150.25","$751.25","No"\n';
  const rows11 = parseRobinhood(csv11);

  assert.equal(rows11.length, 1, 'Case 2a: 11-column variant parses its one data row');
  const buy11 = rows11[0];

  assert.equal(buy11.symbol, buy9.symbol, 'Case 2b: shared column (Instrument) matches across variants');
  assert.equal(buy11.txnType, buy9.txnType, 'Case 2b: Trans Code mapping matches across variants');
  assert.equal(buy11.quantity, buy9.quantity, 'Case 2b: Quantity matches across variants');
  assert.equal(buy11.price, buy9.price, 'Case 2b: Price matches across variants');
  assert.equal(buy11.dateISO, buy9.dateISO, 'Case 2b: Activity Date matches across variants');
  assert.equal(buy11.status, buy9.status, 'Case 2b: status matches across variants');
}

// ============================================================
// Case groups 3 & 5: parseGroww on the sample XLSX
// ============================================================
function testParseGrowwSample(): void {
  const bytes = new Uint8Array(readFileSync(join(FIXTURES_DIR, 'groww-holdings-sample.xlsx')));
  const rows = parseGroww(bytes);

  const equityRows = rows.filter((r) => r.status !== 'unsupported');
  assert.equal(equityRows.length, 2, 'Case 3a: 2 equity rows parsed (Infosys, TCS) -- totals row excluded');
  assert.ok(
    equityRows.every((r) => r.txnType === 'BUY'),
    'Case 3b: every equity row becomes ONE synthetic opening BUY, never invented per-lot history'
  );
  assert.ok(
    equityRows.every((r) => r.rawFields.notes === 'Imported from Groww holdings statement (opening position; avg-cost snapshot)'),
    'Case 3c: honest notes marker set on every synthetic BUY'
  );

  const infosys = equityRows.find((r) => r.isin === 'INE009A01021');
  assert.ok(infosys, 'Case 3d: Infosys ISIN preserved');
  assert.equal(infosys!.quantity, 10, 'Case 3d: quantity read from the sheet');
  assert.equal(infosys!.price, 1450.5, 'Case 3d: average buy price read from the sheet');
  assert.equal(infosys!.status, 'valid');

  // Case 5: the INF... mutual-fund row is unsupported; equity rows still parse.
  const mfRow = rows.find((r) => r.isin?.startsWith('INF'));
  assert.ok(mfRow, 'Case 5a: mutual fund row present in parsed output');
  assert.equal(mfRow!.status, 'unsupported', 'Case 5a: mutual fund row is unsupported, not silently dropped');
  assert.equal(equityRows.length, 2, 'Case 5b: equity rows unaffected by the MF row');

  // Case 3e: cost-basis preservation through deriveHoldings -- feeding the
  // synthetic BUYs through the SAME reducer used for the real ledger must
  // reproduce the sheet's average price exactly (one BUY -> avgCost = price).
  const transactions: Transaction[] = equityRows.map((r, i) => ({
    id: `synthetic-${i}`,
    accountId: 'acc-1',
    instrumentId: r.isin!,
    transactionType: 'BUY',
    quantity: r.quantity!,
    price: r.price!,
    transactionDate: r.dateISO!,
  }));
  const holdings = deriveHoldings(transactions);
  for (const row of equityRows) {
    const holding = holdings.get(row.isin!);
    assert.ok(holding, `Case 3e: holding derived for ISIN ${row.isin}`);
    assert.equal(
      holding!.avgCost,
      row.price,
      `Case 3e: deriveHoldings avgCost (${holding!.avgCost}) equals the sheet's average price (${row.price}) for ${row.isin}`
    );
  }
}

// ============================================================
// Case group 4: parseGroww on a header-less sheet -- loud failure
// ============================================================
function testParseGrowwNoHeader(): void {
  const grid = [
    ['Some Other Statement'],
    ['Name', 'Value'],
    ['Foo', 123],
  ];
  const ws = XLSX.utils.aoa_to_sheet(grid);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const written = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayLike<number>;
  const bytes = new Uint8Array(written);

  assert.throws(
    () => parseGroww(bytes),
    (err: unknown) => {
      assert.ok(err instanceof ImportParseError, 'Case 4a: throws ImportParseError, not a generic error');
      assert.ok(
        (err as Error).message.includes('First rows seen'),
        'Case 4b: error message echoes the first rows it actually saw'
      );
      return true;
    },
    'Case 4: no recognizable header row -> loud failure, never a guess'
  );
}

// ============================================================
// Case group 6: matchInstruments
// ============================================================
const TEST_INSTRUMENTS: Instrument[] = [
  {
    id: 'instr-infy-nse',
    isin: 'INE009A01021',
    symbol: 'INFY',
    exchange: 'NSE',
    displayName: 'Infosys Ltd',
    assetType: 'stocks',
    currency: 'INR',
    priceSourceSymbol: 'INFY.NS',
  },
  {
    id: 'instr-infy-bse',
    isin: 'INE009A01021',
    symbol: 'INFY',
    exchange: 'BSE',
    displayName: 'Infosys Ltd',
    assetType: 'stocks',
    currency: 'INR',
    priceSourceSymbol: 'INFY.BO',
  },
  {
    id: 'instr-tcs-nse',
    isin: 'INE467B01029',
    symbol: 'TCS',
    exchange: 'NSE',
    displayName: 'Tata Consultancy Services Ltd',
    assetType: 'stocks',
    currency: 'INR',
    priceSourceSymbol: 'TCS.NS',
  },
  {
    id: 'instr-aapl-nasdaq',
    isin: 'US0378331005',
    symbol: 'AAPL',
    exchange: 'NASDAQ',
    displayName: 'Apple Inc',
    assetType: 'stocks',
    currency: 'USD',
    priceSourceSymbol: 'AAPL',
  },
  {
    id: 'instr-aapl-nse-fake',
    isin: 'INE999A01011',
    symbol: 'AAPL',
    exchange: 'NSE',
    displayName: 'Ticker-collision fixture (must NOT match Robinhood AAPL)',
    assetType: 'stocks',
    currency: 'INR',
    priceSourceSymbol: 'AAPL.NS',
  },
];

function buildParsedRow(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    rowIndex: 0,
    broker: 'robinhood',
    rawFields: {},
    symbol: '',
    isin: null,
    txnType: 'BUY',
    quantity: 1,
    quantityStr: '1',
    price: 1,
    priceStr: '1',
    dateISO: '2024-01-01',
    status: 'valid',
    ...overrides,
  };
}

function testMatchInstruments(): void {
  const rowInfy = buildParsedRow({
    broker: 'groww',
    symbol: 'Infosys Ltd',
    isin: 'INE009A01021',
    quantity: 10,
    quantityStr: '10',
    price: 1450.5,
    priceStr: '1450.5',
  });
  const rowAaplRH = buildParsedRow({ broker: 'robinhood', symbol: 'AAPL' });
  const rowUnknown1 = buildParsedRow({ broker: 'robinhood', symbol: 'ZZZZ', rowIndex: 1 });
  const rowUnknown2 = buildParsedRow({ broker: 'robinhood', symbol: 'ZZZZ', rowIndex: 2 });
  const rowUnknown3 = buildParsedRow({ broker: 'robinhood', symbol: 'ZZZZ', rowIndex: 3 });
  const rowMsftRH = buildParsedRow({ broker: 'robinhood', symbol: 'MSFT' });

  const savedMappings: SavedMapping[] = [
    { broker: 'robinhood', brokerSymbol: 'MSFT', instrumentId: 'instr-msft-saved' },
  ];

  const result = matchInstruments(
    [rowInfy, rowAaplRH, rowUnknown1, rowUnknown2, rowUnknown3, rowMsftRH],
    TEST_INSTRUMENTS,
    savedMappings
  );

  const matchedInfy = result.find((r) => r.symbol === 'Infosys Ltd')!;
  assert.equal(matchedInfy.instrumentId, 'instr-infy-nse', 'Case 6a: ISIN on both NSE+BSE auto-picks NSE');
  assert.equal(matchedInfy.status, 'valid');

  const matchedAapl = result.find((r) => r.broker === 'robinhood' && r.symbol === 'AAPL')!;
  assert.equal(
    matchedAapl.instrumentId,
    'instr-aapl-nasdaq',
    'Case 6b: Robinhood AAPL matches the NASDAQ USD instrument, not the INR ticker-collision row'
  );

  const unmatchedRows = result.filter((r) => r.status === 'unmatched');
  assert.equal(unmatchedRows.length, 3, 'Case 6c: all 3 ZZZZ rows individually flagged unmatched');
  const unmatchedSymbolSet = new Set(unmatchedRows.map((r) => r.symbol));
  assert.equal(unmatchedSymbolSet.size, 1, 'Case 6c: unmatched set has one entry per unique symbol, even with 3 rows');

  const matchedMsft = result.find((r) => r.symbol === 'MSFT')!;
  assert.equal(
    matchedMsft.instrumentId,
    'instr-msft-saved',
    'Case 6d: saved mapping short-circuits and attaches its instrumentId (even though MSFT is absent from the instrument universe)'
  );
  assert.equal(matchedMsft.status, 'valid');
}

// ============================================================
// Case group 7: detectDuplicates
// ============================================================
function testDetectDuplicates(): void {
  const rowAlreadyImported = buildParsedRow({
    broker: 'robinhood',
    symbol: 'AAPL',
    quantity: 5,
    quantityStr: '5',
    price: 150,
    priceStr: '150',
    dateISO: '2023-09-18',
    instrumentId: 'instr-aapl-nasdaq',
  });
  const existingHash = computeRowHashes([
    {
      broker: rowAlreadyImported.broker,
      symbol: rowAlreadyImported.symbol,
      isin: rowAlreadyImported.isin,
      txnType: rowAlreadyImported.txnType!,
      quantityStr: rowAlreadyImported.quantityStr!,
      priceStr: rowAlreadyImported.priceStr,
      dateISO: rowAlreadyImported.dateISO!,
    },
  ])[0];

  const rowMatchesManual = buildParsedRow({
    broker: 'robinhood',
    symbol: 'MSFT',
    quantity: 2,
    quantityStr: '2',
    price: 300,
    priceStr: '300',
    dateISO: '2023-10-01',
    instrumentId: 'instr-msft-saved',
  });

  const rowAlreadyHeld = buildParsedRow({
    broker: 'groww',
    symbol: 'Infosys Ltd',
    isin: 'INE009A01021',
    quantity: 10,
    quantityStr: '10',
    price: 1450.5,
    priceStr: '1450.5',
    dateISO: '2026-07-10',
    instrumentId: 'instr-infy-nse',
  });

  const rowClean = buildParsedRow({
    broker: 'robinhood',
    symbol: 'NVDA',
    quantity: 3,
    quantityStr: '3',
    price: 400,
    priceStr: '400',
    dateISO: '2023-12-01',
    instrumentId: 'instr-nvda',
  });

  const rowLeftUnchanged = buildParsedRow({
    broker: 'robinhood',
    symbol: 'ZZZZ',
    status: 'unmatched',
    quantity: 1,
    quantityStr: '1',
    price: 10,
    priceStr: '10',
    dateISO: '2023-01-01',
  });

  const existingHashes = new Set([existingHash]);
  const existingManualTxns: ManualTxnCandidate[] = [
    { instrumentId: 'instr-msft-saved', type: 'BUY', quantity: 2, price: 300, dateISO: '2023-10-01' },
  ];
  const alreadyHeldInstrumentIds = new Set(['instr-infy-nse']);

  const result = detectDuplicates(
    [rowAlreadyImported, rowMatchesManual, rowAlreadyHeld, rowClean, rowLeftUnchanged],
    existingHashes,
    existingManualTxns,
    alreadyHeldInstrumentIds
  );

  const [outImported, outManual, outHeld, outClean, outUnchanged] = result;

  assert.equal(outImported.status, 'duplicate', 'Case 7a: hash already in existingHashes -> duplicate');
  assert.equal(outImported.statusReason, 'already imported');

  assert.equal(outManual.status, 'duplicate', 'Case 7b: field-matches an existing manual transaction -> duplicate');
  assert.equal(outManual.statusReason, 'matches a manual entry');

  assert.equal(outHeld.status, 'duplicate', 'Case 7c: Groww row whose instrument is already held -> duplicate');
  assert.equal(outHeld.statusReason, 'instrument already held — snapshot would double-count');

  assert.equal(outClean.status, 'valid', 'Case 7d: a clean new row stays valid');

  assert.equal(outUnchanged.status, 'unmatched', 'Case 7e: a row already unmatched is left unchanged by dedup');
}

function main(): void {
  testParseRobinhoodSample();
  testParseRobinhoodElevenColumnVariant();
  testParseGrowwSample();
  testParseGrowwNoHeader();
  testMatchInstruments();
  testDetectDuplicates();

  console.log(
    'PASS: import-parse -- both broker parsers, instrument matching, and duplicate detection correct against synthetic fixtures (real-file validation deferred to 04-07)'
  );
  process.exit(0);
}

main();
