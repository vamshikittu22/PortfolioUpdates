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
import {
  istDateKey,
  computeDigestDedupeKey,
  selectTopMovers,
  buildDailyDigestMessage,
} from '../src/lib/digest/compose';
import type { DigestHoldingInput, DigestMessageInput, DigestNewsItem } from '../src/lib/digest/types';

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

// --- buildDailyDigestMessage: full happy path ---
function baseInput(overrides: Partial<DigestMessageInput> = {}): DigestMessageInput {
  return {
    istDate: '2026-07-18',
    baseCurrency: 'INR',
    totalCurrentValue: 152345,
    totalDayChange: 2345.5,
    hasHoldings: true,
    fxUnavailable: false,
    fxExcludedCurrency: null,
    topMovers: [
      { ticker: 'INFY', dayChangePct: 5.2 },
      { ticker: 'TCS', dayChangePct: -3.1 },
      { ticker: 'WIPRO', dayChangePct: 0.4 },
    ],
    news: [
      { headline: 'Infosys wins large deal', summary: 'A multi-year contract.', url: 'https://example.com/1' },
      { headline: 'TCS Q1 results beat estimates', summary: 'Revenue up 8% YoY.', url: 'https://example.com/2' },
    ],
    newsDegraded: false,
    ...overrides,
  };
}

function testBuildDailyDigestMessageHappyPath(): void {
  const message = buildDailyDigestMessage(baseInput());
  assert.ok(message.includes('<b>'), 'Case 6a: message must contain an HTML <b> header');
  assert.ok(message.includes('2026-07-18'), 'Case 6a: header must include the istDate');
  assert.ok(message.includes('INFY'), 'Case 6a: must include mover ticker INFY');
  assert.ok(message.includes('TCS'), 'Case 6a: must include mover ticker TCS');
  assert.ok(message.includes('WIPRO'), 'Case 6a: must include mover ticker WIPRO');
  assert.ok(message.includes('+5.2%'), 'Case 6a: must include signed positive percent for INFY');
  assert.ok(message.includes('-3.1%'), 'Case 6a: must include signed negative percent for TCS');
  assert.ok(message.includes('Infosys wins large deal'), 'Case 6a: must include first news headline');
  assert.ok(message.includes('TCS Q1 results beat estimates'), 'Case 6a: must include second news headline');
  assert.ok(message.length <= 4096, 'Case 6a: message must never exceed 4096 chars');
}

// --- buildDailyDigestMessage: escaping ---
function testBuildDailyDigestMessageEscaping(): void {
  const input = baseInput({
    topMovers: [{ ticker: 'M&M', dayChangePct: 1.2 }],
    news: [
      {
        headline: '<script>alert(1)</script> & more',
        summary: 'safe summary',
        url: 'https://example.com/3',
      },
    ],
  });
  const message = buildDailyDigestMessage(input);
  assert.ok(message.includes('M&amp;M'), 'Case 7a: ticker M&M must be escaped to M&amp;M');
  assert.ok(message.includes('&lt;script&gt;'), 'Case 7b: headline script tag must be escaped');
  assert.ok(!message.includes('<script>'), 'Case 7c: raw <script> must NEVER appear in the output');
}

// --- buildDailyDigestMessage: honest empty/degraded states ---
function testBuildDailyDigestMessageNoHoldings(): void {
  const input = baseInput({
    hasHoldings: false,
    totalCurrentValue: null,
    totalDayChange: null,
    topMovers: [],
  });
  const message = buildDailyDigestMessage(input);
  assert.ok(/no holdings/i.test(message), 'Case 8a: hasHoldings=false must render honest "No holdings" wording');
  assert.ok(!/152345|152,345/.test(message), 'Case 8a: must never fabricate a total when there are no holdings');
}

function testBuildDailyDigestMessagePricesPending(): void {
  const input = baseInput({
    hasHoldings: true,
    totalCurrentValue: null,
    totalDayChange: null,
    topMovers: [],
  });
  const message = buildDailyDigestMessage(input);
  assert.ok(/pending/i.test(message), 'Case 8b: totalCurrentValue=null with hasHoldings=true must render "pending" wording');
  assert.ok(!/\b0\b/.test(message.split('\n')[1] ?? ''), 'Case 8b: must never fabricate a 0-as-value total');
}

function testBuildDailyDigestMessageFxUnavailable(): void {
  const input = baseInput({ fxUnavailable: true, fxExcludedCurrency: 'USD' });
  const message = buildDailyDigestMessage(input);
  assert.ok(message.includes('USD'), 'Case 8c: fxUnavailable exclusion note must name the excluded currency USD');
}

function testBuildDailyDigestMessageNoNews(): void {
  const empty = buildDailyDigestMessage(baseInput({ news: [] }));
  assert.ok(
    empty.includes('No summarized portfolio news today.'),
    'Case 8d: empty news must render the exact honest empty-state string'
  );

  const degraded = buildDailyDigestMessage(baseInput({ newsDegraded: true }));
  assert.ok(
    degraded.includes('No summarized portfolio news today.'),
    'Case 8e: newsDegraded=true must render the exact honest empty-state string even if news is non-empty'
  );
}

// --- buildDailyDigestMessage: truncation never cuts mid-tag, only drops whole news items ---
function testBuildDailyDigestMessageTruncation(): void {
  const bigHeadline = 'A'.repeat(280);
  const news: DigestNewsItem[] = Array.from({ length: 50 }, (_, i) => ({
    headline: `${bigHeadline} #${i}`,
    summary: 'B'.repeat(20),
    url: `https://example.com/${i}`,
  }));
  const input = baseInput({ news });
  const message = buildDailyDigestMessage(input);

  assert.ok(message.length <= 4096, 'Case 9a: truncated message must never exceed 4096 chars');

  // Portfolio snapshot section must remain fully intact — truncation only ever
  // drops news items, never the snapshot.
  assert.ok(message.includes('INFY'), 'Case 9b: snapshot/movers section must remain intact after truncation');
  assert.ok(message.includes('2026-07-18'), 'Case 9b: header must remain intact after truncation');

  // Every INCLUDED news item must be present verbatim (whole-item truncation).
  let lastIncludedIndex = -1;
  for (let i = 0; i < news.length; i++) {
    if (message.includes(`${bigHeadline} #${i}`)) {
      assert.equal(i, lastIncludedIndex + 1, 'Case 9c: included items must be a contiguous prefix starting at 0');
      lastIncludedIndex = i;
    }
  }
  assert.ok(lastIncludedIndex >= 0, 'Case 9c: at least one news item must be included');
  assert.ok(lastIncludedIndex < news.length - 1, 'Case 9c: with 50 oversized items, truncation must actually occur');

  // The first omitted item must be ENTIRELY absent — not partially cut.
  const firstOmitted = lastIncludedIndex + 1;
  assert.ok(
    !message.includes(`${bigHeadline} #${firstOmitted}`),
    'Case 9d: the first omitted item must be entirely absent, never partially present'
  );

  // Never cuts mid-tag: every opened <b> has a matching closing </b>.
  const openCount = (message.match(/<b>/g) ?? []).length;
  const closeCount = (message.match(/<\/b>/g) ?? []).length;
  assert.equal(openCount, closeCount, 'Case 9e: every <b> must have a matching </b> — no mid-tag cut');
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
  testBuildDailyDigestMessageHappyPath();
  testBuildDailyDigestMessageEscaping();
  testBuildDailyDigestMessageNoHoldings();
  testBuildDailyDigestMessagePricesPending();
  testBuildDailyDigestMessageFxUnavailable();
  testBuildDailyDigestMessageNoNews();
  testBuildDailyDigestMessageTruncation();

  console.log(
    'PASS: digest-compose — istDateKey IST rollover, computeDigestDedupeKey, selectTopMovers, buildDailyDigestMessage (escaping, honest empties, whole-item truncation) all passed'
  );
  process.exit(0);
}

main();
