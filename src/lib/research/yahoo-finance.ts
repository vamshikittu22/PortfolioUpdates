// =============================================================================
// FolioIntel Research Module — Yahoo Finance Fetcher
// =============================================================================
// Free public API integrator for real-time stock quotes, valuations,
// and historical monthly prices.
// =============================================================================

export interface YahooStats {
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  weekHigh52: number;
  weekLow52: number;
  volume: number;
  avgVolume: number;
  peRatio: number | null;
  pbRatio: number | null;
  bookValue: number | null;
  roe: number | null;
  netMargin: number | null;
  operatingMargin: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  currency: string;
  historicalPrices: { date: string; close: number }[];
}

/**
 * Resolves the symbol ticker to its corresponding Yahoo Finance format.
 * Appends '.NS' (NSE) for Indian equities in our registry.
 */
function resolveYahooSymbol(ticker: string): string {
  const indianTickers = ['HDFCBANK', 'TATASTEEL', 'YESBANK', 'RELIANCE', 'TCS', 'INFY', 'ZOMATO', 'PAYTM', 'PARAS'];
  const upper = ticker.trim().toUpperCase();
  if (indianTickers.includes(upper)) {
    return `${upper}.NS`;
  }
  return upper;
}

/**
 * Fetch real-time quotes, key statistics, and historical prices from Yahoo Finance.
 * Includes graceful error handling to fall back to simulated parameters if blocked or unavailable.
 */
export async function fetchYahooFinanceData(ticker: string): Promise<YahooStats | null> {
  const symbol = resolveYahooSymbol(ticker);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  try {
    // 1. Fetch Quote Summary (real-time stats & valuation multiples)
    const quoteUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,financialData,price`;
    const quoteRes = await fetch(quoteUrl, { headers, next: { revalidate: 3600 } }); // Cache for 1 hour

    if (!quoteRes.ok) {
      throw new Error(`Quote request failed with status ${quoteRes.status}`);
    }

    const quoteData = await quoteRes.json();
    const result = quoteData?.quoteSummary?.result?.[0];

    if (!result) {
      throw new Error('Quote summary result not found');
    }

    const price = result.price || {};
    const summaryDetail = result.summaryDetail || {};
    const defaultKeyStatistics = result.defaultKeyStatistics || {};
    const financialData = result.financialData || {};

    // 2. Fetch Chart Data (historical monthly close prices over last 5 years)
    const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1mo`;
    const chartRes = await fetch(chartUrl, { headers, next: { revalidate: 86400 } }); // Cache for 24 hours
    
    let historicalPrices: { date: string; close: number }[] = [];
    if (chartRes.ok) {
      const chartData = await chartRes.json();
      const timestamps = chartData?.chart?.result?.[0]?.timestamp || [];
      const indicators = chartData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      
      historicalPrices = timestamps.map((ts: number, idx: number) => {
        const date = new Date(ts * 1000).toISOString().split('T')[0];
        const close = indicators[idx];
        return { date, close };
      }).filter((pt: any) => pt.close !== null && pt.close !== undefined);
    }

    // Extract statistics values safely with fallback to null
    const currentPrice = price.regularMarketPrice?.raw || summaryDetail.regularMarketPrice?.raw || financialData.currentPrice?.raw || 0;
    const previousClose = price.regularMarketPreviousClose?.raw || summaryDetail.previousClose?.raw || 0;
    const dayChange = currentPrice - previousClose;
    const dayChangePercent = previousClose > 0 ? (dayChange / previousClose) * 100 : 0;

    return {
      currentPrice,
      previousClose,
      dayChange,
      dayChangePercent,
      weekHigh52: summaryDetail.fiftyTwoWeekHigh?.raw || 0,
      weekLow52: summaryDetail.fiftyTwoWeekLow?.raw || 0,
      volume: summaryDetail.volume?.raw || 0,
      avgVolume: summaryDetail.averageVolume?.raw || 0,
      peRatio: summaryDetail.trailingPE?.raw || summaryDetail.forwardPE?.raw || null,
      pbRatio: defaultKeyStatistics.priceToBook?.raw || null,
      bookValue: defaultKeyStatistics.bookValue?.raw || null,
      roe: financialData.returnOnEquity?.raw ? financialData.returnOnEquity.raw * 100 : null, // Convert to %
      netMargin: financialData.profitMargins?.raw ? financialData.profitMargins.raw * 100 : null,
      operatingMargin: financialData.operatingMargins?.raw ? financialData.operatingMargins.raw * 100 : null,
      debtToEquity: financialData.debtToEquity?.raw ? financialData.debtToEquity.raw / 100 : null, // Yahoo returns as %, convert to ratio
      dividendYield: summaryDetail.dividendYield?.raw ? summaryDetail.dividendYield.raw * 100 : null,
      currency: price.currency || 'INR',
      historicalPrices,
    };

  } catch (err) {
    console.error(`Error fetching Yahoo Finance data for ${symbol}:`, err);
    return null; // Gracefully return null to let downstream flow fall back
  }
}
