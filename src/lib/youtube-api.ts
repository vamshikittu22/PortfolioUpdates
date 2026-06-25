// YouTube Data API v3 helper — channel resolution & video fetching
// Docs: https://developers.google.com/youtube/v3/docs

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface ChannelInfo {
  channel_id: string;
  channel_name: string;
  handle: string;
  subscriber_count: string;
  video_count: number;
  thumbnail_url: string;
  uploads_playlist_id: string;
}

export interface VideoItem {
  video_id: string;
  title: string;
  published_at: string;
  thumbnail_url: string;
  description: string;
  duration?: string;
  view_count?: string;
}

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || key === 'your-youtube-data-api-v3-key') {
    throw new Error('YOUTUBE_API_KEY is not configured in .env.local');
  }
  return key;
}

function formatCount(n: string | number): string {
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
  return String(num);
}

/**
 * Resolve a YouTube channel URL, @handle, or channel ID → ChannelInfo
 * Supports:
 *   - @handle            → uses forHandle param
 *   - UCxxxxxxxxxxxxxxx  → uses id param
 *   - youtube.com/...    → extracts handle or id from URL
 */
export async function resolveChannel(input: string): Promise<ChannelInfo> {
  const key = apiKey();
  let params: Record<string, string> = {
    part: 'snippet,statistics,contentDetails',
    key,
    maxResults: '1',
  };

  // Strip full URL to just the handle/ID
  const cleaned = input
    .replace(/https?:\/\/(www\.)?youtube\.com\//i, '')
    .replace(/\/$/, '')
    .trim();

  if (cleaned.startsWith('UC') && cleaned.length === 24) {
    // Channel ID
    params.id = cleaned;
  } else if (cleaned.startsWith('@')) {
    // @handle
    params.forHandle = cleaned.slice(1);
  } else if (cleaned.startsWith('channel/UC')) {
    params.id = cleaned.replace('channel/', '');
  } else if (cleaned.startsWith('@') || cleaned.includes('@')) {
    params.forHandle = cleaned.replace('@', '');
  } else {
    // Treat as handle without @
    params.forHandle = cleaned;
  }

  const url = `${YT_API_BASE}/channels?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`YouTube API error: ${err?.error?.message ?? res.statusText}`);
  }

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error(`Channel not found for: ${input}`);

  const uploadsId = item.contentDetails?.relatedPlaylists?.uploads ?? '';
  const channelId = item.id;
  // Derive uploads playlist: replace 'UC' prefix with 'UU'
  const uploadsPlaylistId = uploadsId || ('UU' + channelId.slice(2));

  return {
    channel_id: channelId,
    channel_name: item.snippet.title,
    handle: item.snippet.customUrl ?? `@${item.snippet.title}`,
    subscriber_count: formatCount(item.statistics?.subscriberCount ?? 0),
    video_count: 0,
    thumbnail_url: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? '',
    uploads_playlist_id: uploadsPlaylistId,
  };
}

/**
 * Fetch the latest N videos from a channel's uploads playlist
 */
export async function fetchLatestVideos(
  uploadsPlaylistId: string,
  maxResults = 10
): Promise<VideoItem[]> {
  const key = apiKey();

  // Step 1: get video IDs from playlist
  const playlistUrl = `${YT_API_BASE}/playlistItems?${new URLSearchParams({
    part: 'snippet,contentDetails',
    playlistId: uploadsPlaylistId,
    maxResults: String(maxResults),
    key,
  })}`;

  const plRes = await fetch(playlistUrl);
  if (!plRes.ok) throw new Error(`Playlist fetch failed: ${plRes.statusText}`);
  const plData = await plRes.json();
  const items = plData.items ?? [];
  if (!items.length) return [];

  const videoIds = items
    .map((i: any) => i.contentDetails?.videoId ?? i.snippet?.resourceId?.videoId)
    .filter(Boolean)
    .join(',');

  // Step 2: get video stats + content details for duration/views
  const videosUrl = `${YT_API_BASE}/videos?${new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoIds,
    key,
  })}`;

  const vidRes = await fetch(videosUrl);
  if (!vidRes.ok) throw new Error(`Videos fetch failed: ${vidRes.statusText}`);
  const vidData = await vidRes.json();

  return (vidData.items ?? []).map((v: any): VideoItem => ({
    video_id: v.id,
    title: v.snippet?.title ?? '',
    published_at: v.snippet?.publishedAt ?? '',
    thumbnail_url:
      v.snippet?.thumbnails?.medium?.url ??
      v.snippet?.thumbnails?.default?.url ?? '',
    description: (v.snippet?.description ?? '').slice(0, 500),
    duration: formatDuration(v.contentDetails?.duration ?? ''),
    view_count: formatCount(v.statistics?.viewCount ?? 0),
  }));
}

/** Convert ISO 8601 duration (PT18M42S) to human readable (18:42) */
function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const h = match[1] ? `${match[1]}:` : '';
  const m = match[2] ? match[2].padStart(h ? 2 : 1, '0') : '0';
  const s = (match[3] ?? '0').padStart(2, '0');
  return `${h}${m}:${s}`;
}
