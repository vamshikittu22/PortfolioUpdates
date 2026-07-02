// Gemini Flash AI analyzer for YouTube video transcripts
// Extracts: summary bullets, bullish tickers, bearish tickers, mentioned tickers
// Model: gemini-2.5-flash (free tier: 15 req/min, 1M tokens/day)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLanguageName } from './transcript';

export interface VideoAnalysis {
  summary_bullets: string[];       // 3-5 concise insight bullets
  mentioned_tickers: string[];     // all stock/crypto tickers mentioned
  bullish_on: string[];            // tickers with positive sentiment
  bearish_on: string[];            // tickers with negative sentiment
  key_themes: string[];            // 2-3 macro themes discussed
  confidence: 'high' | 'medium' | 'low';
}

const KNOWN_TICKERS_HINT = `
Common Indian stocks: RELIANCE, TCS, INFY, WIPRO, HCLTECH, HDFC, HDFCBANK, ICICIBANK, SBIN, 
AXISBANK, BAJFINANCE, KOTAKBANK, LT, TITAN, ADANIENT, ADANIPORTS, ADANIGREEN, TATAPOWER, 
TATAMOTORS, TATASTEEL, ZOMATO, PAYTM, NYKAA, DMART, JIOFINANCE, LTIMINDTREE, TECHM, 
SUNPHARMA, DRREDDY, CIPLA, DIVISLAB, MARUTI, M&M, BAJAJ-AUTO, EICHERMOT

Common US stocks: AAPL, MSFT, GOOGL, GOOG, AMZN, META, NVDA, TSLA, BRK.B, JPM, 
V, MA, NFLX, AMD, INTC, QCOM, SBUX, DIS, BA, GS, MS

Common crypto: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, MATIC, LINK, DOT, AVAX, ATOM, LTC
`.trim();

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key') {
    throw new Error('GEMINI_API_KEY is not configured in .env.local');
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Analyze a video transcript using Gemini Flash.
 * Returns structured intelligence about financial topics discussed.
 */
export async function analyzeTranscript(
  transcript: string,
  videoTitle: string,
  channelName: string,
  isTitleOnly: boolean = false,
  detectedLang: string = 'en'
): Promise<VideoAnalysis> {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const langName = getLanguageName(detectedLang);
  const isNonEnglish = detectedLang !== 'en';
  const langContext = isNonEnglish
    ? `\n\nCRITICAL LANGUAGE NOTE: The transcript is in ${langName} (language code: ${detectedLang}). The text may be in ${langName} script or transliterated Latin script. You MUST:\n- Read and understand the ${langName} content fully\n- Translate ALL output values (summary_bullets, key_themes) into clear English\n- Correctly identify stock tickers, company names, and financial terms even when spoken/written in ${langName}\n- Match spoken company names to their NSE/BSE ticker symbols (e.g., "రిలయన్స్" or "रिलायंस" → RELIANCE)`
    : '';

  const prompt = isTitleOnly
    ? `
You are a financial intelligence analyst. A YouTube video titled "${videoTitle}" from "${channelName}" has no transcript available.
Analyze the TITLE to extract likely financial topics, sentiments, and mentioned tickers/assets.

TITLE:
${videoTitle}

TASK: Extract structured financial intelligence based ONLY on the title. Return ONLY valid JSON in this exact format:
{
  "summary_bullets": ["bullet 1", "bullet 2", "bullet 3"],
  "mentioned_tickers": ["TICKER1", "TICKER2"],
  "bullish_on": ["TICKER1"],
  "bearish_on": ["TICKER2"],
  "key_themes": ["theme 1", "theme 2"],
  "confidence": "low"
}

RULES:
- summary_bullets: 2-3 logical inferences or explicit statements directly from the title. E.g., if title says "Gold down 24%", write "The video discusses a significant 24% decline in Gold prices."
- mentioned_tickers: ALL stock/crypto/commodity tickers or names mentioned (e.g., GOLD, SILVER, TSLA).
- bullish_on: tickers where the title implies a POSITIVE outlook or surge.
- bearish_on: tickers where the title implies a NEGATIVE, cautious, or falling outlook.
- key_themes: 1-2 macro themes.
- confidence: MUST be "low" since this is based only on a title.
- multilingual: The title may be in Hindi, Telugu, English, or mixed dialects. Automatically translate all summary_bullets and key_themes to English.${langContext}

KNOWN TICKERS FOR REFERENCE (match to these when possible):
${KNOWN_TICKERS_HINT}
GOLD, SILVER, CRUDEOIL

Return ONLY the JSON object, no markdown, no explanation.
`.trim()
    : `
You are a financial intelligence analyst. Analyze this YouTube video transcript from "${channelName}" titled "${videoTitle}".

TRANSCRIPT:
${transcript}

TASK: Extract structured financial intelligence. Return ONLY valid JSON in this exact format:
{
  "summary_bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "mentioned_tickers": ["TICKER1", "TICKER2"],
  "bullish_on": ["TICKER1"],
  "bearish_on": ["TICKER2"],
  "key_themes": ["theme 1", "theme 2"],
  "confidence": "high"
}

RULES:
- summary_bullets: 3-5 specific, data-rich insights from the video. Include numbers, percentages, timeframes. No generic statements.
- mentioned_tickers: ALL stock/crypto ticker symbols discussed. Use standard ticker format (e.g., TCS not "Tata Consultancy").
- bullish_on: tickers where the speaker/video has a POSITIVE outlook
- bearish_on: tickers where the speaker/video has a NEGATIVE or cautious outlook
- key_themes: 2-3 macro themes (e.g., "Rate cuts", "AI adoption", "FII flows")
- confidence: "high" if transcript is clear and financial, "medium" if partial, "low" if off-topic
- multilingual: The transcript may contain Hindi, Telugu, English, or mixed dialects written in native script or Latin script. Translate all output to English and resolve tickers correctly.${langContext}

KNOWN TICKERS FOR REFERENCE (match to these when possible):
${KNOWN_TICKERS_HINT}

Return ONLY the JSON object, no markdown, no explanation.
`.trim();

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned) as VideoAnalysis;

    // Validate and sanitize
    return {
      summary_bullets: Array.isArray(parsed.summary_bullets)
        ? parsed.summary_bullets.slice(0, 5).filter(Boolean)
        : [],
      mentioned_tickers: Array.isArray(parsed.mentioned_tickers)
        ? [...new Set(parsed.mentioned_tickers.map((t) => t.toUpperCase().trim()).filter(Boolean))]
        : [],
      bullish_on: Array.isArray(parsed.bullish_on)
        ? [...new Set(parsed.bullish_on.map((t) => t.toUpperCase().trim()).filter(Boolean))]
        : [],
      bearish_on: Array.isArray(parsed.bearish_on)
        ? [...new Set(parsed.bearish_on.map((t) => t.toUpperCase().trim()).filter(Boolean))]
        : [],
      key_themes: Array.isArray(parsed.key_themes)
        ? parsed.key_themes.slice(0, 3).filter(Boolean)
        : [],
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence)
        ? parsed.confidence
        : 'medium',
    };
  } catch (err) {
    // Return a minimal fallback if Gemini fails (parse error, quota, etc.)
    console.error('[Gemini] Analysis failed:', err);
    return {
      summary_bullets: ['Analysis unavailable — transcript may be too short or in a non-English language'],
      mentioned_tickers: [],
      bullish_on: [],
      bearish_on: [],
      key_themes: [],
      confidence: 'low',
    };
  }
}

/**
 * Cross-reference mentioned tickers against a user's holdings list
 */
export function crossReferenceHoldings(
  mentionedTickers: string[],
  holdings: string[]
): string[] {
  const holdingSet = new Set(holdings.map((h) => h.toUpperCase()));
  return mentionedTickers.filter((t) => holdingSet.has(t.toUpperCase()));
}
