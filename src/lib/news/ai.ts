/**
 * NEWS-04 / NEWS-05 — @google/genai wrapper. This is the ONLY file in the
 * news module that touches the AI network (mirrors src/lib/telegram/api.ts's
 * "how do we get the bytes and handle the network failing" role; all "what
 * does this response mean" logic — prompt, schema, parsing, 429/quota
 * classification — lives in the tested pure functions in
 * src/lib/news/summarize.ts and is reused here, never reimplemented).
 *
 * `GEMINI_API_KEY` is read server-side ONLY, same placeholder-detection idiom
 * as src/lib/gemini.ts:31 — an unset/placeholder key yields an honest
 * "not configured" result, never a throw (telegram/api.ts:30-34 precedent).
 *
 * This module coexists with the legacy Generative AI SDK call sites
 * (src/lib/gemini.ts and friends) per 06-RESEARCH-external §4's resolved
 * decision — it deliberately uses only the NEW GenAI SDK (`@google/genai`)
 * and never imports the legacy package.
 */
import { GoogleGenAI } from '@google/genai';
import type { NewsSummaryResult } from '@/lib/news/types';
import {
  buildSummarizePrompt,
  classifyAiError,
  NEWS_AI_MODEL,
  NEWS_SUMMARY_JSON_SCHEMA,
  parseSummarizeResponse,
  type SummarizeBatchItem,
} from '@/lib/news/summarize';

export type { SummarizeBatchItem };

export type SummarizeBatchOutcome = {
  results: Map<string, NewsSummaryResult>;
  error: string | null;
  quotaExhausted: boolean;
};

/**
 * Summarizes ONE batch of headlines in exactly one JSON-mode
 * `generateContent` call. No batching/looping here — the caller (06-09
 * ingest) owns batch sizing and the stop-on-quota loop across batches. Never
 * throws: an unconfigured key, a quota exhaustion, or any other AI failure
 * all resolve to an honest outcome the caller can act on (NEWS-05 — a
 * summarization failure must never fail ingest).
 */
export async function summarizeNewsBatch(items: SummarizeBatchItem[]): Promise<SummarizeBatchOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  // Same placeholder-value idiom as src/lib/gemini.ts:31 — narrows apiKey to
  // `string` for the rest of this function.
  if (!apiKey || apiKey === 'your-gemini-api-key') {
    return { results: new Map(), error: 'GEMINI_API_KEY not configured', quotaExhausted: false };
  }

  try {
    // The SDK auto-reads GOOGLE_API_KEY (not GEMINI_API_KEY) when no apiKey is
    // passed — this repo only sets GEMINI_API_KEY, so the key MUST be passed
    // explicitly or construction silently breaks (06-RESEARCH-external §4).
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: NEWS_AI_MODEL,
      contents: buildSummarizePrompt(items),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: NEWS_SUMMARY_JSON_SCHEMA,
        temperature: 0.2,
      },
    });

    const parsed = parseSummarizeResponse(
      response.text,
      items.map((item) => item.id)
    );
    return { ...parsed, quotaExhausted: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    if (classifyAiError(err) === 'quota') {
      return { results: new Map(), error: message, quotaExhausted: true };
    }
    return { results: new Map(), error: message, quotaExhausted: false };
  }
}
