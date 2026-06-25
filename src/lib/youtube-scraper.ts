// No-API-key YouTube data fetcher
// Uses YouTube's public RSS feeds + channel page scraping
// Zero API keys required — works out of the box

const YT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export interface ScrapedChannel {
  channel_id: string;
  channel_name: string;
  handle: string;
  subscriber_count: string;
  thumbnail_url: string;
  uploads_playlist_id: string;
}

export interface RSSVideo {
  video_id: string;
  title: string;
  published_at: string;
  thumbnail_url: string;
  description: string;
  view_count: string;
  duration?: string;
}

/** Normalise any YouTube channel input to a fetch-able URL */
function toChannelUrl(input: string): string {
  const cleaned = input
    .replace(/\/$/, '')
    .trim();

  if (cleaned.startsWith('http')) return cleaned;
  if (cleaned.startsWith('@')) return `https://www.youtube.com/${cleaned}`;
  if (cleaned.startsWith('UC') && cleaned.length === 24)
    return `https://www.youtube.com/channel/${cleaned}`;
  return `https://www.youtube.com/@${cleaned}`;
}

/** First match of a regex across haystack, return group 1 */
function extract(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1] ?? '';
}

/**
 * Resolve a YouTube channel handle / URL / channel-ID to metadata
 * without any YouTube API key — scrapes the channel's HTML page.
 */
export async function scrapeChannel(input: string): Promise<ScrapedChannel> {
  const url = toChannelUrl(input);

  let html: string;
  try {
    const res = await fetch(url, { headers: YT_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    html = await res.text();
  } catch (err: any) {
    throw new Error(`Could not reach YouTube: ${err.message}`);
  }

  // Channel ID — several reliable patterns
  const channelId =
    extract(html, /"externalId":"(UC[a-zA-Z0-9_-]{22})"/) ||
    extract(html, /"channelId":"(UC[a-zA-Z0-9_-]{22})"/) ||
    extract(html, /\/channel\/(UC[a-zA-Z0-9_-]{22})/) ||
    extract(html, /"browseId":"(UC[a-zA-Z0-9_-]{22})"/);

  if (!channelId) {
    throw new Error(
      'Could not extract channel ID from page. YouTube may have rate-limited this request — try again in a moment.'
    );
  }

  // Channel name
  const channelName =
    extract(html, /"channelMetadataRenderer":\{"title":"([^"]+)"/) ||
    extract(html, /<meta property="og:title" content="([^"]+)"/) ||
    extract(html, /<title>([^<]+) - YouTube<\/title>/);

  // Subscriber count (approximate — shown in page)
  const subscriberCount =
    extract(html, /"subscriberCountText":\{"simpleText":"([^"]+)"/) ||
    extract(html, /"subscriberCountText":\{"runs":\[\{"text":"([^"]+)"/) ||
    '—';

  // Channel avatar / thumbnail
  const thumbnailUrl =
    extract(html, /"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/) ||
    extract(html, /<meta property="og:image" content="([^"]+)"/) ||
    '';

  // Handle — try to get the @handle from the page
  const handle =
    extract(html, /"canonicalBaseUrl":"\/@([^"]+)"/).replace(/^@/, '') ||
    extract(html, /"vanityUrl":"\/@([^"]+)"/).replace(/^@/, '') ||
    channelName;

  return {
    channel_id: channelId,
    channel_name: channelName || handle,
    handle: `@${handle}`,
    subscriber_count: subscriberCount,
    thumbnail_url: thumbnailUrl,
    uploads_playlist_id: 'UU' + channelId.slice(2),
  };
}

/**
 * Fetch the latest videos from a channel via YouTube's public RSS feed.
 * No API key required. Returns up to 15 most recent videos.
 */
export async function fetchRSSVideos(channelId: string, maxResults = 10): Promise<RSSVideo[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  let xml: string;
  try {
    const res = await fetch(rssUrl, { headers: YT_HEADERS });
    if (!res.ok) throw new Error(`RSS fetch failed: HTTP ${res.status}`);
    xml = await res.text();
  } catch (err: any) {
    throw new Error(`Could not fetch RSS feed: ${err.message}`);
  }

  // Split into <entry> blocks
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

  return entries.slice(0, maxResults).map((entry): RSSVideo => {
    const videoId =
      extract(entry, /<yt:videoId>([^<]+)<\/yt:videoId>/) ||
      extract(entry, /watch\?v=([a-zA-Z0-9_-]{11})/);

    const rawTitle =
      extract(entry, /<media:title>([^<]+)<\/media:title>/) ||
      extract(entry, /<title>([^<]+)<\/title>/);

    // Decode HTML entities in title
    const title = rawTitle
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const publishedAt =
      extract(entry, /<published>([^<]+)<\/published>/) || new Date().toISOString();

    // YouTube thumbnail — prefer hqdefault (480×360) for good quality
    const thumbnailUrl =
      extract(entry, /<media:thumbnail url="([^"]+)"/) ||
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    const description = entry
      .match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1]
      ?.trim()
      ?.slice(0, 500) ?? '';

    const viewCount =
      extract(entry, /views="(\d+)"/) || '0';

    return { video_id: videoId, title, published_at: publishedAt, thumbnail_url: thumbnailUrl, description, view_count: viewCount };
  });
}

/**
 * Fetch videos from a channel's /videos page by scraping ytInitialData.
 * Highly reliable, returns up to 30 recent videos with exact views and duration.
 */
export async function scrapeChannelVideos(input: string): Promise<RSSVideo[]> {
  const baseUrl = toChannelUrl(input);
  const url = baseUrl.endsWith('/videos') ? baseUrl : `${baseUrl}/videos`;

  let html: string;
  try {
    const res = await fetch(url, { headers: YT_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    html = await res.text();
  } catch (err: any) {
    throw new Error(`Could not reach YouTube: ${err.message}`);
  }

  const match = html.match(/var ytInitialData = ({.*?});/);
  if (!match) {
    throw new Error('ytInitialData not found on channel videos page');
  }

  const data = JSON.parse(match[1]);
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const selectedTab = tabs.find((t: any) => t.tabRenderer?.selected === true || t.tabRenderer?.title === 'Videos');

  if (!selectedTab) {
    throw new Error('Videos tab not found in channel data');
  }

  const gridContents = selectedTab.tabRenderer?.content?.richGridRenderer?.contents || [];
  const parsedVideos: RSSVideo[] = [];

  for (const item of gridContents) {
    const vm = item.richItemRenderer?.content?.lockupViewModel;
    if (!vm) continue;

    const videoId = vm.contentId;
    const title = vm.metadata?.lockupMetadataViewModel?.title?.content || '';
    const thumb = vm.contentImage?.thumbnailViewModel?.image?.sources;
    const thumbnailUrl = thumb ? thumb[thumb.length - 1]?.url : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    const rows = vm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
    let views = '';
    let timeAgo = '';
    if (rows.length > 0 && rows[0].metadataParts) {
      views = rows[0].metadataParts[0]?.text?.content || '';
      timeAgo = rows[0].metadataParts[1]?.text?.content || '';
    }

    let duration = '';
    const overlays = vm.contentImage?.thumbnailViewModel?.overlays || [];
    const timeOverlay = overlays.find((o: any) => o.thumbnailOverlayTimeStatusRenderer);
    if (timeOverlay) {
      const textObj = timeOverlay.thumbnailOverlayTimeStatusRenderer.text;
      duration = textObj?.runs?.[0]?.text || textObj?.simpleText || '';
    }

    parsedVideos.push({
      video_id: videoId,
      title,
      published_at: timeAgo || new Date().toISOString(),
      thumbnail_url: thumbnailUrl,
      duration,
      view_count: views,
      description: '', // description not available in this view
    });
  }

  return parsedVideos;
}
