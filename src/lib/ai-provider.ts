import { GoogleGenerativeAI } from '@google/generative-ai';
import type { VideoAnalysis } from './gemini';

const KNOWN_TICKERS_HINT = `
Common Indian stocks: RELIANCE, TCS, INFY, WIPRO, HCLTECH, HDFC, HDFCBANK, ICICIBANK, SBIN, 
AXISBANK, BAJFINANCE, KOTAKBANK, LT, TITAN, ADANIENT, ADANIPORTS, ADANIGREEN, TATAPOWER, 
TATAMOTORS, TATASTEEL, ZOMATO, PAYTM, NYKAA, DMART, JIOFINANCE, LTIMINDTREE, TECHM, 
SUNPHARMA, DRREDDY, CIPLA, DIVISLAB, MARUTI, M&M, BAJAJ-AUTO, EICHERMOT

Common US stocks: AAPL, MSFT, GOOGL, GOOG, AMZN, META, NVDA, TSLA, BRK.B, JPM, 
V, MA, NFLX, AMD, INTC, QCOM, SBUX, DIS, BA, GS, MS

Common crypto: BTC, ETH, SOL, BNB, XRP, ADA, DOGE, MATIC, LINK, DOT, AVAX, ATOM, LTC
`.trim();

function buildPrompt(transcript: string, videoTitle: string, channelName: string, isTitleOnly: boolean) {
  if (isTitleOnly) {
    return `You are a financial intelligence analyst. A YouTube video titled "${videoTitle}" from "${channelName}" has no transcript available.
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
- summary_bullets: 2-3 logical inferences or explicit statements directly from the title.
- mentioned_tickers: ALL stock/crypto/commodity tickers or names mentioned (e.g., GOLD, SILVER, TSLA).
- bullish_on: tickers where the title implies a POSITIVE outlook or surge.
- bearish_on: tickers where the title implies a NEGATIVE, cautious, or falling outlook.
- key_themes: 1-2 macro themes.
- confidence: MUST be "low" since this is based only on a title.
- multilingual: The title may be in Hindi, Telugu, English, or mixed dialects (Hinglish/Telglish). Automatically translate all summary_bullets and key_themes to English.

KNOWN TICKERS FOR REFERENCE (match to these when possible):
${KNOWN_TICKERS_HINT}
GOLD, SILVER, CRUDEOIL

Return ONLY the JSON object, no markdown, no explanation.`;
  }

  return `You are a financial intelligence analyst. Analyze this YouTube video transcript from "${channelName}" titled "${videoTitle}".

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
- multilingual: The transcript may contain Hindi, Telugu, English, or mixed dialects (Hinglish/Telglish) written in native script (Devnagari, Telugu) or Latin script. Automatically translate all output values (summary_bullets, key_themes) into English, and resolve tickers correctly.

KNOWN TICKERS FOR REFERENCE:
${KNOWN_TICKERS_HINT}

Return ONLY the JSON object, no markdown, no explanation.`;
}

function parseJSONSafely(text: string): VideoAnalysis {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  
  const parsed = JSON.parse(cleaned) as Partial<VideoAnalysis>;

  return {
    summary_bullets: Array.isArray(parsed.summary_bullets) ? parsed.summary_bullets.slice(0, 5).filter(Boolean) : [],
    mentioned_tickers: Array.isArray(parsed.mentioned_tickers) ? [...new Set(parsed.mentioned_tickers.map(t => t.toUpperCase().trim()).filter(Boolean))] : [],
    bullish_on: Array.isArray(parsed.bullish_on) ? [...new Set(parsed.bullish_on.map(t => t.toUpperCase().trim()).filter(Boolean))] : [],
    bearish_on: Array.isArray(parsed.bearish_on) ? [...new Set(parsed.bearish_on.map(t => t.toUpperCase().trim()).filter(Boolean))] : [],
    key_themes: Array.isArray(parsed.key_themes) ? parsed.key_themes.slice(0, 3).filter(Boolean) : [],
    confidence: parsed.confidence && ['high', 'medium', 'low'].includes(parsed.confidence) ? (parsed.confidence as 'high'|'medium'|'low') : 'medium',
  };
}

async function callOpenAICompatible(url: string, apiKey: string, model: string, prompt: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only API. You must output ONLY valid JSON without any markdown formatting.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
    })
  });
  
  if (!res.ok) throw new Error(`API returned ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callClaude(apiKey: string, prompt: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // If running server-side, this header may not be strictly required or might need to be 'true' in some environments if CORS isn't bypassed, but since this is called from the API route (server), we don't need CORS bypass.
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      system: 'You are a strict JSON-only API. You must output ONLY valid JSON without any markdown formatting.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Claude API returned ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.content[0].text;
}

export async function analyzeTranscriptWithProvider(
  provider: string,
  apiKey: string | undefined,
  transcript: string,
  videoTitle: string,
  channelName: string,
  isTitleOnly = false
): Promise<VideoAnalysis> {
  const prompt = buildPrompt(transcript, videoTitle, channelName, isTitleOnly);

  try {
    let resultText = '';
    
    // Resolve fallback API keys safely
    const resolvedKey = apiKey || (provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env[`${provider.toUpperCase()}_API_KEY`]);
    
    if (!resolvedKey || resolvedKey.includes('your-')) {
      throw new Error(`No valid API key provided for ${provider}`);
    }

    switch (provider) {
      case 'openai':
        resultText = await callOpenAICompatible('https://api.openai.com/v1/chat/completions', resolvedKey, 'gpt-4o-mini', prompt);
        break;
      case 'claude':
        resultText = await callClaude(resolvedKey, prompt);
        break;
      case 'openrouter':
        resultText = await callOpenAICompatible('https://openrouter.ai/api/v1/chat/completions', resolvedKey, 'meta-llama/llama-3-8b-instruct:free', prompt);
        break;
      case 'nvidia':
        resultText = await callOpenAICompatible('https://integrate.api.nvidia.com/v1/chat/completions', resolvedKey, 'meta/llama-3.1-8b-instruct', prompt);
        break;
      case 'huggingface':
        resultText = await callOpenAICompatible('https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct/v1/chat/completions', resolvedKey, 'meta-llama/Meta-Llama-3-8B-Instruct', prompt);
        break;
      case 'gemini':
      default:
        const genAI = new GoogleGenerativeAI(resolvedKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const res = await model.generateContent(prompt);
        resultText = res.response.text();
        break;
    }

    return parseJSONSafely(resultText);

  } catch (err: any) {
    console.error(`[${provider.toUpperCase()}] Analysis failed:`, err);
    return {
      summary_bullets: [`Analysis unavailable — ${err.message || 'Model API failed'}`],
      mentioned_tickers: [],
      bullish_on: [],
      bearish_on: [],
      key_themes: [],
      confidence: 'low',
    };
  }
}
