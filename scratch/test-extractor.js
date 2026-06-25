const { YoutubeTranscript } = require('youtube-transcript');

// Copy extractTickers logic here:
const TICKER_ALIASES = {
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

function generateSummaryBullets(text, maxBullets = 4) {
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 250);

  const financialKeywords = [
    'growth', 'revenue', 'profit', 'loss', 'stock', 'market', 'invest',
    'return', 'fund', 'asset', 'portfolio', 'interest', 'rate', 'inflation',
    'gdp', 'economy', 'quarter', 'annual', 'fy', 'crore', 'billion', 'percent',
    'nifty', 'sensex', 'nasdaq', 'bitcoin', 'crypto', 'earn', 'dividend',
  ];

  const ranked = sentences
    .map((s) => ({
      text: s,
      score: financialKeywords.filter((k) => s.toLowerCase().includes(k)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxBullets)
    .map(({ text }) => text);

  return ranked.length > 0
    ? ranked
    : sentences.slice(0, maxBullets);
}

function extractTickers(text, videoTitle = '') {
  const combined = `${videoTitle} ${text}`;
  const lower = combined.toLowerCase();

  const mentioned = [];
  for (const [ticker, aliases] of Object.entries(TICKER_ALIASES)) {
    const matchedAlias = aliases.find((alias) => lower.includes(alias));
    if (!matchedAlias) continue;
    mentioned.push(ticker);
  }

  const summaryBullets =
    text.length > 100
      ? generateSummaryBullets(text)
      : [`No transcript available — analysis based on video title: "${videoTitle}"`];

  return {
    mentioned_tickers: [...new Set(mentioned)],
    summary_bullets: summaryBullets,
  };
}

async function run() {
  const videoId = '5EWjP9SjTnY'; // Ankur Warikoo video
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    const full_text = segments
      .map((s) => s.text.replace(/\[.*?\]/g, '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    console.log('Transcript word count:', full_text.split(/\s+/).length);
    const result = extractTickers(full_text, "27, Sole Earner, Supporting Family On ₹40,000 | Money Matters Ep. 118 | Ankur Warikoo Hindi");
    console.log('\nExtractor Result:');
    console.log('mentioned_tickers:', result.mentioned_tickers);
    console.log('summary_bullets:', result.summary_bullets);
  } catch (e) {
    console.error('Error:', e);
  }
}

run();
