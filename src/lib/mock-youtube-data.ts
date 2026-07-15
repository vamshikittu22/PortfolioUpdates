// Mock data for YouTube Intelligence page (development only)
// Replace with real API calls in Step 6

export interface YTChannel {
  channel_id: string;
  channel_name: string;
  handle: string;
  avatar_color: string; // tailwind color class for generated avatar
  is_active: boolean;
  subscriber_count: string;
  video_count: number;
}

export interface YTVideo {
  video_id: string;
  channel_id: string;
  channel_name: string;
  channel_handle: string;
  title: string;
  thumbnail_color: string; // CSS gradient for placeholder thumbnail
  thumbnail_url?: string;  // Real thumbnail URL when available (overrides gradient)
  published_at: string; // ISO date string
  duration: string;
  view_count: string;
  transcript_summary: string[];
  mentioned_tickers: string[];
  bullish_on: string[];
  bearish_on: string[];
  key_points: string[];
  affects_portfolio: string[]; // cross-referenced from mock holdings
}

// MOCK_HOLDINGS removed (2026-07-14): the YouTube analyze route now resolves the
// signed-in user's real, RLS-scoped holdings. Cross-referencing video tickers
// against a fabricated portfolio produced "affects your portfolio" claims about
// positions the user does not own. Mock VIDEO/CHANNEL fixtures below remain until
// the YouTube/AI phase replaces them with live data.

export const MOCK_CHANNELS: YTChannel[] = [
  {
    channel_id: 'UC123456',
    channel_name: 'Zerodha Varsity',
    handle: '@zerodha',
    avatar_color: 'from-blue-500 to-blue-700',
    is_active: true,
    subscriber_count: '1.2M',
    video_count: 4,
  },
  {
    channel_id: 'UC234567',
    channel_name: 'Groww',
    handle: '@groww',
    avatar_color: 'from-green-500 to-emerald-700',
    is_active: true,
    subscriber_count: '3.4M',
    video_count: 3,
  },
  {
    channel_id: 'UC345678',
    channel_name: 'FinShot',
    handle: '@finshots',
    avatar_color: 'from-orange-500 to-amber-600',
    is_active: true,
    subscriber_count: '890K',
    video_count: 2,
  },
  {
    channel_id: 'UC456789',
    channel_name: 'CA Rachana Ranade',
    handle: '@carachana',
    avatar_color: 'from-purple-500 to-violet-700',
    is_active: true,
    subscriber_count: '4.1M',
    video_count: 3,
  },
  {
    channel_id: 'UC567890',
    channel_name: 'Whiteboard Finance',
    handle: '@whiteboardfinance',
    avatar_color: 'from-slate-500 to-slate-700',
    is_active: false,
    subscriber_count: '640K',
    video_count: 1,
  },
];

export const MOCK_VIDEOS: YTVideo[] = [
  {
    video_id: 'v001',
    channel_id: 'UC123456',
    channel_name: 'Zerodha Varsity',
    channel_handle: '@zerodha',
    title: 'TCS & Infosys Q1 2025 Results: What Investors Need to Know Right Now',
    thumbnail_color: 'from-blue-600 to-cyan-500',
    published_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
    duration: '18:42',
    view_count: '124K',
    transcript_summary: [
      'TCS reported 4.2% YoY revenue growth beating analyst estimates of 3.8%',
      'Infosys revised FY25 guidance upward to 4.5-5% in constant currency terms',
      'Both companies showed margin expansion driven by reduced attrition rates',
      'Deal wins remain strong with TCS securing $9.4B TCV in Q1',
      'Management commentary points to recovery in BFSI vertical by Q3',
    ],
    mentioned_tickers: ['TCS', 'INFY', 'WIPRO', 'HCL', 'TECHM'],
    bullish_on: ['TCS', 'INFY'],
    bearish_on: ['WIPRO'],
    key_points: [
      'Q1 beat on revenue and margins',
      'Deal pipeline healthy',
      'BFSI recovery expected H2',
    ],
    affects_portfolio: ['TCS', 'INFY'],
  },
  {
    video_id: 'v002',
    channel_id: 'UC234567',
    channel_name: 'Groww',
    channel_handle: '@groww',
    title: 'Reliance Industries: New Energy Business Could 10x the Stock',
    thumbnail_color: 'from-green-600 to-teal-500',
    published_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h ago
    duration: '22:15',
    view_count: '89K',
    transcript_summary: [
      'Reliance New Energy arm has committed ₹75,000 Cr capex over next 3 years',
      'Solar manufacturing capacity targets 10 GW by FY26, positioning India as export hub',
      'Jio Financial Services demerger unlocks hidden value in the conglomerate structure',
      'Retail segment showed 18% EBITDA growth despite competitive headwinds from quick-commerce',
      'Analysts from Goldman and Citi maintain Buy with ₹3,100-3,400 target range',
    ],
    mentioned_tickers: ['RELIANCE', 'JIOFINANCE', 'ADANIGREEN', 'TATAPOWER'],
    bullish_on: ['RELIANCE', 'JIOFINANCE'],
    bearish_on: [],
    key_points: [
      'New Energy is the next big growth driver',
      'Jio Financial Services unlocks value',
      'Analysts bullish with targets up to ₹3,400',
    ],
    affects_portfolio: ['RELIANCE'],
  },
  {
    video_id: 'v003',
    channel_id: 'UC456789',
    channel_name: 'CA Rachana Ranade',
    channel_handle: '@carachana',
    title: 'Bitcoin & Ethereum: Are Crypto Investors Making a Huge Mistake in 2025?',
    thumbnail_color: 'from-purple-600 to-pink-500',
    published_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago
    duration: '31:08',
    view_count: '214K',
    transcript_summary: [
      'Bitcoin ETF inflows crossed $2.1B in June alone, signaling institutional confidence',
      'Ethereum spot ETF approval expected to drive further mainstream adoption',
      'On-chain data shows long-term holders accumulating near current price levels',
      'Macro tailwinds from expected Fed rate cuts in Q3 could boost risk assets significantly',
      'Caution advised: altcoin season may be premature with liquidity still concentrated in BTC/ETH',
    ],
    mentioned_tickers: ['BTC', 'ETH', 'SOL', 'MATIC', 'LINK'],
    bullish_on: ['BTC', 'ETH'],
    bearish_on: ['SOL', 'MATIC'],
    key_points: [
      'ETF inflows signal institutional demand',
      'Rate cut expectations support risk assets',
      'Stay focused on BTC and ETH over alts',
    ],
    affects_portfolio: ['BTC', 'ETH'],
  },
  {
    video_id: 'v004',
    channel_id: 'UC234567',
    channel_name: 'Groww',
    channel_handle: '@groww',
    title: 'Apple WWDC 2025: Should You Buy AAPL Stock Before the AI Reveal?',
    thumbnail_color: 'from-slate-500 to-gray-700',
    published_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1d ago
    duration: '14:33',
    view_count: '67K',
    transcript_summary: [
      'Apple Intelligence features expected to drive significant iPhone upgrade cycle in H2',
      'Services revenue now accounts for 26% of total revenue, growing at 14% YoY',
      'Partnerships with OpenAI and Google for on-device AI could differentiate iOS 19',
      'India manufacturing ramp-up reduces geopolitical risk from China concentration',
      'P/E at 32x appears stretched but justified by recurring Services revenue quality',
    ],
    mentioned_tickers: ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA'],
    bullish_on: ['AAPL', 'NVDA'],
    bearish_on: ['META'],
    key_points: [
      'AI features to drive upgrade supercycle',
      'Services now a dominant profit engine',
      'India manufacturing reduces China risk',
    ],
    affects_portfolio: ['AAPL'],
  },
  {
    video_id: 'v005',
    channel_id: 'UC345678',
    channel_name: 'FinShot',
    channel_handle: '@finshots',
    title: 'Why Paytm Is Bleeding and What It Means for Indian Fintech',
    thumbnail_color: 'from-orange-600 to-red-500',
    published_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2d ago
    duration: '11:20',
    view_count: '445K',
    transcript_summary: [
      'RBI restrictions on Paytm Payments Bank have permanently impaired the core UPI business',
      'Merchant GMV down 40% QoQ as merchants migrate to competitors like PhonePe and GPay',
      'Cash burn rate remains unsustainably high with no clear path to profitability in sight',
      'One97 Communications trading at deep discount but value trap risk is real',
      'Market share lost to PhonePe and Google Pay is structurally unlikely to be recovered',
    ],
    mentioned_tickers: ['PAYTM', 'POLICYBAZAAR', 'NYKAA', 'ZOMATO'],
    bullish_on: [],
    bearish_on: ['PAYTM', 'NYKAA'],
    key_points: [
      'RBI action was a structural setback, not temporary',
      'Merchant base migrating away rapidly',
      'Value trap warning for bargain hunters',
    ],
    affects_portfolio: [],
  },
  {
    video_id: 'v006',
    channel_id: 'UC456789',
    channel_name: 'CA Rachana Ranade',
    channel_handle: '@carachana',
    title: 'Infosys Deep Dive: Is the Rebound Finally Happening?',
    thumbnail_color: 'from-violet-600 to-purple-500',
    published_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3d ago
    duration: '26:44',
    view_count: '178K',
    transcript_summary: [
      'Infosys Q1 FY26 showed strongest deal momentum in 6 quarters with $4.1B TCV',
      'Attrition dropped to 12.7% — lowest in 3 years — indicating workforce stabilization',
      'Generative AI practice has 300+ active client engagements with revenue starting to flow',
      'EBIT margin guidance maintained at 20-22% despite salary hike headwinds',
      'Technical setup shows breakout above ₹1,600 resistance with strong volume confirmation',
    ],
    mentioned_tickers: ['INFY', 'TCS', 'HCLTECH', 'WIPRO', 'LTIMINDTREE'],
    bullish_on: ['INFY', 'HCLTECH'],
    bearish_on: ['LTIMINDTREE'],
    key_points: [
      'Deal momentum at 6-quarter high',
      'GenAI monetization beginning',
      'Technical breakout confirms fundamental recovery',
    ],
    affects_portfolio: ['INFY'],
  },
];
