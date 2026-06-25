import { NextResponse } from 'next/server';
import { resolveChannel } from '@/lib/youtube-api';
import { scrapeChannel } from '@/lib/youtube-scraper';

// GET /api/youtube/channel?url=@AkshatZayn
// Resolves a YouTube channel handle / URL / channel ID to metadata.
// Works WITHOUT a YouTube API key (falls back to page scraping).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get('url') ?? searchParams.get('id') ?? '';

  if (!input.trim()) {
    return NextResponse.json(
      { success: false, error: 'Missing ?url= parameter. Pass a @handle, channel ID, or YouTube URL.' },
      { status: 400 }
    );
  }

  const hasApiKey =
    !!process.env.YOUTUBE_API_KEY &&
    process.env.YOUTUBE_API_KEY !== 'your-youtube-data-api-v3-key';

  try {
    if (hasApiKey) {
      // Prefer official API — richer data, more reliable
      const channel = await resolveChannel(input);
      return NextResponse.json({ success: true, channel, source: 'youtube_api' });
    } else {
      // No API key — scrape the channel page directly
      const channel = await scrapeChannel(input);
      return NextResponse.json({ success: true, channel, source: 'scraper' });
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? 'Channel resolution failed',
        hint: 'Make sure the channel URL or handle is correct (e.g. @AkshatZayn)',
      },
      { status: 500 }
    );
  }
}
