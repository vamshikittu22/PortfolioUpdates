/**
 * ALRT-04 — pure-function correctness proof for the news-alert message
 * builder + permanent dedupe key: `buildNewsAlertMessage` (HTML parse_mode,
 * every external field escaped, attribute-hardened href, 4096-char
 * truncation) and `computeNewsAlertDedupeKey` (the permanent
 * `news_alert:{userId}:{urlHash}` shape prescribed at
 * src/lib/alerts/evaluate.ts:102).
 *
 * Run:  npm run test:news-alert   (-> tsx scripts/news-alert-test.ts)
 *
 * This is a PURE unit test — no database, no network, no env vars, no clock.
 * Same dependency-free style as scripts/telegram-logic-test.ts /
 * scripts/news-match-test.ts: node:assert/strict, console.log('PASS') +
 * process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means
 * the implementation is wrong; fix src/lib/news/build-news-message.ts instead.
 */
import assert from 'node:assert/strict';
import {
  buildNewsAlertMessage,
  computeNewsAlertDedupeKey,
} from '../src/lib/news/build-news-message';

const BASE_INPUT = {
  displaySymbols: ['INFY'],
  headline: 'Infosys wins large deal',
  whyItMatters: 'Revenue guidance likely to rise.',
  source: 'Economic Times',
  url: 'https://example.com/infy-deal',
};

// --- Case 1: shape, escaping order, no double-escape ---
function testMessageShapeAndEscaping(): void {
  const message = buildNewsAlertMessage(BASE_INPUT);
  assert.ok(message.includes('\u{1F4F0}'), 'Case 1a: message must contain the 📰 emoji');
  assert.ok(message.includes('<b>INFY</b>'), 'Case 1b: symbols must be bold');
  assert.ok(message.includes('Infosys wins large deal'), 'Case 1c: headline must be present');

  const withHostileHeadline = buildNewsAlertMessage({
    ...BASE_INPUT,
    headline: '<script>&',
  });
  assert.ok(
    withHostileHeadline.includes('&lt;script&gt;&amp;'),
    'Case 1d: a headline containing <script>& must arrive entity-escaped, & escaped FIRST (no double-escape)'
  );
  assert.ok(
    !withHostileHeadline.includes('<script>'),
    'Case 1e: the raw <script> tag must never survive unescaped'
  );
}

// --- Case 2: whyItMatters null vs non-empty ---
function testWhyItMattersPresence(): void {
  const withoutWhy = buildNewsAlertMessage({ ...BASE_INPUT, whyItMatters: null });
  const expectedWithoutWhy = `\u{1F4F0} <b>INFY</b>: Infosys wins large deal\n<a href="https://example.com/infy-deal">Economic Times</a>`;
  assert.equal(
    withoutWhy,
    expectedWithoutWhy,
    'Case 2a: null whyItMatters must produce no orphan blank line (header directly followed by anchor)'
  );
  assert.ok(!withoutWhy.includes('\n\n'), 'Case 2b: null whyItMatters must never leave a double newline');

  const withWhy = buildNewsAlertMessage({
    ...BASE_INPUT,
    whyItMatters: 'Why <it> matters & more',
  });
  assert.ok(
    withWhy.includes('\nWhy &lt;it&gt; matters &amp; more\n'),
    'Case 2c: a non-empty whyItMatters must be present, escaped, and its own line'
  );
}

// --- Case 3: href attribute hardening (quote stripped, anchor closes correctly) ---
function testHrefQuoteStripping(): void {
  const message = buildNewsAlertMessage({
    ...BASE_INPUT,
    url: 'https://example.com/a"b',
  });
  assert.ok(
    message.includes('<a href="https://example.com/ab">Economic Times</a>'),
    'Case 3: a `"` inside the url must be stripped before interpolation and the anchor tag must close correctly'
  );
  assert.ok(!message.includes('a"b'), 'Case 3b: the raw quoted url must never survive verbatim');
}

// --- Case 4: truncation ---
function testTruncation(): void {
  const message = buildNewsAlertMessage({
    ...BASE_INPUT,
    headline: 'A'.repeat(5000),
  });
  assert.equal(message.length, 4096, 'Case 4: a 5000-char headline must produce output truncated to exactly 4096 chars');
}

// --- Case 5: dedupe key shape, determinism, uniqueness ---
function testDedupeKeyShape(): void {
  const key = computeNewsAlertDedupeKey('user-1', 'https://example.com/a');
  assert.match(
    key,
    /^news_alert:[^:]+:[0-9a-f]{64}$/,
    'Case 5a: key must match news_alert:{userId}:{64-hex-char urlHash}'
  );
}

function testDedupeKeyDeterminism(): void {
  const a = computeNewsAlertDedupeKey('user-1', 'https://example.com/a');
  const b = computeNewsAlertDedupeKey('user-1', 'https://example.com/a');
  assert.equal(a, b, 'Case 5b: same (user, url) must produce an identical key every time');
}

function testDedupeKeyDiffersByUrlAndUser(): void {
  const base = computeNewsAlertDedupeKey('user-1', 'https://example.com/a');
  const diffUrl = computeNewsAlertDedupeKey('user-1', 'https://example.com/b');
  const diffUser = computeNewsAlertDedupeKey('user-2', 'https://example.com/a');
  assert.notEqual(base, diffUrl, 'Case 5c: a different url must produce a different key');
  assert.notEqual(base, diffUser, 'Case 5d: a different user must produce a different key');
}

function main(): void {
  testMessageShapeAndEscaping();
  testWhyItMattersPresence();
  testHrefQuoteStripping();
  testTruncation();
  testDedupeKeyShape();
  testDedupeKeyDeterminism();
  testDedupeKeyDiffersByUrlAndUser();

  console.log(
    'PASS: news-alert — buildNewsAlertMessage (escaping/truncation/href-hardening) + computeNewsAlertDedupeKey (permanent news_alert:{userId}:{urlHash}) all correct'
  );
  process.exit(0);
}

main();
