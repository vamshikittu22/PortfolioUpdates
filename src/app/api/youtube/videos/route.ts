import { NextResponse } from 'next/server';
import { fetchLatestVideos, type VideoItem } from '@/lib/youtube-api';
import { fetchRSSVideos, scrapeChannelVideos, type RSSVideo } from '@/lib/youtube-scraper';
import type { LiveVideo } from '@/lib/youtube-types';

// GET /api/youtube/videos?channel_id=UCxxx&max=20
// Fetches latest N videos from a channel (no analysis — just metadata)
// Works without any API key via RSS feed
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channel_id') ?? '';
  const max = Math.min(parseInt(searchParams.get('max') ?? '20', 10), 50);

  if (!channelId.trim() || channelId.startsWith('UC_')) {
    return NextResponse.json(
      { success: false, error: 'Invalid or unresolved channel ID. Re-add the channel using its full YouTube URL.' },
      { status: 400 }
    );
  }

  const hasYouTubeKey =
    !!process.env.YOUTUBE_API_KEY &&
    process.env.YOUTUBE_API_KEY !== 'your-youtube-data-api-v3-key';

  try {
    let rawVideos: (RSSVideo | VideoItem)[];

    if (hasYouTubeKey) {
      // YouTube API gives duration + view counts
      const uploadsPlaylistId = 'UU' + channelId.slice(2);
      rawVideos = await fetchLatestVideos(uploadsPlaylistId, max);
    } else {
      // Scrape the channel's /videos page for rich data without API key
      rawVideos = await scrapeChannelVideos(channelId).catch(() => fetchRSSVideos(channelId, max));
    }

    const videos: LiveVideo[] = rawVideos.map((v) => ({
      video_id: v.video_id,
      channel_id: channelId,
      channel_name: searchParams.get('channel_name') ?? '',
      title: v.title,
      published_at: v.published_at,
      thumbnail_url: v.thumbnail_url,
      duration: v.duration ?? '',
      view_count: v.view_count ?? '',
      description: v.description ?? '',
      analysis_status: 'idle',
    }));

    return NextResponse.json({ success: true, videos, source: hasYouTubeKey ? 'youtube_api' : 'scraper' });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}
