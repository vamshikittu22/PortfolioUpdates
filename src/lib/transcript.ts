// Transcript fetcher using the `youtube-transcript` npm package
// No API key required — scrapes YouTube's transcript API directly

import { YoutubeTranscript } from 'youtube-transcript';

export interface TranscriptResult {
  video_id: string;
  full_text: string;
  word_count: number;
  available: boolean;
  error?: string;
}

/**
 * Fetch the transcript for a YouTube video.
 * Falls back gracefully if transcripts are disabled or unavailable.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: 'en',
    });

    if (!segments || segments.length === 0) {
      return {
        video_id: videoId,
        full_text: '',
        word_count: 0,
        available: false,
        error: 'No transcript segments returned',
      };
    }

    // Join all segments into one clean block of text
    const full_text = segments
      .map((s) => s.text.replace(/\[.*?\]/g, '').trim()) // strip [Music], [Applause] etc.
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return {
      video_id: videoId,
      full_text,
      word_count: full_text.split(/\s+/).length,
      available: true,
    };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    // Common non-fatal errors
    const isMissing =
      msg.includes('Transcript is disabled') ||
      msg.includes('No transcript') ||
      msg.includes('Could not find') ||
      msg.includes('ERR_') ||
      msg.includes('unavailable');

    return {
      video_id: videoId,
      full_text: '',
      word_count: 0,
      available: false,
      error: isMissing ? 'Transcript unavailable for this video' : msg,
    };
  }
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
