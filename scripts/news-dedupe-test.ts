/**
 * NEWS-02 — pure-function correctness proof for the news dedup primitives:
 * `normalizeTitle`, `computeTitleHash`, and `canonicalizeUrl`.
 *
 * Run:  npx tsx scripts/news-dedupe-test.ts
 * (Once this plan registers it: npm run test:news-dedupe)
 *
 * This is a PURE unit test — no database, no network, no env vars, no
 * Date.now()/randomness. Same dependency-free style as
 * scripts/alerts-eval-test.ts / scripts/rls-isolation-test.ts:
 * node:assert/strict, console.log('PASS') + process.exit(0) on success,
 * throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means
 * the implementation is wrong; fix dedupe.ts instead.
 */
import assert from 'node:assert/strict';
import { normalizeTitle, computeTitleHash, canonicalizeUrl } from '../src/lib/news/dedupe';

// --- Case 1: Google News ' - Publisher' suffix strips; publisher's own title normalizes identically ---
function testGoogleSuffixStrip(): void {
  const googleNewsTitle =
    '2 reasons why Infosys, TCS and other IT stocks are rising today - The Economic Times';
  const publisherTitle = '2 Reasons Why Infosys, TCS and Other IT Stocks Are Rising Today';
  assert.equal(
    normalizeTitle(googleNewsTitle),
    normalizeTitle(publisherTitle),
    'Case 1: Google News suffix + case/punctuation differences must normalize identically'
  );
}

// --- Case 2: computeTitleHash equality/inequality + 64-char lowercase hex format ---
function testComputeTitleHash(): void {
  const googleNewsTitle =
    '2 reasons why Infosys, TCS and other IT stocks are rising today - The Economic Times';
  const publisherTitle = '2 Reasons Why Infosys, TCS and Other IT Stocks Are Rising Today';
  const hashA = computeTitleHash(googleNewsTitle);
  const hashB = computeTitleHash(publisherTitle);
  assert.equal(hashA, hashB, 'Case 2a: same underlying story must hash identically');
  assert.match(hashA, /^[0-9a-f]{64}$/, 'Case 2b: hash must be 64-char lowercase hex');

  const differentTitle = 'RBI holds repo rate steady amid inflation concerns';
  const hashC = computeTitleHash(differentTitle);
  assert.notEqual(hashA, hashC, 'Case 2c: genuinely different titles must hash differently');
}

// --- Case 3: whitespace collapse, trim, lowercase, punctuation strip ---
function testNormalizeTitlePunctuationAndWhitespace(): void {
  const withPossessiveAndEllipsis = "JSW Steel's   profit doubles…";
  const plain = 'JSW Steels profit doubles';
  assert.equal(
    normalizeTitle(withPossessiveAndEllipsis),
    normalizeTitle(plain),
    'Case 3: possessive apostrophe, ellipsis, and whitespace runs must normalize to the same string as the plain form'
  );
}

// --- Case 4: title with NO ' - ' separator is unchanged apart from case/punct/whitespace normalization ---
function testNoSeparatorUnchanged(): void {
  const title = 'Sensex Rallies 500 Points On Strong Global Cues';
  const expected = 'sensex rallies 500 points on strong global cues';
  assert.equal(
    normalizeTitle(title),
    expected,
    'Case 4: a title without a " - " separator must only be case/punct/whitespace normalized'
  );
}

// --- Case 5: canonicalizeUrl strips fragment, tracking params, lowercases scheme+host, strips trailing slash; keeps other params ---
function testCanonicalizeUrl(): void {
  const messy =
    'HTTPS://WWW.Example.COM/News/Article/?utm_source=twitter&utm_medium=social&utm_campaign=x&utm_term=y&utm_content=z&fbclid=abc123&gclid=def456&id=42#section-2';
  const canonical = canonicalizeUrl(messy);
  assert.equal(
    canonical,
    'https://www.example.com/News/Article?id=42',
    'Case 5: fragment, all tracking params stripped; non-tracking param kept; scheme+host lowercased; trailing slash removed'
  );

  const root = 'https://Example.com/';
  assert.equal(canonicalizeUrl(root), 'https://example.com/', 'Case 5b: root path "/" must be preserved, not stripped');
}

// --- Case 6: unparseable URL returns trimmed input, never throws ---
function testCanonicalizeUrlUnparseable(): void {
  const result = canonicalizeUrl('  not a url  ');
  assert.equal(result, 'not a url', 'Case 6: unparseable input must be returned trimmed, no throw');
}

// --- Case 7: purity — same input twice yields identical output ---
function testPurity(): void {
  const title = 'Reliance Industries Q1 profit beats estimates - Business Standard';
  assert.equal(normalizeTitle(title), normalizeTitle(title), 'Case 7a: normalizeTitle must be pure');
  assert.equal(computeTitleHash(title), computeTitleHash(title), 'Case 7b: computeTitleHash must be pure');

  const url = 'https://example.com/a/b?utm_source=x&id=1#frag';
  assert.equal(canonicalizeUrl(url), canonicalizeUrl(url), 'Case 7c: canonicalizeUrl must be pure');
}

function main(): void {
  testGoogleSuffixStrip();
  testComputeTitleHash();
  testNormalizeTitlePunctuationAndWhitespace();
  testNoSeparatorUnchanged();
  testCanonicalizeUrl();
  testCanonicalizeUrlUnparseable();
  testPurity();

  console.log(
    'PASS: news-dedupe — all 7 case groups passed (normalizeTitle Google-suffix strip, computeTitleHash sha256 equality/format, canonicalizeUrl tracking-param + fragment strip, purity)'
  );
  process.exit(0);
}

main();
