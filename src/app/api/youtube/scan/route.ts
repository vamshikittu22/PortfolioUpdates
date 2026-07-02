import { NextResponse } from 'next/server';
import { resolveChannel, fetchLatestVideos } from '@/lib/youtube-api';
import { scrapeChannel, fetchRSSVideos } from '@/lib/youtube-scraper';
import { fetchTranscript, truncateTranscript } from '@/lib/transcript';
import { analyzeTranscript, crossReferenceHoldings } from '@/lib/gemini';
import { extractTickers } from '@/lib/ticker-extractor';

const GEMINI_DELAY_MS = 4500;
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export interface ScannedVideo {
  video_id: string;
  channel_id: string;
  channel_name: string;
  title: string;
  published_at: string;
  thumbnail_url: string;
  duration: string;
  view_count: string;
  transcript_available: boolean;
  summary_bullets: string[];
  mentioned_tickers: string[];
  bullish_on: string[];
  bearish_on: string[];
  key_themes: string[];
  affects_portfolio: string[];
  confidence: string;
  scanned_at: string;
  analysis_source: 'gemini' | 'keyword' | 'description_only';
}

export interface ScanResult {
  success: boolean;
  channels_scanned: number;
  videos_found: number;
  videos_analyzed: number;
  videos_skipped: number;
  results: ScannedVideo[];
  errors: { channel: string; error: string }[];
  duration_ms: number;
  mode: 'full' | 'no_gemini' | 'no_keys';
}

// POST /api/youtube/scan
// Works in all modes:
//   full      — YouTube API + Gemini AI (best quality)
//   no_gemini — RSS feed + transcript + keyword extraction
//   no_keys   — RSS feed + transcript + keyword extraction (same as above, no YouTube API key)
export async function POST(request: Request) {
  const startTime = Date.now();

  const hasYouTubeKey =
    !!process.env.YOUTUBE_API_KEY &&
    process.env.YOUTUBE_API_KEY !== 'your-youtube-data-api-v3-key';
  const hasGeminiKey =
    !!process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your-gemini-api-key';

  const mode: ScanResult['mode'] = hasYouTubeKey && hasGeminiKey
    ? 'full'
    : hasGeminiKey || !hasYouTubeKey
      ? 'no_gemini'
      : 'full';

  let body: {
    channels?: Array<{
      channel_id: string;
      channel_name: string;
      uploads_playlist_id?: string;
    }>;
    holdings?: string[];
    max_videos_per_channel?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const channels = body.channels ?? [];
  const holdings = (body.holdings ?? []).map((h) => h.toUpperCase());
  const maxVideos = Math.min(body.max_videos_per_channel ?? 5, 10);

  if (!channels.length) {
    return NextResponse.json(
      { success: false, error: 'No channels provided' },
      { status: 400 }
    );
  }

  const results: ScannedVideo[] = [];
  const errors: { channel: string; error: string }[] = [];
  let videosFound = 0;
  let videosAnalyzed = 0;
  let videosSkipped = 0;

  for (const ch of channels) {
    try {
      // ── Step 1: Fetch video list ─────────────────────────────────
      let rawVideos: Array<{
        video_id: string;
        title: string;
        published_at: string;
        thumbnail_url: string;
        description: string;
        duration?: string;
        view_count?: string;
      }> = [];

      if (hasYouTubeKey) {
        // Prefer official YouTube API
        let uploadsPlaylistId = ch.uploads_playlist_id;
        if (!uploadsPlaylistId) {
          const info = await resolveChannel(ch.channel_id);
          uploadsPlaylistId = info.uploads_playlist_id;
        }
        rawVideos = await fetchLatestVideos(uploadsPlaylistId, maxVideos);
      } else {
        // No YouTube API key — use RSS feed
        let channelId = ch.channel_id;

        // If it's a placeholder ID (UC_timestamp) we need to re-scrape
        if (channelId.startsWith('UC_') || channelId.length !== 24) {
          // We don't have the real channel ID — we need to re-resolve
          // The channel name was stored; try using it as a handle
          try {
            const scraped = await scrapeChannel(`@${ch.channel_name.replace(/\s+/g, '')}`);
            channelId = scraped.channel_id;
          } catch {
            // If that fails too, skip this channel
            errors.push({ channel: ch.channel_name, error: 'Could not resolve channel ID. Try adding the full YouTube URL (e.g. https://www.youtube.com/@handle).' });
            continue;
          }
        }

        rawVideos = await fetchRSSVideos(channelId, maxVideos);
      }

      videosFound += rawVideos.length;

      // ── Step 2: Filter to recent videos (last 30 days) ───────────
      const recentVideos = rawVideos.filter((v) => {
        const age = Date.now() - new Date(v.published_at).getTime();
        return age < 30 * 24 * 60 * 60 * 1000;
      });

      // ── Step 3: Analyse each video ───────────────────────────────
      for (const video of recentVideos) {
        // Fetch transcript (no API key needed)
        const transcriptResult = await fetchTranscript(video.video_id);
        const analysisText = transcriptResult.available
          ? truncateTranscript(transcriptResult.full_text, 4000)
          : video.description;

        let scannedVideo: ScannedVideo;

        if (hasGeminiKey && transcriptResult.available && (
          transcriptResult.char_count >= 200 || transcriptResult.segment_count >= 30
        )) {
          // Full Gemini AI analysis (supports multilingual transcripts)
          const analysis = await analyzeTranscript(
            analysisText, video.title, ch.channel_name, false,
            transcriptResult.detected_lang || 'en'
          );
          const affectsPortfolio = crossReferenceHoldings(analysis.mentioned_tickers, holdings);
          scannedVideo = {
            video_id: video.video_id,
            channel_id: ch.channel_id,
            channel_name: ch.channel_name,
            title: video.title,
            published_at: video.published_at,
            thumbnail_url: video.thumbnail_url,
            duration: video.duration ?? '',
            view_count: video.view_count ?? '',
            transcript_available: true,
            summary_bullets: analysis.summary_bullets,
            mentioned_tickers: analysis.mentioned_tickers,
            bullish_on: analysis.bullish_on,
            bearish_on: analysis.bearish_on,
            key_themes: analysis.key_themes,
            affects_portfolio: affectsPortfolio,
            confidence: analysis.confidence,
            scanned_at: new Date().toISOString(),
            analysis_source: 'gemini',
          };
          await sleep(GEMINI_DELAY_MS);
        } else {
          // Keyword extraction (no Gemini key, or no transcript)
          const textToAnalyse = analysisText || video.title;
          const extracted = extractTickers(textToAnalyse, video.title);
          const affectsPortfolio = crossReferenceHoldings(extracted.mentioned_tickers, holdings);
          scannedVideo = {
            video_id: video.video_id,
            channel_id: ch.channel_id,
            channel_name: ch.channel_name,
            title: video.title,
            published_at: video.published_at,
            thumbnail_url: video.thumbnail_url,
            duration: video.duration ?? '',
            view_count: video.view_count ?? '',
            transcript_available: transcriptResult.available,
            summary_bullets: extracted.summary_bullets,
            mentioned_tickers: extracted.mentioned_tickers,
            bullish_on: extracted.bullish_on,
            bearish_on: extracted.bearish_on,
            key_themes: extracted.key_themes,
            affects_portfolio: affectsPortfolio,
            confidence: transcriptResult.available ? 'medium' : 'low',
            scanned_at: new Date().toISOString(),
            analysis_source: transcriptResult.available ? 'keyword' : 'description_only',
          };
        }

        results.push(scannedVideo);
        videosAnalyzed++;
      }

      if (recentVideos.length === 0) {
        videosSkipped += rawVideos.length;
      }

    } catch (err: any) {
      errors.push({ channel: ch.channel_name, error: err.message ?? String(err) });
    }
  }

  // Sort: portfolio hits first, then newest
  results.sort((a, b) => {
    if (a.affects_portfolio.length > 0 && b.affects_portfolio.length === 0) return -1;
    if (a.affects_portfolio.length === 0 && b.affects_portfolio.length > 0) return 1;
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  return NextResponse.json({
    success: true,
    channels_scanned: channels.length,
    videos_found: videosFound,
    videos_analyzed: videosAnalyzed,
    videos_skipped: videosSkipped,
    results,
    errors,
    duration_ms: Date.now() - startTime,
    mode,
  } satisfies ScanResult);
}
