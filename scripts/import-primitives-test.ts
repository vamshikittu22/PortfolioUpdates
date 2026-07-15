/**
 * IMPT-01 / IMPT-02 / IMPT-05 — pure-function correctness proof for the
 * import parsing primitives (money/quantity/date normalization, row-hash
 * idempotency, broker detection).
 *
 * Run:  npm run test:import-primitives   (-> tsx scripts/import-primitives-test.ts)
 *
 * This is a PURE unit test — no database, no network, no real broker file.
 * It exercises:
 *   - parseMoney / parseQuantity: unparseable input -> null, NEVER a
 *     fabricated 0 (this project's cardinal sin, 04-RESEARCH Anti-Patterns).
 *   - parseRobinhoodDate / parseGrowwDate: both broker date formats
 *     normalize to ISO YYYY-MM-DD; a non-date (disclaimer/footer) -> null.
 *   - computeRowHashes: stable across repeated calls (purity), occurrence-
 *     indexed so two legitimately-identical same-day rows both survive
 *     (Pitfall 4) and re-import stays idempotent, and drift-free against
 *     float round-tripping (Pitfall 5).
 *   - detectBroker: zip magic vs CSV header sniff, no false positives.
 *
 * Same dependency-free style as scripts/price-pnl-test.ts and
 * scripts/derive-holdings-test.ts: node:assert/strict, console.log('PASS')
 * + process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means
 * the implementation is wrong; fix normalize.ts / row-hash.ts /
 * detect-broker.ts instead.
 */
import assert from 'node:assert/strict';
import {
  parseMoney,
  parseQuantity,
  parseRobinhoodDate,
  parseGrowwDate,
} from '../src/lib/import/normalize';
import { computeRowHashes } from '../src/lib/import/row-hash';
import { detectBroker } from '../src/lib/import/detect-broker';
import type { NormalizedRow } from '../src/lib/import/types';

// --- Case group 1: parseMoney ---
function testParseMoney(): void {
  assert.equal(parseMoney('($43.64)'), -43.64, 'Case 1a: parenthesized negative');
  assert.equal(parseMoney('$1,234.50'), 1234.5, 'Case 1b: $ prefix + thousands comma');
  assert.equal(parseMoney(''), null, 'Case 1c: empty string -> null, never 0');
  assert.equal(parseMoney('—'), null, 'Case 1d: em-dash placeholder -> null');
  assert.equal(parseMoney('$--'), null, 'Case 1e: garbage after $ -> null');
  assert.equal(parseMoney('abc'), null, 'Case 1f: non-numeric -> null');
  assert.equal(parseMoney(null), null, 'Case 1g: null input -> null');
}

// --- Case group 2: parseQuantity ---
function testParseQuantity(): void {
  assert.equal(parseQuantity('0.123456'), 0.123456, 'Case 2a: fractional share to 6dp');
  assert.equal(parseQuantity('1,000'), 1000, 'Case 2b: thousands comma');
  assert.equal(parseQuantity('0'), null, 'Case 2c: zero -> null (CHECK quantity > 0)');
  assert.equal(parseQuantity('-5'), null, 'Case 2d: negative -> null');
  assert.equal(parseQuantity(''), null, 'Case 2e: empty -> null');
  assert.equal(parseQuantity(null), null, 'Case 2f: null -> null');
}

// --- Case group 3: parseRobinhoodDate (M/D/YYYY) ---
function testParseRobinhoodDate(): void {
  assert.equal(parseRobinhoodDate('9/18/2023'), '2023-09-18', 'Case 3a: single-digit month/day');
  assert.equal(parseRobinhoodDate('12/1/2024'), '2024-12-01', 'Case 3b: single-digit day');
  assert.equal(
    parseRobinhoodDate('Robinhood Securities LLC'),
    null,
    'Case 3c: disclaimer/footer text -> null, not a fabricated date'
  );
  assert.equal(parseRobinhoodDate(null), null, 'Case 3d: null -> null');
}

// --- Case group 4: parseGrowwDate (DD-MM-YYYY / DD MMM YYYY) ---
function testParseGrowwDate(): void {
  assert.equal(parseGrowwDate('18-09-2023'), '2023-09-18', 'Case 4a: DD-MM-YYYY');
  assert.equal(parseGrowwDate('18 Sep 2023'), '2023-09-18', 'Case 4b: DD MMM YYYY');
  assert.equal(parseGrowwDate('18/09/2023'), '2023-09-18', 'Case 4c: DD/MM/YYYY');
  assert.equal(parseGrowwDate('not a date'), null, 'Case 4d: unrecognized -> null');
  assert.equal(parseGrowwDate(null), null, 'Case 4e: null -> null');
}

// --- Case group 5: computeRowHashes (stability, occurrence index, drift-free) ---
function baseRow(overrides: Partial<NormalizedRow> = {}): NormalizedRow {
  return {
    broker: 'robinhood',
    symbol: 'AAPL',
    isin: null,
    txnType: 'BUY',
    quantityStr: '10',
    priceStr: '150.00',
    dateISO: '2023-09-18',
    ...overrides,
  };
}

function testComputeRowHashesStability(): void {
  const r = baseRow();
  const first = computeRowHashes([r]);
  const second = computeRowHashes([r]);
  assert.deepEqual(first, second, 'Case 5a: identical input array yields identical output every call');
}

function testComputeRowHashesOccurrenceIndex(): void {
  const r1 = baseRow();
  const r2 = baseRow(); // identical tuple, legitimately duplicate same-day trade
  const hashes = computeRowHashes([r1, r2]);
  assert.equal(hashes.length, 2, 'Case 5b: two rows in, two hashes out');
  assert.notEqual(
    hashes[0],
    hashes[1],
    'Case 5b: two identical rows get DIFFERENT hashes (occurrence index 1 vs 2) so neither is silently dropped nor re-import duplicated'
  );
}

function testComputeRowHashesDiffersOnQuantity(): void {
  const r1 = baseRow({ quantityStr: '10' });
  const r2 = baseRow({ quantityStr: '20' });
  const hashes = computeRowHashes([r1, r2]);
  assert.notEqual(hashes[0], hashes[1], 'Case 5c: rows differing only in quantityStr get different hashes');
}

function testComputeRowHashesDriftFree(): void {
  // Pitfall 5: hashing must operate on normalized STRINGS. A row whose
  // quantityStr is '36' must hash identically to a row whose quantityStr was
  // independently normalized (e.g. via a parseFloat round-trip upstream)
  // to the SAME string '36' -- never '36.000000' vs '36' producing drift.
  const rDirect = baseRow({ quantityStr: '36' });
  const rRoundTripped = baseRow({ quantityStr: String(parseFloat('36.000000')) });
  assert.equal(rRoundTripped.quantityStr, '36', 'Case 5d: round-tripped normalization reaches the same string');
  const hashDirect = computeRowHashes([rDirect]);
  const hashRoundTripped = computeRowHashes([rRoundTripped]);
  assert.deepEqual(
    hashDirect,
    hashRoundTripped,
    'Case 5d: identical normalized strings hash identically regardless of float provenance'
  );
}

// --- Case group 6: detectBroker ---
function testDetectBroker(): void {
  const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  assert.equal(detectBroker(zipBytes, 'x.xlsx'), 'groww', 'Case 6a: zip magic (PK) -> groww');

  const robinhoodCsv = new TextEncoder().encode(
    '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"\n'
  );
  assert.equal(
    detectBroker(robinhoodCsv, 'x.csv'),
    'robinhood',
    'Case 6b: "Trans Code" + "Activity Date" CSV header -> robinhood'
  );

  const unknownCsv = new TextEncoder().encode('hello,world\n1,2\n');
  assert.equal(detectBroker(unknownCsv, 'x.csv'), 'unknown', 'Case 6c: unrecognized bytes -> unknown, honest fallback');
}

function main(): void {
  testParseMoney();
  testParseQuantity();
  testParseRobinhoodDate();
  testParseGrowwDate();
  testComputeRowHashesStability();
  testComputeRowHashesOccurrenceIndex();
  testComputeRowHashesDiffersOnQuantity();
  testComputeRowHashesDriftFree();
  testDetectBroker();

  console.log(
    'PASS: import-primitives — all 6 case groups passed (money/quantity/date normalization, row-hash idempotency, broker detection correct)'
  );
  process.exit(0);
}

main();
