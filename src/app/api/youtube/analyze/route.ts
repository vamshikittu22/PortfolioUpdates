import { NextResponse } from 'next/server';
import { fetchTranscript, truncateTranscript } from '@/lib/transcript';
import { analyzeTranscriptWithProvider } from '@/lib/ai-provider';
import { crossReferenceHoldings } from '@/lib/gemini';
import { extractTickers } from '@/lib/ticker-extractor';
import { MOCK_HOLDINGS } from '@/lib/mock-youtube-data';

export async function POST(request: Request) {
  const hasGeminiKey =
    !!process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your-gemini-api-key';

  try {
    const body = await request.json();
    const { video_id, title, channel_name, holdings = MOCK_HOLDINGS, ai_provider = 'gemini', ai_api_key } = body;

    if (!video_id) {
      return NextResponse.json({ success: false, error: 'video_id is required' }, { status: 400 });
    }

    const transcriptResult = await fetchTranscript(video_id);
    const analysisText = transcriptResult.available
      ? truncateTranscript(transcriptResult.full_text, 4000)
      : title;

    // We always have a key if ai_api_key is provided or if env has gemini key (default fallback)
    const canUseAI = !!ai_api_key || hasGeminiKey;

    if (canUseAI) {
      // Use char_count for non-Latin scripts (Telugu/Hindi don't split on spaces the same way)
      // A transcript with 200+ chars or 50+ segments is substantial enough for analysis
      const isSubstantial = transcriptResult.available && (
        transcriptResult.char_count >= 200 || transcriptResult.segment_count >= 30
      );
      const isTitleOnly = !isSubstantial;
      const analysis = await analyzeTranscriptWithProvider(
        ai_provider, ai_api_key, analysisText, title, channel_name || '', isTitleOnly,
        transcriptResult.detected_lang || 'en'
      );
      const affectsPortfolio = crossReferenceHoldings(analysis.mentioned_tickers, holdings);
      
      return NextResponse.json({
        success: true,
        analysis: {
          ...analysis,
          affects_portfolio: affectsPortfolio,
          transcript_available: transcriptResult.available,
          raw_transcript: transcriptResult.available ? transcriptResult.full_text : undefined,
          analysis_source: 'gemini',
        }
      });
    } else {
      const extracted = extractTickers(analysisText, title);
      const affectsPortfolio = crossReferenceHoldings(extracted.mentioned_tickers, holdings);
      
      return NextResponse.json({
        success: true,
        analysis: {
          ...extracted,
          affects_portfolio: affectsPortfolio,
          confidence: transcriptResult.available ? 'medium' : 'low',
          transcript_available: transcriptResult.available,
          raw_transcript: transcriptResult.available ? transcriptResult.full_text : undefined,
          analysis_source: transcriptResult.available ? 'keyword' : 'description_only',
        }
      });
    }

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Analysis failed' }, { status: 500 });
  }
}
