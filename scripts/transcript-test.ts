/**
 * transcript-test — LIVE end-to-end proof that the InnerTube transcript fetcher
 * (src/lib/transcript.ts) works for English, Hindi AND Telugu videos, fixing the
 * reported bug where non-English videos silently degraded to title-only analysis.
 *
 * Run:  npx tsx scripts/transcript-test.ts
 *
 * THIS IS A LIVE NETWORK TEST — it hits YouTube's real InnerTube API. It is NOT
 * a pure unit test: results depend on the videos still existing and being
 * publicly captioned. The three video IDs below were hand-verified (see the
 * assertions) to carry real captions in each language:
 *
 *   en  ssuaVMbRtCo  Ben Felix — "Why Index Funds Aren't Going to Break the
 *                    Market" (manual English captions)
 *   hi  7zIGgbfQysY  Hindi mutual-fund/SIP explainer (auto-generated Hindi ASR)
 *   te  p5ORIeMULIg  Telugu stock-market explainer (auto-generated Telugu ASR)
 *
 * If a video is later removed or region-gated the fetcher returns available:false
 * with a clear error and this test FAILS LOUDLY — that is correct behaviour, not
 * a bug to paper over: swap in another captioned video of the same language.
 *
 * The OPTIONAL final step runs one Hindi transcript through the REAL Gemini model
 * (GEMINI_API_KEY from .env.local) and asserts the overview comes back in English
 * with substance. It is skipped honestly (not failed) when no key is available or
 * the model call errors (e.g. quota) — but a NON-English overview is a hard fail.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchTranscript, type TranscriptResult } from '../src/lib/transcript';
import { analyzeTranscriptWithProvider } from '../src/lib/ai-provider';

interface Case {
  lang: string;
  video_id: string;
  label: string;
  expectedKind?: 'manual' | 'asr';
}

const CASES: Case[] = [
  { lang: 'en', video_id: 'ssuaVMbRtCo', label: 'Ben Felix — index funds (English, manual captions)', expectedKind: 'manual' },
  { lang: 'hi', video_id: '7zIGgbfQysY', label: 'Hindi SIP / mutual-fund explainer (Hindi ASR)', expectedKind: 'asr' },
  { lang: 'te', video_id: 'p5ORIeMULIg', label: 'Telugu stock-market explainer (Telugu ASR)', expectedKind: 'asr' },
];

const MIN_CHARS = 500;

// Devanagari (Hindi) and Telugu Unicode ranges — used to detect residual
// non-English text in the Gemini overview.
const DEVANAGARI = /[ऀ-ॿ]/;
const TELUGU = /[ఀ-౿]/;

function loadGeminiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your-')) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const env = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/);
      if (m) {
        const val = m[1].trim().replace(/^["']|["']$/g, '');
        if (val && !val.includes('your-')) return val;
      }
    }
  } catch {
    // .env.local absent — fine, Gemini step will be skipped honestly.
  }
  return undefined;
}

async function testTranscripts(): Promise<Map<string, TranscriptResult>> {
  const results = new Map<string, TranscriptResult>();

  for (const c of CASES) {
    process.stdout.write(`\n[${c.lang}] ${c.video_id} — ${c.label}\n`);
    const r = await fetchTranscript(c.video_id);
    results.set(c.lang, r);

    console.log(
      `      available=${r.available} detected_lang=${r.detected_lang} ` +
        `source_kind=${r.source_kind} char_count=${r.char_count} ` +
        `segments=${r.segment_count} words=${r.word_count}`
    );
    if (r.available) {
      console.log(`      sample: ${r.full_text.slice(0, 110).replace(/\s+/g, ' ')}…`);
    } else {
      console.log(`      error: ${r.error}`);
    }

    assert.equal(
      r.available,
      true,
      `[${c.lang}] transcript must be available for ${c.video_id} (got error: ${r.error})`
    );
    assert.equal(
      r.detected_lang,
      c.lang,
      `[${c.lang}] detected_lang must be "${c.lang}" for ${c.video_id}, got "${r.detected_lang}"`
    );
    assert.ok(
      r.char_count > MIN_CHARS,
      `[${c.lang}] char_count must exceed ${MIN_CHARS} for ${c.video_id}, got ${r.char_count}`
    );
    assert.ok(
      r.full_text.trim().length > 0,
      `[${c.lang}] full_text must be non-empty for ${c.video_id}`
    );
    if (c.expectedKind) {
      assert.equal(
        r.source_kind,
        c.expectedKind,
        `[${c.lang}] source_kind must be "${c.expectedKind}" for ${c.video_id}, got "${r.source_kind}"`
      );
    }
    // Language-specific script sanity: Hindi text must contain Devanagari,
    // Telugu text must contain Telugu script — proves we fetched the ORIGINAL
    // language track, not an English fallback.
    if (c.lang === 'hi') {
      assert.ok(DEVANAGARI.test(r.full_text), `[hi] transcript must contain Devanagari script`);
    }
    if (c.lang === 'te') {
      assert.ok(TELUGU.test(r.full_text), `[te] transcript must contain Telugu script`);
    }
  }

  return results;
}

async function testGeminiEnglishOverview(hindi: TranscriptResult): Promise<void> {
  console.log('\n--- OPTIONAL: real Gemini analysis of the Hindi transcript ---');
  const key = loadGeminiKey();
  if (!key) {
    console.log('SKIP: no GEMINI_API_KEY available (set it in .env.local to run this step).');
    return;
  }
  if (!hindi.available) {
    console.log('SKIP: Hindi transcript unavailable, cannot run Gemini step.');
    return;
  }

  let analysis;
  try {
    analysis = await analyzeTranscriptWithProvider(
      'gemini',
      key,
      hindi.full_text.slice(0, 12000),
      'SIP और म्यूचुअल फंड में निवेश — पूरी जानकारी',
      'Hindi Finance',
      false,
      hindi.detected_lang
    );
  } catch (err: any) {
    console.log(`SKIP: Gemini call errored (network/quota) — ${err?.message || err}`);
    return;
  }

  const bullets = analysis.summary_bullets || [];
  console.log(`      returned ${bullets.length} summary_bullets, ${analysis.mentioned_tickers.length} tickers, confidence=${analysis.confidence}`);
  bullets.slice(0, 5).forEach((b, i) => console.log(`        ${i + 1}. ${b}`));

  // The analyzer returns a single "Analysis unavailable — ..." bullet on failure.
  if (bullets.length === 1 && /Analysis unavailable/i.test(bullets[0])) {
    console.log(`SKIP: Gemini returned an unavailable-analysis stub — ${bullets[0]}`);
    return;
  }

  // HARD assertions — this is the actual regression guard.
  assert.ok(bullets.length > 0, 'Gemini must return at least one summary bullet for a real Hindi transcript');
  const joined = bullets.join('   ') + ' ' + (analysis.key_themes || []).join(' ');
  assert.ok(
    !DEVANAGARI.test(joined),
    'Gemini overview must be in ENGLISH — found Devanagari (Hindi) characters in summary_bullets/key_themes'
  );
  assert.ok(
    !TELUGU.test(joined),
    'Gemini overview must be in ENGLISH — found Telugu characters in summary_bullets/key_themes'
  );
  const latin = (joined.match(/[a-zA-Z]/g) || []).length;
  assert.ok(latin > 40, `Gemini overview must contain substantial English text, got only ${latin} latin chars`);

  console.log('      PASS: Gemini overview came back in English with substance.');
}

async function main(): Promise<void> {
  console.log('LIVE transcript test — hitting YouTube InnerTube for real (en/hi/te)…');
  const results = await testTranscripts();
  await testGeminiEnglishOverview(results.get('hi')!);

  console.log(
    '\nPASS: transcript fetcher works LIVE for English, Hindi and Telugu — ' +
      'each returns an available, original-language transcript with the correct ' +
      'detected_lang and >500 chars, never degrading to title-only.'
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
