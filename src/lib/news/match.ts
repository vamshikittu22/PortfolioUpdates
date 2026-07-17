/**
 * NEWS-02 — pure instrument matcher: given article text and a list of
 * portfolio candidates (symbol + display name), determine which candidates
 * the text genuinely mentions. Two independent rules per candidate:
 *   - symbol rule: case-SENSITIVE whole-token match (custom lookaround
 *     boundaries, NOT bare `\b` — symbols like M&M, BAJAJ-AUTO, BRK.B contain
 *     regex specials / non-word characters that make `\b` misfire).
 *   - company-name rule: case-INSENSITIVE full-phrase match against the
 *     legal-suffix-stripped display name (e.g. "Infosys Ltd" -> "Infosys").
 * Symbol match wins the `matchedVia` label when both rules hit for the same
 * candidate; at most one result per candidate.
 *
 * Zero I/O, zero network, zero clock — pure string-in/matches-out. Proven by
 * scripts/news-match-test.ts under node:assert/strict, including the
 * false-positive traps that motivated NEWS-02 (naive substring matching, the
 * `crossReferenceHoldings` precedent in gemini.ts, is explicitly NOT
 * sufficient — 06-RESEARCH-codebase Q6).
 *
 * Declares its OWN local `MatchCandidate` input type rather than importing
 * from `src/lib/news/types.ts` — that file belongs to the concurrently-run
 * 06-02 plan (wave-1 file isolation held; see 06-03-PLAN.md).
 *
 * Honest limitation: a single-common-word company name (e.g. "Apple") can
 * still false-positive against generic prose using the word in an unrelated
 * sense. Accepted because (a) the text fed into this matcher is already
 * portfolio-scoped upstream, not open-web search, and (b) NEWS-02's bar is
 * documented as word-boundary/company-name rules, not full NER/entity
 * disambiguation.
 */

export interface MatchCandidate {
  instrumentId: string;
  symbol: string;
  displayName: string;
}

export interface InstrumentMatchResult {
  instrumentId: string;
  matchedVia: 'symbol' | 'company-name';
}

/** Trailing legal-entity tokens stripped by stripCompanySuffixes, case-insensitively. */
const LEGAL_SUFFIXES = [
  'Limited',
  'Incorporated',
  'Corporation',
  'Company',
  'Ltd',
  'Inc',
  'Corp',
  'Plc',
  'Co',
];

/** Standard regex-special escape: `. * + ? ^ $ { } ( ) | [ ] \`. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Case-insensitively strips trailing legal-entity suffix tokens (Ltd,
 * Limited, Inc, Incorporated, Corp, Corporation, Plc, Co, Company), repeating
 * until stable — e.g. "Foo Co Ltd" -> "Foo" — plus any trailing '&', periods,
 * or commas left dangling by suffix removal (e.g. "Foo Bar, Inc." -> "Foo
 * Bar"). Exported: 06-08 reuses this to build Google News queries.
 */
export function stripCompanySuffixes(name: string): string {
  let result = name.trim();
  let changed = true;

  while (changed) {
    changed = false;

    const trimmedPunctuation = result.replace(/[.,\s]+$/, '');
    if (trimmedPunctuation !== result) {
      result = trimmedPunctuation;
      changed = true;
    }

    const trimmedAmpersand = result.replace(/&\s*$/, '').trim();
    if (trimmedAmpersand !== result) {
      result = trimmedAmpersand;
      changed = true;
    }

    for (const suffix of LEGAL_SUFFIXES) {
      const suffixPattern = new RegExp('(?:^|\\s)' + escapeRegex(suffix) + '$', 'i');
      if (suffixPattern.test(result)) {
        result = result.replace(suffixPattern, '').trim();
        changed = true;
        break;
      }
    }
  }

  return result.trim();
}

/** Minimum stripped-name length required before the company-name rule is even attempted. */
const MIN_NAME_LENGTH = 3;

/**
 * For each candidate, tests (a) the symbol rule then (b) the company-name
 * rule, returning at most one result per candidate. Symbol wins the
 * `matchedVia` label when both hit. Deterministic and pure: identical inputs
 * always produce deeply-equal output; empty text or empty candidates yield [].
 */
export function matchInstruments(
  text: string,
  candidates: MatchCandidate[]
): InstrumentMatchResult[] {
  const results: InstrumentMatchResult[] = [];

  for (const candidate of candidates) {
    const symbolPattern = new RegExp(
      '(?<![A-Za-z0-9])' + escapeRegex(candidate.symbol) + '(?![A-Za-z0-9])'
    );
    if (symbolPattern.test(text)) {
      results.push({ instrumentId: candidate.instrumentId, matchedVia: 'symbol' });
      continue;
    }

    const strippedName = stripCompanySuffixes(candidate.displayName);
    if (strippedName.length < MIN_NAME_LENGTH) continue;

    const namePattern = new RegExp(
      '(?<![A-Za-z0-9])' +
        escapeRegex(strippedName).replace(/\s+/g, '\\s+') +
        '(?![A-Za-z0-9])',
      'i'
    );
    if (namePattern.test(text)) {
      results.push({ instrumentId: candidate.instrumentId, matchedVia: 'company-name' });
    }
  }

  return results;
}
