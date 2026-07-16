/**
 * ALRT-01 / ALRT-03 — pure-function correctness proof for the Telegram
 * logic layer: the token-free, verifiable-NOW tier from
 * 05-RESEARCH-telegram-api.md (no bot token, no DB, no network).
 *
 * Run:  npm run test:telegram   (→ tsx scripts/telegram-logic-test.ts)
 *
 * This is a PURE unit test — no database, no network, no env vars. It exercises:
 *   - parseStartPayload: the /start <token> handshake text parser.
 *   - generateLinkToken / isValidLinkTokenShape: single-use high-entropy
 *     deep-link token generation + shape validation.
 *   - escapeHtml / buildPriceAlertMessage: HTML parse_mode message builder
 *     (never MarkdownV2 — sidesteps the 18-char escape footgun) with
 *     4096-char truncation.
 *
 * Same dependency-free style as scripts/price-pnl-test.ts and
 * scripts/import-parse-test.ts: node:assert/strict, console.log('PASS') +
 * process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means
 * the implementation is wrong; fix the src/lib/telegram/* modules instead.
 */
import assert from 'node:assert/strict';
import { parseStartPayload } from '../src/lib/telegram/parse-start-payload';
import { generateLinkToken, isValidLinkTokenShape } from '../src/lib/telegram/link-token';
import { escapeHtml, buildPriceAlertMessage } from '../src/lib/telegram/build-message';

// --- Case 1: parseStartPayload ---
function testParseStartPayloadValidToken(): void {
  const token = 'AbC-_123ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi'; // 44 chars, valid charset
  assert.equal(
    parseStartPayload(`/start ${token}`),
    token,
    'Case 1a: a well-formed /start <token> must parse to exactly the token'
  );
}

function testParseStartPayloadBareStart(): void {
  assert.equal(parseStartPayload('/start'), null, 'Case 1b: bare /start (no payload) must return null');
}

function testParseStartPayloadNonStartText(): void {
  assert.equal(parseStartPayload('hello'), null, 'Case 1c: non-/start text must return null');
}

function testParseStartPayloadSpaceInPayload(): void {
  assert.equal(
    parseStartPayload('/start tok with space'),
    null,
    'Case 1d: a payload containing whitespace must return null (single run only)'
  );
}

function testParseStartPayloadInvalidCharacters(): void {
  assert.equal(parseStartPayload('/start abc.def'), null, 'Case 1e: a payload with a "." must return null');
  assert.equal(parseStartPayload('/start abc!def'), null, 'Case 1f: a payload with a "!" must return null');
}

// --- Case 2: generateLinkToken / isValidLinkTokenShape ---
function testGenerateLinkTokenShape(): void {
  const token = generateLinkToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/, 'Case 2a: generateLinkToken must produce a 43-char base64url string');
  assert.equal(isValidLinkTokenShape(token), true, 'Case 2b: a freshly generated token must be a valid shape');
}

function testIsValidLinkTokenShapeRejectsBad(): void {
  assert.equal(isValidLinkTokenShape('bad token!'), false, 'Case 2c: a token with a space/! must be rejected');
  assert.equal(isValidLinkTokenShape(''), false, 'Case 2d: an empty string must be rejected');
}

function testGenerateLinkTokenEntropy(): void {
  const a = generateLinkToken();
  const b = generateLinkToken();
  assert.notEqual(a, b, 'Case 2e: two calls must produce different tokens (entropy)');
}

// --- Case 3: escapeHtml ---
function testEscapeHtml(): void {
  assert.equal(
    escapeHtml('a & b < c > d'),
    'a &amp; b &lt; c &gt; d',
    'Case 3a: escapeHtml must escape only &, <, > (in that order, & first)'
  );
  assert.equal(
    escapeHtml(`it's "quoted"`),
    `it's "quoted"`,
    'Case 3b: quotes/apostrophes must be left as-is (text-node escaping, not attribute)'
  );
}

// --- Case 4: buildPriceAlertMessage ---
function testBuildPriceAlertMessageAbove(): void {
  const message = buildPriceAlertMessage({
    displaySymbol: 'INFY & Co',
    direction: 'above',
    threshold: 1000,
    price: 1082.4,
    currency: 'INR',
  });
  assert.ok(message.includes('INFY &amp; Co'), 'Case 4a: message must contain the escaped display symbol');
  assert.ok(message.includes('1000'), 'Case 4b: message must contain the threshold');
  assert.ok(message.includes('1082.4'), 'Case 4c: message must contain the current price');
  assert.ok(message.includes('<b>'), 'Case 4d: message must use HTML <b> tag');
  assert.ok(message.includes('<code>'), 'Case 4e: message must use HTML <code> tag');
}

function testBuildPriceAlertMessageTruncation(): void {
  const message = buildPriceAlertMessage({
    displaySymbol: 'X'.repeat(5000),
    direction: 'below',
    threshold: 1,
    price: 1,
    currency: 'USD',
  });
  assert.ok(message.length <= 4096, 'Case 4f: an oversized input must be truncated to <=4096 chars');
}

function main(): void {
  testParseStartPayloadValidToken();
  testParseStartPayloadBareStart();
  testParseStartPayloadNonStartText();
  testParseStartPayloadSpaceInPayload();
  testParseStartPayloadInvalidCharacters();

  testGenerateLinkTokenShape();
  testIsValidLinkTokenShapeRejectsBad();
  testGenerateLinkTokenEntropy();

  testEscapeHtml();
  testBuildPriceAlertMessageAbove();
  testBuildPriceAlertMessageTruncation();

  console.log(
    'PASS: telegram-logic — Task 1 case groups passed (parse-start-payload/link-token/build-message correct)'
  );
  process.exit(0);
}

main();
