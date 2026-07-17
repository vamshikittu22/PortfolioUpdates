/**
 * NEWS-04 / NEWS-05 — pure summarization logic layer: prompt building, JSON
 * schema declaration, response parsing/validation, and AI-error
 * classification. Zero I/O, zero env access, zero clock — the ONLY file that
 * touches the @google/genai network is src/lib/news/ai.ts (mirrors the
 * fetch-prices/parse-feeds split: this file owns "what to ask and how to make
 * sense of the answer", ai.ts owns "how do we get the bytes and handle the
 * network failing").
 *
 * Proven by scripts/news-summarize-test.ts under node:assert/strict — same
 * dependency-free style as scripts/news-match-test.ts.
 */

import type { NewsSummaryResult } from '@/lib/news/types';

/**
 * Single model constant for the whole news-summarization path. Shares the
 * model/key/quota pool with the legacy YouTube analyzer (src/lib/gemini.ts) —
 * verified current per 06-RESEARCH-external §4. A later swap to a newer
 * flash release is a one-line change.
 */
export const NEWS_AI_MODEL = 'gemini-2.5-flash';

/**
 * One headline to be summarized in a batch call. Declared locally rather than
 * in src/lib/news/types.ts — that file's ownership belongs to 06-02, and this
 * plan's files_modified does not list it.
 */
export interface SummarizeBatchItem {
  id: string;
  title: string;
  source: string;
  tickers: string[];
}

const SENTIMENT_LABELS = ['Bullish', 'Bearish', 'Mixed', 'Neutral'] as const;
const IMPORTANCE_LEVELS = ['High', 'Medium', 'Low'] as const;

type SentimentLabel = (typeof SENTIMENT_LABELS)[number];
type ImportanceLevel = (typeof IMPORTANCE_LEVELS)[number];

/**
 * Plain JSON Schema (NOT the SDK's Type-enum Schema builder) — passed
 * verbatim to GenerateContentConfig.responseJsonSchema (confirmed on the
 * @google/genai typedoc, 06-RESEARCH-external §4). Enum values mirror the
 * news_items table's sentiment_label/importance CHECK constraints exactly.
 */
export const NEWS_SUMMARY_JSON_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      summary: { type: 'string' },
      whyItMatters: { type: 'string' },
      sentimentLabel: { type: 'string', enum: [...SENTIMENT_LABELS] },
      importance: { type: 'string', enum: [...IMPORTANCE_LEVELS] },
    },
    required: ['id', 'summary', 'sentimentLabel', 'importance'],
  },
} as const;

/**
 * Builds the batched summarization prompt. Deterministic: identical `items`
 * always produce an identical string (no timestamps, no randomness), so the
 * caller may safely re-issue the same prompt on a retry.
 */
export function buildSummarizePrompt(items: SummarizeBatchItem[]): string {
  const articlesBlock = items
    .map((item) => {
      const tickers = item.tickers.join(', ');
      return `- id: ${item.id}\n  title: ${item.title}\n  source: ${item.source}\n  tickers: ${tickers}`;
    })
    .join('\n');

  return [
    'You are a financial news analyst. For EACH article below, write a 2-3 sentence summary and a one-sentence note on why it matters to a holder of the listed tickers.',
    '',
    'ARTICLES:',
    articlesBlock,
    '',
    'For each article, return an object with EXACTLY these fields:',
    '- id: the article id, copied exactly as given',
    '- summary: 2-3 sentence summary of the article',
    '- whyItMatters: one sentence on why it matters to a holder of the listed tickers',
    `- sentimentLabel: one of ${SENTIMENT_LABELS.join('|')}`,
    `- importance: one of ${IMPORTANCE_LEVELS.join('|')}`,
    '',
    'Reserve "High" importance ONLY for genuinely price-moving news: earnings surprises, M&A, regulatory action, or major contract wins/losses. Routine news is Medium or Low.',
    '',
    'Return ONLY a JSON array of these objects, one per article, with no markdown fences and no extra text.',
  ].join('\n');
}

/**
 * Parses and validates the model's JSON-mode response text. Tolerates
 * undefined text (GenerateContentResponse.text is undefined when no text
 * parts exist — 06-RESEARCH-external §4 Pitfall 5), non-JSON text, and JSON
 * that isn't a top-level array by returning an empty Map plus a non-empty
 * error — never throws, never fabricates a summary.
 *
 * Per item: an id not in `expectedIds`, a missing/non-string `summary`, or an
 * invalid `sentimentLabel`/`importance` enum value causes that item to be
 * silently OMITTED (valid siblings still survive); a missing `whyItMatters`
 * defaults to '' since `summary` is the required core field.
 */
export function parseSummarizeResponse(
  text: string | undefined,
  expectedIds: string[]
): { results: Map<string, NewsSummaryResult>; error: string | null } {
  const results = new Map<string, NewsSummaryResult>();

  if (text === undefined) {
    return { results, error: 'AI response contained no text' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { results, error: 'AI response was not valid JSON' };
  }

  if (!Array.isArray(parsed)) {
    return { results, error: 'AI response JSON was not an array' };
  }

  const expectedIdSet = new Set(expectedIds);

  for (const rawItem of parsed) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;

    const id = item.id;
    if (typeof id !== 'string' || !expectedIdSet.has(id)) continue;

    const summary = item.summary;
    if (typeof summary !== 'string' || summary.length === 0) continue;

    const sentimentLabel = item.sentimentLabel;
    if (
      typeof sentimentLabel !== 'string' ||
      !(SENTIMENT_LABELS as readonly string[]).includes(sentimentLabel)
    ) {
      continue;
    }

    const importance = item.importance;
    if (typeof importance !== 'string' || !(IMPORTANCE_LEVELS as readonly string[]).includes(importance)) {
      continue;
    }

    const whyItMatters = typeof item.whyItMatters === 'string' ? item.whyItMatters : '';

    results.set(id, {
      summary,
      whyItMatters,
      sentimentLabel: sentimentLabel as SentimentLabel,
      importance: importance as ImportanceLevel,
    });
  }

  return { results, error: null };
}

/**
 * Classifies an AI-call error as the single NEWS-05 degrade trigger. Covers
 * both shapes confirmed by 06-RESEARCH-external §4: the SDK's `ApiError`
 * carries a numeric `.status` (429 = quota), and a message containing
 * RESOURCE_EXHAUSTED or "quota" (case-insensitive). Never throws — unknown
 * shapes (null, a bare string, a differently-shaped object) classify as
 * 'other' rather than propagating.
 */
export function classifyAiError(err: unknown): 'quota' | 'other' {
  if (err === null || typeof err !== 'object') return 'other';

  const e = err as { status?: unknown; message?: unknown };
  if (e.status === 429) return 'quota';

  const message = typeof e.message === 'string' ? e.message : '';
  if (/RESOURCE_EXHAUSTED|quota/i.test(message)) return 'quota';

  return 'other';
}
