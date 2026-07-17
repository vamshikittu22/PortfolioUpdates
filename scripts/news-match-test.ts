/**
 * NEWS-02 — pure-function correctness proof for the instrument matcher:
 * `matchInstruments` (case-sensitive whole-token symbol rule, case-insensitive
 * full-phrase company-name rule) and `stripCompanySuffixes` (legal-suffix
 * stripping helper, also reused by 06-08's Google News query builder).
 *
 * Run:  npx tsx scripts/news-match-test.ts
 * (Once 06-02 registers it: npm run test:news-match)
 *
 * This is a PURE unit test — no database, no network, no env vars, no clock.
 * Same dependency-free style as scripts/alerts-eval-test.ts /
 * scripts/telegram-logic-test.ts: node:assert/strict, console.log('PASS') +
 * process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means the
 * implementation is wrong; fix match.ts instead.
 */
import assert from 'node:assert/strict';
import { matchInstruments, stripCompanySuffixes } from '../src/lib/news/match';
import type { MatchCandidate } from '../src/lib/news/match';

// Candidates modeled on the real seed instruments (06-RESEARCH-codebase).
const CANDIDATES: MatchCandidate[] = [
  { instrumentId: 'infy', symbol: 'INFY', displayName: 'Infosys Ltd' },
  { instrumentId: 'tcs', symbol: 'TCS', displayName: 'Tata Consultancy Services Ltd' },
  { instrumentId: 'lt', symbol: 'LT', displayName: 'Larsen & Toubro Ltd' },
  { instrumentId: 'mm', symbol: 'M&M', displayName: 'Mahindra & Mahindra Ltd' },
  { instrumentId: 'aapl', symbol: 'AAPL', displayName: 'Apple Inc' },
  { instrumentId: 'tsla', symbol: 'TSLA', displayName: 'Tesla Inc' },
];

function findMatch(results: ReturnType<typeof matchInstruments>, instrumentId: string) {
  return results.find((r) => r.instrumentId === instrumentId);
}

// --- Case 1: symbol hit ---
function testSymbolHit(): void {
  const result = matchInstruments('INFY jumps 4% after results', CANDIDATES);
  assert.equal(result.length, 1, 'Case 1: expected exactly one match');
  assert.equal(result[0].instrumentId, 'infy');
  assert.equal(result[0].matchedVia, 'symbol');
}

// --- Case 2: symbol boundary traps ---
function testSymbolBoundaryTraps(): void {
  assert.equal(
    matchInstruments('INFYX Corp lists', CANDIDATES).length,
    0,
    'Case 2a: INFYX must not match INFY (trailing alnum breaks the right boundary)'
  );
  assert.equal(
    matchInstruments('reinfy', CANDIDATES).length,
    0,
    'Case 2b: reinfy must not match INFY (case + boundary)'
  );
  assert.equal(
    findMatch(matchInstruments('attics look great', CANDIDATES), 'tcs'),
    undefined,
    'Case 2c: attics must not match TCS'
  );
}

// --- Case 3: symbol case-sensitivity ---
function testSymbolCaseSensitivity(): void {
  assert.equal(
    findMatch(matchInstruments('infy gains', CANDIDATES), 'infy'),
    undefined,
    'Case 3a: lowercase infy must not match symbol INFY (case-sensitive)'
  );
  assert.equal(
    findMatch(matchInstruments('Lt. Governor speaks', CANDIDATES), 'lt'),
    undefined,
    'Case 3b: "Lt." must not match symbol LT (case-sensitive: Lt !== LT)'
  );
  const result = matchInstruments('L&T wins order, LT stock up', CANDIDATES);
  const ltMatch = findMatch(result, 'lt');
  assert.ok(ltMatch, 'Case 3c: the standalone "LT" token must match');
  assert.equal(ltMatch!.matchedVia, 'symbol');
}

// --- Case 4: regex specials in symbols (M&M) ---
function testRegexSpecialsInSymbols(): void {
  const matches = matchInstruments('M&M launches new SUV', CANDIDATES);
  const mmMatch = findMatch(matches, 'mm');
  assert.ok(mmMatch, 'Case 4a: "M&M launches new SUV" must match M&M');
  assert.equal(mmMatch!.matchedVia, 'symbol');

  assert.equal(
    findMatch(matchInstruments('MM launches', CANDIDATES), 'mm'),
    undefined,
    'Case 4b: "MM" (no ampersand) must not match symbol M&M'
  );
}

// --- Case 5: company-name matching, incl. case-insensitivity ---
function testCompanyNameMatching(): void {
  const infyResult = matchInstruments('Infosys shares rally on buyback', CANDIDATES);
  const infyMatch = findMatch(infyResult, 'infy');
  assert.ok(infyMatch, 'Case 5a: "Infosys shares rally on buyback" must match INFY');
  assert.equal(infyMatch!.matchedVia, 'company-name');

  const tcsResult = matchInstruments('Tata Consultancy Services wins deal', CANDIDATES);
  const tcsMatch = findMatch(tcsResult, 'tcs');
  assert.ok(tcsMatch, 'Case 5b: "Tata Consultancy Services wins deal" must match TCS');
  assert.equal(tcsMatch!.matchedVia, 'company-name');

  const aaplResult = matchInstruments('APPLE unveils new iPhone lineup', CANDIDATES);
  const aaplMatch = findMatch(aaplResult, 'aapl');
  assert.ok(aaplMatch, 'Case 5c: uppercase "APPLE" must match AAPL case-insensitively');
  assert.equal(aaplMatch!.matchedVia, 'company-name');
}

// --- Case 6: full-phrase rule (partial company name must not match) ---
function testFullPhraseRule(): void {
  const tataMotors: MatchCandidate = {
    instrumentId: 'tatamotors',
    symbol: 'TATAMOTORS',
    displayName: 'Tata Motors Ltd',
  };
  const candidates = [...CANDIDATES, tataMotors];
  const result = matchInstruments('Tata group expands', candidates);
  assert.equal(
    findMatch(result, 'tatamotors'),
    undefined,
    'Case 6: "Tata group expands" must NOT match Tata Motors — only the full phrase "tata motors" counts'
  );
}

// --- Case 7: min-length guard ---
function testMinLengthGuard(): void {
  const shortName: MatchCandidate = {
    instrumentId: 'ab-co',
    symbol: 'ZQX',
    displayName: 'AB Ltd',
  };
  const candidates = [...CANDIDATES, shortName];
  // Without the guard, the stripped name "AB" would match this text as a
  // standalone token — the guard must suppress it because "AB" is < 3 chars.
  const result = matchInstruments('AB Ltd is expanding across regions', candidates);
  assert.equal(
    findMatch(result, 'ab-co'),
    undefined,
    'Case 7: a candidate whose stripped name is < 3 chars must never name-match'
  );
}

// --- Case 8: multi-match + dedup, symbol wins over company-name ---
function testMultiMatchAndDedup(): void {
  const result = matchInstruments('Infosys and TCS both up; INFY leads', CANDIDATES);
  assert.equal(result.length, 2, 'Case 8: expected exactly two matches (INFY, TCS)');

  const infyMatch = findMatch(result, 'infy');
  assert.ok(infyMatch, 'Case 8: INFY must be present');
  assert.equal(
    infyMatch!.matchedVia,
    'symbol',
    'Case 8: INFY matched via both symbol and company-name — symbol must win, and only ONE entry must be returned'
  );

  const tcsMatch = findMatch(result, 'tcs');
  assert.ok(tcsMatch, 'Case 8: TCS must be present');
  assert.equal(tcsMatch!.matchedVia, 'symbol');
}

// --- Case 9: purity / determinism ---
function testPurityAndDeterminism(): void {
  const text = 'Infosys and TCS both up; INFY leads';
  const resultA = matchInstruments(text, CANDIDATES);
  const resultB = matchInstruments(text, CANDIDATES);
  assert.deepEqual(resultA, resultB, 'Case 9a: identical inputs must produce deeply-equal results');

  assert.deepEqual(matchInstruments('', CANDIDATES), [], 'Case 9b: empty text must return []');
  assert.deepEqual(
    matchInstruments('INFY jumps 4%', []),
    [],
    'Case 9c: empty candidates must return []'
  );
}

// --- Bonus: stripCompanySuffixes direct coverage ---
function testStripCompanySuffixes(): void {
  assert.equal(stripCompanySuffixes('Infosys Ltd'), 'Infosys');
  assert.equal(stripCompanySuffixes('Tata Consultancy Services Ltd'), 'Tata Consultancy Services');
  assert.equal(stripCompanySuffixes('Apple Inc'), 'Apple');
  assert.equal(stripCompanySuffixes('Mahindra & Mahindra Ltd'), 'Mahindra & Mahindra');
  assert.equal(stripCompanySuffixes('AB Ltd'), 'AB');
}

function main(): void {
  testSymbolHit();
  testSymbolBoundaryTraps();
  testSymbolCaseSensitivity();
  testRegexSpecialsInSymbols();
  testCompanyNameMatching();
  testFullPhraseRule();
  testMinLengthGuard();
  testMultiMatchAndDedup();
  testPurityAndDeterminism();
  testStripCompanySuffixes();

  console.log(
    'PASS: news-match — all 9 case groups + stripCompanySuffixes coverage passed (case-sensitive whole-token symbol rule, case-insensitive full-phrase company-name rule, false-positive traps pinned)'
  );
  process.exit(0);
}

main();
