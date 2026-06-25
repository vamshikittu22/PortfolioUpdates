// Keyword-based financial ticker extractor
// Used as a fallback when Gemini API key is not configured.
// Scans transcript/description text for known ticker aliases.

/** Map of ticker → keywords that indicate this ticker in text */
const TICKER_ALIASES: Record<string, string[]> = {
  // Indian Large Cap
  RELIANCE:   ['reliance', 'ril', 'mukesh ambani', 'jio'],
  TCS:        ['tcs', 'tata consultancy', 'tata consulting'],
  INFY:       ['infosys', 'infy', 'narayana murthy'],
  WIPRO:      ['wipro', 'azim premji'],
  HCLTECH:    ['hcl tech', 'hcltech', 'hcl technologies'],
  HDFC:       ['hdfc', 'housing development finance'],
  HDFCBANK:   ['hdfc bank', 'hdfcbank'],
  ICICIBANK:  ['icici bank', 'icicibank', 'icici'],
  SBIN:       ['sbi', 'state bank', 'state bank of india'],
  AXISBANK:   ['axis bank', 'axisbank'],
  BAJFINANCE: ['bajaj finance', 'bajfinance'],
  KOTAKBANK:  ['kotak bank', 'kotakbank', 'kotak mahindra bank'],
  LT:         ['larsen', 'toubro', 'l&t', 'lt'],
  TITAN:      ['titan'],
  ADANIENT:   ['adani enterprises', 'adani group', 'gautam adani'],
  ADANIPORTS: ['adani ports'],
  ADANIGREEN: ['adani green', 'adani renewable'],
  TATAPOWER:  ['tata power'],
  TATAMOTORS: ['tata motors'],
  TATASTEEL:  ['tata steel'],
  ZOMATO:     ['zomato'],
  PAYTM:      ['paytm', 'one97'],
  NYKAA:      ['nykaa'],
  DMART:      ['dmart', 'avenue supermarts', 'radhakishan damani'],
  JIOFINANCE: ['jio financial', 'jio finance'],
  LTIMINDTREE:['ltimindtree', 'lti mindtree'],
  TECHM:      ['tech mahindra', 'techm'],
  SUNPHARMA:  ['sun pharma', 'sunpharma', 'sun pharmaceutical'],
  DRREDDY:    ['dr reddy', 'drreddy'],
  CIPLA:      ['cipla'],
  DIVISLAB:   ['divis lab', 'divi lab', 'divislab'],
  MARUTI:     ['maruti', 'maruti suzuki'],
  BAJAJ_AUTO: ['bajaj auto'],
  EICHERMOT:  ['eicher motors', 'royal enfield'],
  NIFTY50:    ['nifty 50', 'nifty50', 'nifty'],
  SENSEX:     ['sensex', 'bse sensex'],

  // US Stocks
  AAPL:  ['apple', 'aapl', 'iphone', 'tim cook'],
  MSFT:  ['microsoft', 'msft', 'satya nadella'],
  GOOGL: ['google', 'googl', 'alphabet', 'sundar pichai'],
  AMZN:  ['amazon', 'amzn', 'jeff bezos', 'andy jassy'],
  META:  ['meta', 'facebook', 'zuckerberg', 'mark zuckerberg'],
  NVDA:  ['nvidia', 'nvda', 'jensen huang'],
  TSLA:  ['tesla', 'tsla', 'elon musk'],
  JPM:   ['jpmorgan', 'jp morgan', 'jamie dimon'],
  NFLX:  ['netflix', 'nflx'],
  AMD:   ['amd', 'advanced micro devices'],
  INTC:  ['intel', 'intc'],
  SPY:   ['s&p 500', 'sp500', 's&p500'],
  QQQ:   ['nasdaq', 'qqq'],

  // Crypto
  BTC:   ['bitcoin', 'btc', 'satoshi'],
  ETH:   ['ethereum', 'eth', 'ether', 'vitalik'],
  SOL:   ['solana', 'sol'],
  BNB:   ['bnb', 'binance coin'],
  XRP:   ['xrp', 'ripple'],
  ADA:   ['cardano', 'ada'],
  DOGE:  ['dogecoin', 'doge'],
  MATIC: ['polygon', 'matic'],
  LINK:  ['chainlink', 'link'],
  DOT:   ['polkadot', 'dot'],
  AVAX:  ['avalanche', 'avax'],
  LTC:   ['litecoin', 'ltc'],
};

/** Positive sentiment words near a ticker mention (English, Hindi, Telugu) */
const BULLISH_WORDS = [
  'bullish', 'buy', 'strong buy', 'outperform', 'overweight', 'upgrade',
  'growth', 'upside', 'target price', 'accumulate', 'positive', 'opportunity',
  'undervalued', 'value pick', 'add', 'momentum', 'breakout', 'rally',
  'beat', 'beats estimates', 'guidance raised', 're-rating',
  // Hindi Transliterated & Native
  'kharid', 'fayda', 'faida', 'मुनाफा', 'tezi', 'up jayega', 'badhega', 'double', 'fayde',
  'खरीद', 'फायदा', 'तेज़ी', 'बढ़ेगा', 'मुनाफ़ा',
  // Telugu Transliterated & Native
  'konu', 'labham', 'kono', 'perugutundi', 'paiki',
  'కొనండి', 'లాభం', 'పెరుగుతుంది'
];

/** Negative sentiment words near a ticker mention (English, Hindi, Telugu) */
const BEARISH_WORDS = [
  'bearish', 'sell', 'underperform', 'underweight', 'downgrade',
  'decline', 'weak', 'avoid', 'overvalued', 'expensive', 'correction',
  'crash', 'miss', 'missed estimates', 'guidance cut', 'warning',
  'caution', 'risk', 'headwind', 'pressure', 'debt',
  // Hindi Transliterated & Native
  'bech', 'nuksan', 'ghata', 'gira', 'down jayega', 'khatra', 'mandi', 'karz',
  'बेच', 'नुकसान', 'घाटा', 'गिरेगा', 'खतरा', 'मंदी', 'कर्ज',
  // Telugu Transliterated & Native
  'ammu', 'nashtam', 'taggutundi', 'kindaki', 'appu',
  'అమ్మండి', 'నష్టం', 'తగ్గుతుంది', 'అప్పు'
];

export interface TickerResult {
  mentioned_tickers: string[];
  bullish_on: string[];
  bearish_on: string[];
  summary_bullets: string[];
  key_themes: string[];
}

/** Get a ~300-char window around a keyword match for sentiment analysis */
function getContext(text: string, keyword: string, windowSize = 300): string {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return '';
  return text.slice(Math.max(0, idx - windowSize), idx + windowSize);
}

/** Naive sentiment: count bullish vs bearish words in context */
function detectSentiment(context: string): 'bullish' | 'bearish' | 'neutral' {
  const lower = context.toLowerCase();
  const b = BULLISH_WORDS.filter((w) => lower.includes(w)).length;
  const r = BEARISH_WORDS.filter((w) => lower.includes(w)).length;
  if (b > r) return 'bullish';
  if (r > b) return 'bearish';
  return 'neutral';
}

/** Auto-generate simple bullets from the text (sentence extraction with fallback chunking) */
function generateSummaryBullets(text: string, maxBullets = 4): string[] {
  let sentences: string[] = [];
  
  // YouTube transcripts often lack standard punctuation (.!?।?). 
  // If no punctuation is detected, split the text into chunks of 20 words (pseudo-sentences).
  if (!/[.!?।?]/.test(text)) {
    const words = text.replace(/\n+/g, ' ').split(/\s+/).filter(Boolean);
    const chunkSize = 20;
    for (let i = 0; i < words.length; i += chunkSize) {
      sentences.push(words.slice(i, i + chunkSize).join(' '));
    }
  } else {
    sentences = text
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?।?])\s+/)
      .map((s) => s.trim());
  }

  // Filter sentences by reasonable lengths
  const filtered = sentences.filter((s) => s.length > 30 && s.length < 300);

  // Pick sentences that contain financial keywords in English, Hindi, or Telugu
  const financialKeywords = [
    // English
    'growth', 'revenue', 'profit', 'loss', 'stock', 'market', 'invest',
    'return', 'fund', 'asset', 'portfolio', 'interest', 'rate', 'inflation',
    'gdp', 'economy', 'quarter', 'annual', 'fy', 'crore', 'billion', 'percent',
    'nifty', 'sensex', 'nasdaq', 'bitcoin', 'crypto', 'earn', 'dividend',
    'debt', 'loan', 'salary', 'income', 'expense', 'retire', 'saving',
    // Hindi
    'faida', 'nuksan', 'मुनाफा', 'ghata', 'fayda', 'invest', 'bachat', 'kamai',
    'kharch', 'loan', 'karz', 'biaz', 'dar', 'paise', 'rupay', 'sip', 'fd',
    'निवेश', 'कमाई', 'खर्च', 'कर्ज', 'ब्याज', 'रुपये', 'लाभांश',
    // Telugu
    'labham', 'nashtam', 'konu', 'ammu', 'pettu badi', 'podupu', 'sampadana',
    'karchu', 'appu', 'vaddi', 'dabbu', 'dabbulu',
    'కొనండి', 'లాభం', 'నష్టం', 'పెట్టుబడి', 'పొదుపు', 'సంపాదన', 'ఖర్చు', 'అప్పు', 'వడ్డీ'
  ];

  const ranked = filtered
    .map((s) => ({
      text: s,
      score: financialKeywords.filter((k) => s.toLowerCase().includes(k)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, maxBullets)
    .map(({ text }) => text);

  // Fallback if no matching financial sentences were found
  if (ranked.length > 0) {
    return ranked;
  }
  return filtered.slice(0, maxBullets);
}

/** Generate simple macro themes from text (multilingual support) */
function detectThemes(text: string): string[] {
  const lower = text.toLowerCase();
  const themes: string[] = [];
  
  if (lower.includes('rate') || lower.includes('rbi') || lower.includes('fed') || lower.includes('interest') || lower.includes('ब्याज') || lower.includes('vaddi')) themes.push('Interest Rates');
  if (lower.includes('inflation') || lower.includes('cpi') || lower.includes('wpi') || lower.includes('महंगाई') || lower.includes('dhara')) themes.push('Inflation');
  if (lower.includes('gdp') || lower.includes('economy') || lower.includes('growth') || lower.includes('विकास') || lower.includes('abhivrudhi')) themes.push('Economic Growth');
  if (lower.includes('ai') || lower.includes('artificial intelligence') || lower.includes('machine learning') || lower.includes('तकनीक')) themes.push('AI Adoption');
  if (lower.includes('fii') || lower.includes('foreign') || lower.includes('dii') || lower.includes('विदेशी')) themes.push('FII/DII Flows');
  if (lower.includes('earning') || lower.includes('result') || lower.includes('quarter') || lower.includes('कमाई') || lower.includes('labham')) themes.push('Earnings Season');
  if (lower.includes('ipo') || lower.includes('listing')) themes.push('IPO Activity');
  if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('blockchain')) themes.push('Crypto Markets');
  if (lower.includes('real estate') || lower.includes('realty') || lower.includes('housing') || lower.includes('घर')) themes.push('Real Estate');
  
  return themes.slice(0, 3);
}

/**
 * Extract ticker mentions + naive bullish/bearish sentiment
 * from a block of text (transcript or description).
 * Used when Gemini API key is not available.
 */
export function extractTickers(text: string, videoTitle = ''): TickerResult {
  const combined = `${videoTitle} ${text}`;
  const lower = combined.toLowerCase();

  const mentioned: string[] = [];
  const bullish: string[] = [];
  const bearish: string[] = [];

  for (const [ticker, aliases] of Object.entries(TICKER_ALIASES)) {
    const matchedAlias = aliases.find((alias) => lower.includes(alias));
    if (!matchedAlias) continue;

    mentioned.push(ticker);

    // Sentiment: check context around the keyword
    const context = getContext(combined, matchedAlias);
    const sentiment = detectSentiment(context);
    if (sentiment === 'bullish') bullish.push(ticker);
    else if (sentiment === 'bearish') bearish.push(ticker);
  }

  const summaryBullets =
    text.length > 100
      ? generateSummaryBullets(text)
      : [`No transcript available — analysis based on video title: "${videoTitle}"`];

  return {
    mentioned_tickers: [...new Set(mentioned)],
    bullish_on: [...new Set(bullish)],
    bearish_on: [...new Set(bearish)],
    summary_bullets: summaryBullets,
    key_themes: detectThemes(combined),
  };
}
