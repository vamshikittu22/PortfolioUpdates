// Transcript fetcher using YouTube's private InnerTube API directly.
//
// No API key required. We POST to https://www.youtube.com/youtubei/v1/player
// with a public mobile-app ("ANDROID") client context — the same request the
// official YouTube app makes. The response contains the caption track list
// (captions.playerCaptionsTracklistRenderer.captionTracks) with a signed
// baseUrl per track, which we fetch as `fmt=json3` and parse into text.
//
// Why this replaced the `youtube-transcript` npm package: that package scraped
// `ytInitialPlayerResponse` from the watch page and required an English track
// (native → en → hi). YouTube's page changes broke it for most videos, and it
// silently failed for auto-generated (ASR) NON-English tracks — so Hindi/Telugu
// finance videos degraded to title-only analysis. This fetcher never requires
// English: it picks the best available track in the video's ORIGINAL language.
//
// NOTE: InnerTube is undocumented and reverse-engineered. The client version
// below may need bumping if YouTube changes its contract. There is no secret
// here — the client name/version are public values baked into youtube.com and
// the official apps; no INNERTUBE_API_KEY is needed for the player endpoint.

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

// Public InnerTube clients (verified working). ANDROID is primary; IOS is a
// fallback used only when ANDROID fails to return a usable response, for
// resilience against client-specific breakage. Neither requires an API key.
interface InnerTubeClient {
  clientName: string;
  clientVersion: string;
  clientNameId: string; // X-YouTube-Client-Name header value
  userAgent: string;
  extra?: Record<string, unknown>;
}

const CLIENTS: InnerTubeClient[] = [
  {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    clientNameId: '3',
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    extra: { androidSdkVersion: 30 },
  },
  {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    clientNameId: '5',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
  },
];

const FETCH_TIMEOUT_MS = 15_000;

export interface TranscriptResult {
  video_id: string;
  full_text: string;
  word_count: number;
  segment_count: number;
  char_count: number;
  detected_lang: string;
  /** Whether the chosen track was human-authored ('manual') or auto-generated ('asr'). */
  source_kind: 'manual' | 'asr' | null;
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
  return LANG_NAMES[baseLang(code)] || code;
}

/** Normalise a caption languageCode to its base (e.g. 'en-IN' → 'en', 'te' → 'te'). */
function baseLang(code: string): string {
  return (code || '').split('-')[0].toLowerCase();
}

// Shape of the pieces of the InnerTube player response we consume.
interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // 'asr' for auto-generated; absent for manual tracks
}

interface Json3Segment {
  utf8?: string;
}
interface Json3Event {
  segs?: Json3Segment[];
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Call the InnerTube player endpoint with a given client. Returns parsed JSON. */
async function callPlayer(videoId: string, client: InnerTubeClient): Promise<any> {
  const res = await fetchWithTimeout(INNERTUBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.userAgent,
      'Accept-Language': 'en',
      'X-YouTube-Client-Name': client.clientNameId,
      'X-YouTube-Client-Version': client.clientVersion,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: client.clientName,
          clientVersion: client.clientVersion,
          hl: 'en',
          gl: 'US',
          ...(client.extra || {}),
        },
      },
      videoId,
    }),
  });
  if (!res.ok) {
    throw new Error(`InnerTube player HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Choose the best caption track. NEVER requires English.
 * Priority:
 *   1. Manual (human) caption in the video's ORIGINAL language.
 *   2. Manual caption in ANY language (e.g. a human English translation).
 *   3. ASR (auto-generated) caption in the ORIGINAL language — the core fix
 *      for Hindi/Telugu videos that only carry a native auto-caption.
 *   4. ASR caption in any language.
 * The "original language" is inferred from the ASR track's languageCode, which
 * YouTube derives from the spoken audio.
 */
function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks || tracks.length === 0) return null;

  const manual = tracks.filter((t) => t.kind !== 'asr');
  const asr = tracks.filter((t) => t.kind === 'asr');
  const originalLang = asr.length > 0 ? baseLang(asr[0].languageCode) : null;

  if (originalLang) {
    const manualOriginal = manual.find((t) => baseLang(t.languageCode) === originalLang);
    if (manualOriginal) return manualOriginal;
  }
  if (manual.length > 0) return manual[0];
  if (originalLang) {
    const asrOriginal = asr.find((t) => baseLang(t.languageCode) === originalLang);
    if (asrOriginal) return asrOriginal;
  }
  return asr[0] || tracks[0] || null;
}

/** Fetch a caption track's baseUrl as json3 and return its ordered text segments. */
async function fetchTrackSegments(track: CaptionTrack, userAgent: string): Promise<string[]> {
  // baseUrl already carries `&fmt=srv3` (XML). Override it to json3 which is
  // cleaner to parse. URL.searchParams.set replaces the existing param.
  const url = new URL(track.baseUrl);
  url.searchParams.set('fmt', 'json3');

  const res = await fetchWithTimeout(url.toString(), {
    headers: { 'User-Agent': userAgent, 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Caption fetch HTTP ${res.status}`);

  const data = JSON.parse(await res.text()) as { events?: Json3Event[] };
  const segments: string[] = [];
  for (const ev of data.events || []) {
    if (!ev.segs) continue;
    const line = ev.segs.map((s) => s.utf8 || '').join('');
    const cleaned = line.replace(/\s+/g, ' ').trim();
    if (cleaned) segments.push(cleaned);
  }
  return segments;
}

/**
 * Fetch the transcript for a YouTube video via the InnerTube API.
 * Returns available:false with a clear error when the video has no caption
 * tracks or is not playable — it NEVER fabricates a transcript.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const emptyResult: TranscriptResult = {
    video_id: videoId,
    full_text: '',
    word_count: 0,
    segment_count: 0,
    char_count: 0,
    detected_lang: '',
    source_kind: null,
    available: false,
  };

  let lastError = 'Transcript unavailable for this video';
  let sawPlayableNoTracks = false;

  for (const client of CLIENTS) {
    let player: any;
    try {
      player = await callPlayer(videoId, client);
    } catch (err: any) {
      lastError = `InnerTube request failed: ${err?.message || 'network error'}`;
      continue;
    }

    const status: string = player?.playabilityStatus?.status || 'UNKNOWN';
    const tracks: CaptionTrack[] =
      player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (status !== 'OK') {
      lastError = `Video not playable (${status})`;
      continue; // try next client — it may be a client-specific gate
    }
    if (tracks.length === 0) {
      // Playable but genuinely has no captions — a definitive answer.
      sawPlayableNoTracks = true;
      lastError = 'Video has no caption tracks';
      continue;
    }

    const track = pickBestTrack(tracks);
    if (!track) {
      sawPlayableNoTracks = true;
      lastError = 'No usable caption track found';
      continue;
    }

    try {
      const segments = await fetchTrackSegments(track, client.userAgent);
      if (segments.length === 0) {
        lastError = 'Caption track was empty';
        continue;
      }
      return buildResult(videoId, segments, track);
    } catch (err: any) {
      lastError = `Caption download failed: ${err?.message || 'network error'}`;
      continue;
    }
  }

  return {
    ...emptyResult,
    error: sawPlayableNoTracks ? 'No captions available for this video' : lastError,
  };
}

/**
 * Build a TranscriptResult from ordered json3 text segments.
 * Handles non-Latin scripts (Telugu, Hindi, etc.) properly for counting.
 */
function buildResult(
  videoId: string,
  segments: string[],
  track: CaptionTrack
): TranscriptResult {
  const full_text = segments
    .map((s) => s.replace(/\[.*?\]/g, '').trim()) // strip [Music], [संगीत], [♪♪♪] etc.
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Language comes straight from the chosen track's languageCode (accurate).
  const detected_lang = baseLang(track.languageCode) || inferLanguage(full_text);
  const word_count = full_text.split(/\s+/).filter(Boolean).length;

  return {
    video_id: videoId,
    full_text,
    word_count,
    segment_count: segments.length,
    char_count: full_text.length,
    detected_lang,
    source_kind: track.kind === 'asr' ? 'asr' : 'manual',
    available: true,
  };
}

/**
 * Infer language from text content by checking Unicode script ranges.
 * Fallback only — used when a track has no languageCode (rare).
 */
function inferLanguage(text: string): string {
  const teluguChars = (text.match(/[ఀ-౿]/g) || []).length;
  const devanagariChars = (text.match(/[ऀ-ॿ]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const tamilChars = (text.match(/[஀-௿]/g) || []).length;
  const kannadaChars = (text.match(/[ಀ-೿]/g) || []).length;

  const max = Math.max(teluguChars, devanagariChars, latinChars, tamilChars, kannadaChars);
  if (max === 0) return 'en';

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
