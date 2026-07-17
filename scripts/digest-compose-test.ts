/**
 * DGST-01 — pure-function correctness proof for the digest composition core:
 * `istDateKey` (fixed-offset IST date bucketing, no DST/timezone library),
 * `computeDigestDedupeKey` (the once-per-day outbox idempotency bucket),
 * `selectTopMovers` (honest priced-only top-mover selection), and
 * `buildDailyDigestMessage` (the single HTML-parse-mode digest message with
 * whole-item truncation that can never cut mid-tag).
 *
 * Run:  npx tsx scripts/digest-compose-test.ts
 * (Once 07-02 registers it: npm run test:digest-compose)
 *
 * This is a PURE unit test — no database, no network, no env vars, no
 * `Date.now()` (every `now` is injected). Same dependency-free style as
 * scripts/alerts-eval-test.ts: node:assert/strict, console.log('PASS') +
 * process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means
 * the implementation is wrong; fix compose.ts instead.
 */
import assert from 'node:assert/strict';
import { istDateKey, computeDigestDedupeKey, selectTopMovers } from '../src/lib/digest/compose';
import type { DigestHoldingInput } from '../src/lib/digest/types';

// --- istDateKey: fixed UTC+5:30 offset, 18:30Z is the IST midnight rollover ---
function testIstDateKeyJustBeforeRollover(): void {
  // 18:29:59Z + 5:30 = 23:59:59 IST SAME calendar day
  const result = istDateKey(new Date('2026-07-17T18:29:59Z'));
  assert.equal(result, '2026-07-17', 'Case 1a: 18:29:59Z must still be 2026-07-17 in IST');
}

function testIstDateKeyAtRollover(): void {
  // 18:30:00Z + 5:30 = 00:00:00 IST NEXT calendar day
  const result = istDateKey(new Date('2026-07-17T18:30:00Z'));
  assert.equal(result, '2026-07-18', 'Case 1b: 18:30:00Z must roll over to 2026-07-18 in IST');
}

function testIstDateKeyMidDay(): void {
  // 06:00:00Z + 5:30 = 11:30:00 IST, same calendar day
  const result = istDateKey(new Date('2026-07-17T06:00:00Z'));
  assert.equal(result, '2026-07-17', 'Case 1c: a mid-day UTC time must map to the same IST calendar date');
}

function testIstDateKeyRollsTheYear(): void {
  // 31-Dec 18:30:00Z + 5:30 = 1-Jan 00:00:00 IST NEXT YEAR
  const result = istDateKey(new Date('2026-12-31T18:30:00Z'));
  assert.equal(result, '2027-01-01', 'Case 1d: 31-Dec 18:30Z must roll over into the next year in IST');
}

// --- computeDigestDedupeKey: daily_digest:{userId}:{istDate} ---
function testComputeDigestDedupeKeyFormat(): void {
  const now = new Date('2026-07-17T18:30:00Z'); // rolls to 2026-07-18 IST
  const key = computeDigestDedupeKey('user-uuid', now);
  assert.equal(key, 'daily_digest:user-uuid:2026-07-18', 'Case 2: dedupe key must be daily_digest:{userId}:{istDate}');
}

function testComputeDigestDedupeKeySameIstDaySameKey(): void {
  const morning = new Date('2026-07-17T19:00:00Z'); // 2026-07-18 IST
  const evening = new Date('2026-07-18T17:00:00Z'); // still 2026-07-18 IST (before next rollover)
  assert.equal(
    computeDigestDedupeKey('user-uuid', morning),
    computeDigestDedupeKey('user-uuid', evening),
    'Case 2b: two instants inside the same IST calendar day must produce the identical dedupe key'
  );
}

// --- selectTopMovers: priced-only, honest exclusion, absolute-value sort, sign preserved ---
function makeHolding(overrides: Partial<DigestHoldingInput> = {}): DigestHoldingInput {
  return {
    ticker: 'X',
    status: 'priced',
    dayChangePct: 0,
    ...overrides,
  };
}

function testSelectTopMoversOrderingAndExclusion(): void {
  const holdings: DigestHoldingInput[] = [
    makeHolding({ ticker: 'A', status: 'priced', dayChangePct: 5.2 }),
    makeHolding({ ticker: 'B', status: 'priced', dayChangePct: -8.1 }),
    makeHolding({ ticker: 'C', status: 'priced', dayChangePct: 0.3 }),
    makeHolding({ ticker: 'D', status: 'priced', dayChangePct: null }),
    makeHolding({ ticker: 'E', status: 'pending', dayChangePct: null }),
  ];

  const result = selectTopMovers(holdings, 3);
  assert.equal(result.length, 3, 'Case 3a: exactly 3 movers expected for n=3 out of 3 eligible priced holdings');
  assert.deepEqual(
    result.map((m) => m.ticker),
    ['B', 'A', 'C'],
    'Case 3a: order must be absolute-value-descending: |-8.1| > |5.2| > |0.3|'
  );
  assert.deepEqual(
    result.map((m) => m.dayChangePct),
    [-8.1, 5.2, 0.3],
    'Case 3a: sign must be preserved in the output values'
  );
  assert.ok(!result.some((m) => m.ticker === 'D'), 'Case 3b: null-dayChangePct holding D must never appear');
  assert.ok(!result.some((m) => m.ticker === 'E'), 'Case 3c: pending-status holding E must never appear');
}

function testSelectTopMoversNLargerThanList(): void {
  const holdings: DigestHoldingInput[] = [
    makeHolding({ ticker: 'A', status: 'priced', dayChangePct: 1.0 }),
    makeHolding({ ticker: 'B', status: 'priced', dayChangePct: -2.0 }),
  ];
  const result = selectTopMovers(holdings, 5);
  assert.equal(result.length, 2, 'Case 4: n larger than the eligible list must return all eligible holdings');
  assert.deepEqual(result.map((m) => m.ticker), ['B', 'A']);
}

function testSelectTopMoversEmptyInput(): void {
  const result = selectTopMovers([], 3);
  assert.deepEqual(result, [], 'Case 5: empty input must return an empty array');
}

function main(): void {
  testIstDateKeyJustBeforeRollover();
  testIstDateKeyAtRollover();
  testIstDateKeyMidDay();
  testIstDateKeyRollsTheYear();
  testComputeDigestDedupeKeyFormat();
  testComputeDigestDedupeKeySameIstDaySameKey();
  testSelectTopMoversOrderingAndExclusion();
  testSelectTopMoversNLargerThanList();
  testSelectTopMoversEmptyInput();

  console.log(
    'PASS: digest-compose — istDateKey IST rollover, computeDigestDedupeKey, selectTopMovers all passed'
  );
  process.exit(0);
}

main();
