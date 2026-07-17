/**
 * NEWS-04 / NEWS-05 — pure-function correctness proof for the summarization
 * logic layer: `buildSummarizePrompt` (deterministic prompt construction),
 * `parseSummarizeResponse` (JSON-from-LLM validation — never throws, never
 * fabricates), `classifyAiError` (429/quota detection — the single NEWS-05
 * degrade trigger), and `NEWS_SUMMARY_JSON_SCHEMA` (the plain JSON Schema
 * passed to the SDK's `responseJsonSchema`, enums pinned to the news_items
 * CHECK constraints).
 *
 * Run:  npx tsx scripts/news-summarize-test.ts
 * (Registered: npm run test:news-summarize)
 *
 * This is a PURE unit test — no database, no network, no env vars, no clock,
 * no real AI response. Same dependency-free style as scripts/news-match-test.ts
 * / scripts/alerts-eval-test.ts: node:assert/strict, console.log('PASS') +
 * process.exit(0) on success, throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means the
 * implementation is wrong; fix summarize.ts instead.
 */
import assert from 'node:assert/strict';
import {
  buildSummarizePrompt,
  classifyAiError,
  NEWS_AI_MODEL,
  NEWS_SUMMARY_JSON_SCHEMA,
  parseSummarizeResponse,
} from '../src/lib/news/summarize';
import type { SummarizeBatchItem } from '../src/lib/news/summarize';

const BATCH: SummarizeBatchItem[] = [
  { id: 'a1', title: 'Infosys beats Q1 estimates on strong deal wins', source: 'Reuters', tickers: ['INFY'] },
  { id: 'a2', title: 'Tesla recalls vehicles over software bug', source: 'Bloomberg', tickers: ['TSLA'] },
];

// --- Case 1: buildSummarizePrompt — required content + determinism ---
function testBuildSummarizePrompt(): void {
  const prompt = buildSummarizePrompt(BATCH);

  assert.ok(prompt.includes('a1'), 'Case 1: prompt must contain id a1');
  assert.ok(prompt.includes('a2'), 'Case 1: prompt must contain id a2');
  assert.ok(
    prompt.includes('Infosys beats Q1 estimates on strong deal wins'),
    'Case 1: prompt must contain the first title verbatim'
  );
  assert.ok(
    prompt.includes('Tesla recalls vehicles over software bug'),
    'Case 1: prompt must contain the second title verbatim'
  );
  assert.ok(prompt.includes('INFY'), 'Case 1: prompt must contain the first ticker');
  assert.ok(prompt.includes('TSLA'), 'Case 1: prompt must contain the second ticker');

  for (const field of ['id', 'summary', 'whyItMatters', 'sentimentLabel', 'importance']) {
    assert.ok(prompt.includes(field), `Case 1: prompt must instruct the ${field} field`);
  }

  for (const label of ['Bullish', 'Bearish', 'Mixed', 'Neutral']) {
    assert.ok(prompt.includes(label), `Case 1: prompt must enumerate sentimentLabel value ${label}`);
  }
  for (const level of ['High', 'Medium', 'Low']) {
    assert.ok(prompt.includes(level), `Case 1: prompt must enumerate importance value ${level}`);
  }

  assert.ok(/ONLY/.test(prompt), 'Case 1: prompt must instruct returning ONLY the JSON array');
  assert.ok(/JSON array/i.test(prompt), 'Case 1: prompt must explicitly say JSON array');
  assert.ok(
    /earnings|M&A|regulatory|contract/i.test(prompt),
    'Case 1: prompt must reserve High importance for genuinely price-moving news (ALRT-04 bar)'
  );

  const promptAgain = buildSummarizePrompt(BATCH);
  assert.equal(prompt, promptAgain, 'Case 1: identical input must produce an identical prompt string');
}

// --- Case 2: parseSummarizeResponse — valid JSON, unknown ids dropped ---
function testParseSummarizeResponseValid(): void {
  const validJson = JSON.stringify([
    {
      id: 'a1',
      summary: 'Infosys posted stronger-than-expected Q1 profit on robust deal wins.',
      whyItMatters: 'Signals resilient IT services demand for holders of INFY.',
      sentimentLabel: 'Bullish',
      importance: 'High',
    },
    {
      id: 'a2',
      summary: 'Tesla is recalling a batch of vehicles to fix a software defect.',
      whyItMatters: 'Recall costs and headline risk could pressure TSLA near-term.',
      sentimentLabel: 'Bearish',
      importance: 'Medium',
    },
    {
      id: 'unknown-id',
      summary: 'Should never appear in the results.',
      whyItMatters: '',
      sentimentLabel: 'Neutral',
      importance: 'Low',
    },
  ]);

  const { results, error } = parseSummarizeResponse(validJson, ['a1', 'a2']);

  assert.equal(error, null, 'Case 2: a fully valid response must not produce an error');
  assert.equal(results.size, 2, 'Case 2: exactly the two expected ids must be present');
  assert.ok(results.has('a1') && results.has('a2'), 'Case 2: both expected ids must be present');
  assert.equal(results.has('unknown-id'), false, 'Case 2: an id not in expectedIds must be dropped');

  const a1 = results.get('a1')!;
  assert.equal(a1.summary, 'Infosys posted stronger-than-expected Q1 profit on robust deal wins.');
  assert.equal(a1.whyItMatters, 'Signals resilient IT services demand for holders of INFY.');
  assert.equal(a1.sentimentLabel, 'Bullish');
  assert.equal(a1.importance, 'High');

  const a2 = results.get('a2')!;
  assert.equal(a2.sentimentLabel, 'Bearish');
  assert.equal(a2.importance, 'Medium');
}

// --- Case 3: parseSummarizeResponse — never throws on malformed input ---
function testParseSummarizeResponseMalformed(): void {
  const undefinedResult = parseSummarizeResponse(undefined, ['a1']);
  assert.equal(undefinedResult.results.size, 0, 'Case 3a: undefined text must yield an empty Map');
  assert.ok(
    typeof undefinedResult.error === 'string' && undefinedResult.error.length > 0,
    'Case 3a: undefined text must yield a non-empty error'
  );

  const notJsonResult = parseSummarizeResponse('not json', ['a1']);
  assert.equal(notJsonResult.results.size, 0, 'Case 3b: non-JSON text must yield an empty Map');
  assert.ok(
    typeof notJsonResult.error === 'string' && notJsonResult.error.length > 0,
    'Case 3b: non-JSON text must yield a non-empty error'
  );

  const objectNotArrayResult = parseSummarizeResponse(JSON.stringify({ id: 'a1' }), ['a1']);
  assert.equal(objectNotArrayResult.results.size, 0, 'Case 3c: an object (not array) must yield an empty Map');
  assert.ok(
    typeof objectNotArrayResult.error === 'string' && objectNotArrayResult.error.length > 0,
    'Case 3c: an object (not array) must yield a non-empty error'
  );
}

// --- Case 4: per-item validation — invalid items omitted, valid siblings survive ---
function testParseSummarizeResponsePerItemValidation(): void {
  const mixedJson = JSON.stringify([
    {
      id: 'a1',
      summary: 'Valid summary text for a1.',
      whyItMatters: 'Matters.',
      sentimentLabel: 'VeryBullish', // invalid enum -> omitted
      importance: 'High',
    },
    {
      id: 'a2',
      summary: 'Valid summary text for a2.',
      whyItMatters: 'Matters.',
      sentimentLabel: 'Bullish',
      importance: 'Critical', // invalid enum -> omitted
    },
    {
      id: 'a3',
      // summary missing entirely -> omitted
      whyItMatters: 'Matters.',
      sentimentLabel: 'Bullish',
      importance: 'High',
    },
    {
      id: 'a4',
      summary: 'Valid summary that must survive.',
      // whyItMatters missing -> kept, defaults to ''
      sentimentLabel: 'Neutral',
      importance: 'Low',
    },
  ]);

  const { results, error } = parseSummarizeResponse(mixedJson, ['a1', 'a2', 'a3', 'a4']);

  assert.equal(error, null, 'Case 4: per-item omission is not itself an error');
  assert.equal(results.size, 1, 'Case 4: only a4 (the fully valid item) must survive');
  assert.ok(results.has('a4'), 'Case 4: a4 must be present');
  assert.equal(results.get('a4')!.whyItMatters, '', 'Case 4: missing whyItMatters must default to an empty string');
  assert.equal(results.has('a1'), false, 'Case 4: a1 (invalid sentimentLabel) must be omitted');
  assert.equal(results.has('a2'), false, 'Case 4: a2 (invalid importance) must be omitted');
  assert.equal(results.has('a3'), false, 'Case 4: a3 (missing summary) must be omitted');
}

// --- Case 5: classifyAiError — 429/quota detection, never throws ---
function testClassifyAiError(): void {
  assert.equal(
    classifyAiError({ name: 'ApiError', status: 429, message: 'Too Many Requests' }),
    'quota',
    'Case 5a: ApiError-shaped 429 must classify as quota'
  );
  assert.equal(
    classifyAiError(new Error('RESOURCE_EXHAUSTED: quota exceeded')),
    'quota',
    'Case 5b: RESOURCE_EXHAUSTED message must classify as quota'
  );
  assert.equal(
    classifyAiError(new Error('quota exceeded for model')),
    'quota',
    'Case 5c: a bare "quota" message must classify as quota'
  );
  assert.equal(classifyAiError({ status: 500 }), 'other', 'Case 5d: a 500 status must classify as other');
  assert.equal(
    classifyAiError(new Error('fetch failed')),
    'other',
    'Case 5e: an unrelated network error must classify as other'
  );
  assert.equal(classifyAiError(null), 'other', 'Case 5f: null must never throw, must classify as other');
  assert.equal(
    classifyAiError('a plain string error'),
    'other',
    'Case 5g: a string (non-object) must never throw, must classify as other'
  );
}

// --- Case 6: NEWS_SUMMARY_JSON_SCHEMA — plain JSON Schema matching the DB CHECK constraints ---
function testNewsSummaryJsonSchema(): void {
  assert.equal(NEWS_SUMMARY_JSON_SCHEMA.type, 'array', 'Case 6: schema root type must be array');

  const itemSchema = NEWS_SUMMARY_JSON_SCHEMA.items as {
    required: readonly string[];
    properties: {
      sentimentLabel: { enum: readonly string[] };
      importance: { enum: readonly string[] };
    };
  };

  for (const field of ['id', 'summary', 'sentimentLabel', 'importance']) {
    assert.ok(itemSchema.required.includes(field), `Case 6: items.required must include ${field}`);
  }

  assert.deepEqual(
    [...itemSchema.properties.sentimentLabel.enum],
    ['Bullish', 'Bearish', 'Mixed', 'Neutral'],
    'Case 6: sentimentLabel enum must exactly match the news_items CHECK constraint'
  );
  assert.deepEqual(
    [...itemSchema.properties.importance.enum],
    ['High', 'Medium', 'Low'],
    'Case 6: importance enum must exactly match the news_items CHECK constraint'
  );

  assert.equal(typeof NEWS_AI_MODEL, 'string', 'Case 6: NEWS_AI_MODEL must be a string constant');
  assert.ok(NEWS_AI_MODEL.length > 0, 'Case 6: NEWS_AI_MODEL must be non-empty');
}

function main(): void {
  testBuildSummarizePrompt();
  testParseSummarizeResponseValid();
  testParseSummarizeResponseMalformed();
  testParseSummarizeResponsePerItemValidation();
  testClassifyAiError();
  testNewsSummaryJsonSchema();

  console.log(
    'PASS: news-summarize — prompt/schema/parse/classify pure logic pinned (6 case groups): deterministic prompt, valid-response mapping with unknown-id drop, malformed-input honesty (undefined/non-JSON/object-not-array), per-item validation omission, 429/quota classification, DB-matching JSON schema'
  );
  process.exit(0);
}

main();
