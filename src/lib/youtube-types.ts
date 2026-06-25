// Shared types for the live YouTube intelligence features
// Used by the videos API, analyze API, and LiveVideoCard component

export interface LiveVideo {
  video_id: string;
  channel_id: string;
  channel_name: string;
  title: string;
  published_at: string;
  thumbnail_url: string;
  duration: string;
  view_count: string;
  description: string;
  // Analysis state — populated after user clicks Analyze
  analysis_status: 'idle' | 'analyzing' | 'done' | 'error';
  analysis?: VideoAnalysis;
  error_msg?: string;
}

export interface VideoAnalysis {
  summary_bullets: string[];
  mentioned_tickers: string[];
  bullish_on: string[];
  bearish_on: string[];
  key_themes: string[];
  affects_portfolio: string[];
  confidence: 'high' | 'medium' | 'low';
  analysis_source: 'gemini' | 'keyword' | 'description_only';
  transcript_available: boolean;
  raw_transcript?: string;
}

/** Group a list of videos by relative week label */
export function groupByWeek(videos: LiveVideo[]): { label: string; videos: LiveVideo[] }[] {
  const now = Date.now();
  const DAY = 86_400_000;

  const buckets: Record<string, LiveVideo[]> = {};

  for (const v of videos) {
    const age = now - new Date(v.published_at).getTime();
    const days = Math.floor(age / DAY);

    let label: string;
    if (days < 1) label = 'Today';
    else if (days < 7) label = 'This Week';
    else if (days < 14) label = 'Last Week';
    else if (days < 21) label = '2 Weeks Ago';
    else if (days < 28) label = '3 Weeks Ago';
    else if (days < 60) label = 'Last Month';
    else {
      const d = new Date(v.published_at);
      label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }

    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(v);
  }

  // Sort buckets by the newest video in each group
  return Object.entries(buckets)
    .map(([label, vids]) => ({ label, videos: vids }))
    .sort((a, b) => {
      const aTime = Math.max(...a.videos.map((v) => new Date(v.published_at).getTime()));
      const bTime = Math.max(...b.videos.map((v) => new Date(v.published_at).getTime()));
      return bTime - aTime;
    });
}
