// Transcript fetcher using the `youtube-transcript` npm package
// No API key required — scrapes YouTube's transcript API directly
// Supports multilingual transcripts (Telugu, Hindi, English, etc.)

import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptResult {
  video_id: string;
  full_text: string;
  word_count: number;
  segment_count: number;
  char_count: number;
  detected_lang: string;
  available: boolean;
  error?: string;
}

// Language code → human-readable name for AI prompt context
const LANG_NAMES: Record<string, string> = {
  te: 'Telugu',
  hi: 'Hindi',
  en: 'English',
  ta: 'Tamil',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  bn: 'Bengali',
  gu: 'Gujarati',
  pa: 'Punjabi',
  ur: 'Urdu',
};

export function getLanguageName(code: string): string {
  return LANG_NAMES[code] || code;
}

/**
 * Fetch the transcript for a YouTube video.
 * Multi-language fallback strategy:
 *   1. Try without language constraint (gets the video's native language)
 *   2. Try English specifically
 *   3. If both fail, report unavailable
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const emptyResult: TranscriptResult = {
    video_id: videoId,
    full_text: '',
    word_count: 0,
    segment_count: 0,
    char_count: 0,
    detected_lang: '',
    available: false,
  };

  // Strategy 1: Fetch without language constraint (native language)
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);

    if (segments && segments.length > 0) {
      return buildResult(videoId, segments);
    }
  } catch {
    // Native fetch failed, try English next
  }

  // Strategy 2: Try English explicitly
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });

    if (segments && segments.length > 0) {
      return buildResult(videoId, segments);
    }
  } catch {
    // English also failed
  }

  // Strategy 3: Try Hindi (common for Indian financial content)
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'hi' });

    if (segments && segments.length > 0) {
      return buildResult(videoId, segments);
    }
  } catch {
    // Hindi also failed
  }

  return {
    ...emptyResult,
    error: 'Transcript unavailable for this video in any language',
  };
}

/**
 * Build a TranscriptResult from raw segments.
 * Handles non-Latin scripts (Telugu, Hindi, etc.) properly for counting.
 */
function buildResult(
  videoId: string,
  segments: { text: string; duration: number; offset: number; lang?: string }[]
): TranscriptResult {
  // Join all segments into one clean block of text
  const full_text = segments
    .map((s) => s.text.replace(/\[.*?\]/g, '').trim()) // strip [Music], [Applause] etc.
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Detect language from the first segment that has a lang field,
  // or infer from character analysis
  const detectedLang = segments.find((s) => s.lang)?.lang || inferLanguage(full_text);

  // Word count: for Latin scripts, split on whitespace.
  // For non-Latin (Indic scripts), whitespace splitting still works
  // because auto-generated captions add spaces. But we also track
  // segment count and char count as more reliable metrics.
  const word_count = full_text.split(/\s+/).filter(Boolean).length;

  return {
    video_id: videoId,
    full_text,
    word_count,
    segment_count: segments.length,
    char_count: full_text.length,
    detected_lang: detectedLang,
    available: true,
  };
}

/**
 * Infer language from text content by checking Unicode script ranges.
 * This is a heuristic — not perfect, but good enough for prompt context.
 */
function inferLanguage(text: string): string {
  // Count characters in various script ranges
  const teluguChars = (text.match(/[\u0C00-\u0C7F]/g) || []).length;
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const tamilChars = (text.match(/[\u0B80-\u0BFF]/g) || []).length;
  const kannadaChars = (text.match(/[\u0C80-\u0CFF]/g) || []).length;

  const max = Math.max(teluguChars, devanagariChars, latinChars, tamilChars, kannadaChars);
  if (max === 0) return 'en'; // default

  if (max === teluguChars) return 'te';
  if (max === devanagariChars) return 'hi';
  if (max === tamilChars) return 'ta';
  if (max === kannadaChars) return 'kn';
  return 'en';
}

/**
 * Truncate transcript to fit within Gemini's context window.
 * ~4000 words ≈ ~5500 tokens — safe for Flash model.
 */
export function truncateTranscript(text: string, maxWords = 4000): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}
