// =============================================================================
// FolioIntel Research Module — Mock Research Data
// =============================================================================
// Realistic mock data for 3 Indian equities demonstrating different quality profiles:
//   1. HDFC Bank  — High-quality compounder (Favorable)
//   2. Tata Steel — Cyclical / mixed-quality (Mixed)
//   3. Yes Bank   — Risky / red-flag heavy (Risky)
//
// INTENTIONAL PARTIAL DATA:
//   - Yes Bank has empty peers array and valuation.status = 'partial'
//     to test partial-state UI rendering.
//
// All figures use ₹ Crores (Cr) unless noted. Analyst-tone language throughout.
// =============================================================================

import type {
  ResearchReport,
  CompanySearchResult,
  CompanyProfile,
  PriceAnalysis,
  PriceSnapshot,
  HistoricalPricePoint,
  CAGREntry,
  Drawdown,
  FundamentalsAnalysis,
  FinancialMetricYear,
  MetricHighlight,
  ValuationAnalysis,
  ValuationMultiple,
  PeerValuation,
  BalanceSheetHealth,
  DebtTrendPoint,
  OwnershipAnalysis,
  OwnershipSnapshot,
  CorporateAction,
  NewsAnalysis,
  NewsEvent,
  RedFlag,
  MacroContext,
  MacroFactor,
  ScenariosAnalysis,
  ScenarioCase,
  ResearchScore,
  ScoreFactor,
  FinalAssessment,
  SourceAttribution,
  ProConItem,
  ReportMeta,
} from './research-types';

// ---------------------------------------------------------------------------
// Helper: generate monthly price series
// ---------------------------------------------------------------------------
function generateMonthlyPrices(
  startYear: number,
  startMonth: number,
  months: number,
  startPrice: number,
  endPrice: number,
  volatility: number,
): HistoricalPricePoint[] {
  const points: HistoricalPricePoint[] = [];
  const trend = (endPrice - startPrice) / months;
  let price = startPrice;

  for (let i = 0; i < months; i++) {
    const month = ((startMonth - 1 + i) % 12) + 1;
    const year = startYear + Math.floor((startMonth - 1 + i) / 12);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;

    const noise = (Math.random() - 0.5) * 2 * volatility * price;
    price = Math.max(price + trend + noise, startPrice * 0.3);

    const dayRange = price * (0.01 + Math.random() * 0.03);
    const open = +(price + (Math.random() - 0.5) * dayRange).toFixed(2);
    const close = +price.toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * dayRange).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * dayRange).toFixed(2);
    const volume = Math.round(5_000_000 + Math.random() * 20_000_000);

    points.push({
      date: dateStr,
      open,
      high,
      low,
      close,
      adjustedClose: close,
      volume,
    });
  }
  return points;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. HDFC BANK — High-Quality Compounder
// ═══════════════════════════════════════════════════════════════════════════════

const hdfcProfile: CompanyProfile = {
  name: 'HDFC Bank Ltd',
  ticker: 'HDFCBANK',
  exchange: 'NSE',
  sector: 'Financial Services',
  industry: 'Private Sector Bank',
  marketCap: 13_50_000,
  marketCapFormatted: '₹13.5 Lakh Cr',
  capClassification: 'Large Cap',
  country: 'India',
  isin: 'INE040A01034',
  listingStatus: 'Active',
  description:
    "HDFC Bank is India's largest private-sector bank by market capitalisation. It offers a comprehensive suite of banking and financial services including retail banking, wholesale banking, treasury operations, and digital banking. Following its merger with HDFC Ltd in July 2023, the bank has significantly expanded its balance sheet and mortgage portfolio.",
  businessModel:
    'Net interest income from lending (retail, corporate, SME), fee income from transaction banking, credit cards, and wealth management. Post-merger, a large mortgage book adds stable long-duration assets.',
  keyProducts: [
    'Retail Lending (Personal, Auto, Home Loans)',
    'Corporate Banking & Working Capital',
    'Credit Cards & Payments',
    'Wealth Management & Insurance Distribution',
    'Digital Banking (PayZapp, SmartBUY)',
    'Treasury & Forex',
  ],
  foundedYear: 1994,
  headquartersCity: 'Mumbai',
  website: 'https://www.hdfcbank.com',
};

const hdfcPriceSnapshot: PriceSnapshot = {
  currentPrice: 1895.40,
  previousClose: 1878.25,
  dayChange: 17.15,
  dayChangePercent: 0.91,
  weekHigh52: 1975.00,
  weekLow52: 1420.00,
  volume: 12_500_000,
  avgVolume: 9_800_000,
  currency: 'INR',
};

const hdfcPriceAnalysis: PriceAnalysis = {
  status: 'ready',
  snapshot: hdfcPriceSnapshot,
  historicalPrices: generateMonthlyPrices(2019, 7, 60, 1250, 1895, 0.04),
  cagr: [
    { period: '1Y', value: 18.2, benchmark: 14.5, benchmarkName: 'Nifty 50' },
    { period: '3Y', value: 14.1, benchmark: 12.8, benchmarkName: 'Nifty 50' },
    { period: '5Y', value: 11.3, benchmark: 13.2, benchmarkName: 'Nifty 50' },
    { period: '10Y', value: 15.4, benchmark: 12.1, benchmarkName: 'Nifty 50' },
  ],
  majorDrawdowns: [
    {
      startDate: '2020-01-15',
      endDate: '2020-03-23',
      peakPrice: 1290,
      troughPrice: 830,
      drawdownPercent: -35.7,
      recoveryDate: '2020-11-10',
      cause: 'COVID-19 pandemic sell-off',
    },
    {
      startDate: '2023-07-15',
      endDate: '2023-10-26',
      peakPrice: 1750,
      troughPrice: 1420,
      drawdownPercent: -18.9,
      recoveryDate: '2024-03-15',
      cause: 'Post-HDFC merger deposit-ratio adjustment concerns',
    },
  ],
  trendQuality: 'Strong Uptrend',
  trendExplanation:
    'HDFC Bank has demonstrated a consistent long-term uptrend, outperforming Nifty 50 on a 10-year basis. Drawdowns have been event-driven and recovered within 6–12 months, indicating strong institutional confidence and earnings resilience.',
  benchmarkName: 'Nifty 50',
};

const hdfcFinancials: FundamentalsAnalysis = {
  status: 'ready',
  currency: 'INR',
  unitScale: 'Cr',
  metrics: [
    { year: 2015, revenue: 56710, revenueGrowth: null, ebitda: null, netProfit: 10216, netProfitGrowth: null, eps: 40.8, bookValuePerShare: 264, operatingMargin: null, netMargin: 18.0, roe: 16.4, roce: 2.1, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2016, revenue: 65380, revenueGrowth: 15.3, ebitda: null, netProfit: 12296, netProfitGrowth: 20.4, eps: 48.8, bookValuePerShare: 304, operatingMargin: null, netMargin: 18.8, roe: 17.0, roce: 2.2, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2017, revenue: 76264, revenueGrowth: 16.6, ebitda: null, netProfit: 14550, netProfitGrowth: 18.3, eps: 57.2, bookValuePerShare: 352, operatingMargin: null, netMargin: 19.1, roe: 17.2, roce: 2.3, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2018, revenue: 88353, revenueGrowth: 15.8, ebitda: null, netProfit: 17487, netProfitGrowth: 20.2, eps: 67.4, bookValuePerShare: 406, operatingMargin: null, netMargin: 19.8, roe: 17.5, roce: 2.3, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2019, revenue: 104340, revenueGrowth: 18.1, ebitda: null, netProfit: 21078, netProfitGrowth: 20.5, eps: 80.3, bookValuePerShare: 472, operatingMargin: null, netMargin: 20.2, roe: 17.8, roce: 2.4, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2020, revenue: 119535, revenueGrowth: 14.6, ebitda: null, netProfit: 26257, netProfitGrowth: 24.6, eps: 48.0, bookValuePerShare: 412, operatingMargin: null, netMargin: 22.0, roe: 16.3, roce: 2.2, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2021, revenue: 128552, revenueGrowth: 7.5, ebitda: null, netProfit: 31116, netProfitGrowth: 18.5, eps: 56.6, bookValuePerShare: 455, operatingMargin: null, netMargin: 24.2, roe: 16.6, roce: 2.3, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2022, revenue: 146063, revenueGrowth: 13.6, ebitda: null, netProfit: 36961, netProfitGrowth: 18.8, eps: 67.4, bookValuePerShare: 509, operatingMargin: null, netMargin: 25.3, roe: 17.1, roce: 2.4, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2023, revenue: 183236, revenueGrowth: 25.5, ebitda: null, netProfit: 44109, netProfitGrowth: 19.3, eps: 80.5, bookValuePerShare: 568, operatingMargin: null, netMargin: 24.1, roe: 16.5, roce: 2.2, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2024, revenue: 227613, revenueGrowth: 24.2, ebitda: null, netProfit: 60820, netProfitGrowth: 37.9, eps: 80.0, bookValuePerShare: 650, operatingMargin: null, netMargin: 26.7, roe: 17.0, roce: 2.3, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
  ],
  highlights: [
    { metric: 'Net Profit Growth', currentValue: '37.9% YoY (FY24)', trend: 'improving', explanation: 'Profit growth has accelerated post-merger due to expanded balance sheet and cross-sell synergies. This suggests strong earnings momentum.', benchmark: 'Sector avg: ~15% YoY' },
    { metric: 'Return on Equity', currentValue: '17.0% (FY24)', trend: 'stable', explanation: 'ROE has remained consistently between 16–18% over the past decade, indicating disciplined capital allocation and high-quality lending practices.', benchmark: 'Private banks avg: ~14%' },
    { metric: 'Net Interest Margin', currentValue: '~3.5% (FY24)', trend: 'stable', explanation: 'NIM has been resilient through rate cycles. Post-merger dilution appears to be normalising as the deposit franchise ramps up.', benchmark: 'Industry avg: ~3.0%' },
  ],
};

const hdfcValuation: ValuationAnalysis = {
  status: 'ready',
  multiples: [
    { name: 'PE Ratio', current: 21.5, median5Y: 22.8, sectorAverage: 15.0, verdict: 'Fair', explanation: 'Trading slightly below its own 5-year median PE, though at a premium to the banking sector average. The premium appears justified by superior asset quality and consistent ROE, based on available data.' },
    { name: 'PB Ratio', current: 2.92, median5Y: 3.4, sectorAverage: 2.0, verdict: 'Fair', explanation: 'Price-to-book is below its historical median, suggesting the merger-related book value expansion has not yet been fully priced in. This may indicate a reasonable entry point relative to its own history.' },
    { name: 'EV/EBITDA', current: null, median5Y: null, sectorAverage: null, verdict: 'N/A', explanation: 'EV/EBITDA is not a standard valuation metric for banks. Net Interest Income-based metrics are more appropriate.' },
  ],
  historicalPE: [
    { year: 2015, pe: 22.5 }, { year: 2016, pe: 23.1 }, { year: 2017, pe: 25.0 },
    { year: 2018, pe: 28.5 }, { year: 2019, pe: 26.0 }, { year: 2020, pe: 21.0 },
    { year: 2021, pe: 25.5 }, { year: 2022, pe: 22.0 }, { year: 2023, pe: 20.5 },
    { year: 2024, pe: 21.5 },
  ],
  peers: [
    { companyName: 'ICICI Bank', ticker: 'ICICIBANK', pe: 18.0, pb: 3.2, evEbitda: null, marketCap: '₹9.2 Lakh Cr', roe: 17.5 },
    { companyName: 'Kotak Mahindra Bank', ticker: 'KOTAKBANK', pe: 24.0, pb: 3.0, evEbitda: null, marketCap: '₹3.8 Lakh Cr', roe: 14.2 },
    { companyName: 'Axis Bank', ticker: 'AXISBANK', pe: 14.0, pb: 2.2, evEbitda: null, marketCap: '₹3.5 Lakh Cr', roe: 16.8 },
    { companyName: 'State Bank of India', ticker: 'SBIN', pe: 10.5, pb: 1.8, evEbitda: null, marketCap: '₹7.1 Lakh Cr', roe: 20.2 },
    { companyName: 'IndusInd Bank', ticker: 'INDUSINDBK', pe: 11.0, pb: 1.5, evEbitda: null, marketCap: '₹0.9 Lakh Cr', roe: 14.5 },
  ],
  dividendYield: 1.1,
  overallVerdict: 'Fair',
  verdictExplanation:
    'HDFC Bank appears fairly valued relative to its own historical range, trading below its 5-year median PE and PB. The premium over the sector average is supported by consistent ROE superiority, best-in-class asset quality, and a large digital banking moat. Based on available data, current valuations suggest neither significant overvaluation nor a deep discount.',
  evidence: [
    'PE of 21.5x is below the 5-year median of 22.8x',
    'PB of 2.92x is below the 5-year median of 3.4x',
    'ROE of 17% consistently exceeds sector average of ~14%',
    'Dividend yield of 1.1% provides modest income support',
  ],
};

const hdfcBalanceSheet: BalanceSheetHealth = {
  status: 'ready',
  debtTrend: [
    { year: 2020, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2021, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2022, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2023, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2024, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
  ],
  overallVerdict: 'Healthy',
  verdictExplanation:
    'For banks, traditional debt-to-equity ratios are not applicable as deposits constitute the primary liability. HDFC Bank maintains a Capital Adequacy Ratio (CAR) of ~18.5%, well above the regulatory minimum of 11.5%. Gross NPA at 1.24% and Net NPA at 0.33% indicate best-in-class asset quality. The bank\'s balance sheet appears robust and well-capitalised.',
  warnings: [],
  evidence: [
    'CAR at ~18.5% vs regulatory minimum of 11.5%',
    'Gross NPA at 1.24% — among the lowest in the industry',
    'Net NPA at 0.33% — indicates strong provisioning discipline',
    'Post-merger integration has expanded total assets to ~₹36 Lakh Cr',
  ],
};

const hdfcOwnership: OwnershipAnalysis = {
  status: 'ready',
  snapshots: [
    { date: '2023-03-31', promoterHolding: 25.8, fiiHolding: 33.5, diiHolding: 27.2, retailHolding: 13.5, pledgedShares: 0 },
    { date: '2023-06-30', promoterHolding: 25.8, fiiHolding: 33.0, diiHolding: 27.8, retailHolding: 13.4, pledgedShares: 0 },
    { date: '2023-09-30', promoterHolding: 25.8, fiiHolding: 34.1, diiHolding: 26.9, retailHolding: 13.2, pledgedShares: 0 },
    { date: '2023-12-31', promoterHolding: 25.8, fiiHolding: 34.5, diiHolding: 26.5, retailHolding: 13.2, pledgedShares: 0 },
    { date: '2024-03-31', promoterHolding: 25.8, fiiHolding: 34.2, diiHolding: 27.0, retailHolding: 13.0, pledgedShares: 0 },
    { date: '2024-06-30', promoterHolding: 25.5, fiiHolding: 34.0, diiHolding: 27.5, retailHolding: 13.0, pledgedShares: 0 },
  ],
  trendSummary:
    'Institutional ownership remains very strong. FII holding at ~34% indicates sustained global investor confidence. DII/mutual fund holding at ~27.5% adds domestic institutional support. Retail ownership is low and stable at ~13%, which is a positive sign — it suggests the stock is not driven by speculative retail participation. Zero promoter pledging removes a common governance concern.',
  redFlags: [],
  evidence: [
    'FII holding stable at 34% — strong international institutional confidence',
    'Zero promoter pledging across all quarters',
    'Retail holding low at 13% — not a retail-driven stock',
    'Promoter holding slightly reduced post-merger (structural, not a concern)',
  ],
};

const hdfcCorporateActions: CorporateAction[] = [
  { date: '2024-05-15', type: 'Dividend', details: 'Final dividend of ₹19.50 per share for FY24', explanation: 'First post-merger full-year dividend. The payout indicates confidence in sustained earnings. Dividend yield of ~1.1% is modest but consistent with growth-oriented capital allocation.', sentiment: 'Positive' },
  { date: '2023-07-01', type: 'Merger', details: 'HDFC Ltd merged into HDFC Bank', explanation: 'One of the largest mergers in Indian corporate history. Combines India\'s largest mortgage lender with the largest private bank. Expected to create a banking powerhouse but integration risks exist for 2–3 years.', sentiment: 'Positive' },
  { date: '2023-05-10', type: 'Dividend', details: 'Final dividend of ₹15.50 per share for FY23', explanation: 'Consistent dividend payment ahead of the merger, reflecting strong pre-merger profitability.', sentiment: 'Positive' },
  { date: '2022-05-12', type: 'Dividend', details: 'Final dividend of ₹15.50 per share for FY22', explanation: 'Maintained dividend at previous year level, indicating stable capital return policy.', sentiment: 'Positive' },
  { date: '2021-06-19', type: 'Dividend', details: 'Final dividend of ₹6.50 per share for FY21', explanation: 'Lower dividend due to RBI restrictions on bank dividends during COVID. This was a regulatory action, not a business weakness.', sentiment: 'Neutral' },
  { date: '2019-09-20', type: 'Split', details: 'Stock split from face value ₹2 to ₹1', explanation: 'Stock split to improve liquidity and accessibility for retail investors. Generally a neutral-to-positive action reflecting management confidence.', sentiment: 'Positive' },
  { date: '2019-06-15', type: 'Dividend', details: 'Final dividend of ₹11 per share for FY19', explanation: 'Strong dividend reflecting robust pre-COVID earnings trajectory.', sentiment: 'Positive' },
  { date: '2018-06-15', type: 'Dividend', details: 'Final dividend of ₹13 per share for FY18', explanation: 'Healthy dividend growth trajectory continuing.', sentiment: 'Positive' },
];

const hdfcNewsEvents: NewsEvent[] = [
  { id: 'hdfc-n1', date: '2024-04-20', headline: 'HDFC Bank Q4 FY24 net profit rises 37% YoY to ₹16,512 Cr', source: 'BSE Filing', category: 'Earnings', sentiment: 'Positive', whyItMatters: 'First full-year post-merger results show accelerating profit growth, indicating the merger is delivering synergies ahead of expectations. This suggests the combined entity has strong earnings momentum.', relevanceScore: 95 },
  { id: 'hdfc-n2', date: '2024-01-16', headline: 'HDFC Bank Q3 results disappoint; deposit growth lags expectations', source: 'Economic Times', category: 'Earnings', sentiment: 'Negative', whyItMatters: 'Slower deposit mobilisation raised concerns about the bank\'s ability to fund its expanded loan book post-merger. This was a key monitored risk that temporarily pressured the stock by ~8%.', relevanceScore: 85 },
  { id: 'hdfc-n3', date: '2023-07-01', headline: 'HDFC Ltd officially merges into HDFC Bank; combined entity begins operations', source: 'BSE Filing', category: 'Acquisition', sentiment: 'Positive', whyItMatters: 'Historic merger completed after regulatory approvals. Creates India\'s most valuable bank with total assets exceeding ₹36 Lakh Cr. Integration execution will be critical for 2–3 years.', relevanceScore: 98 },
  { id: 'hdfc-n4', date: '2023-10-15', headline: 'RBI mandates banks to maintain higher CRR on incremental deposits', source: 'RBI Press', category: 'Regulation', sentiment: 'Negative', whyItMatters: 'Incremental CRR temporarily reduced the net interest margin for HDFC Bank, which has a large deposit base post-merger. This regulatory action impacted near-term profitability for all banks.', relevanceScore: 70 },
  { id: 'hdfc-n5', date: '2024-06-15', headline: 'HDFC Bank launches \'Pixel Play\' — a unified digital banking platform', source: 'Livemint', category: 'Product', sentiment: 'Positive', whyItMatters: 'Digital banking investments indicate a strategic push to retain and grow the tech-savvy customer segment. This could improve cost-to-income ratio over time.', relevanceScore: 60 },
  { id: 'hdfc-n6', date: '2024-03-10', headline: 'FIIs increase stake in HDFC Bank to 34.2% in Q4 FY24', source: 'SEBI Filing', category: 'Management', sentiment: 'Positive', whyItMatters: 'Rising FII ownership reflects continued global investor confidence in the post-merger thesis. Institutional buying at these levels provides price support.', relevanceScore: 65 },
  { id: 'hdfc-n7', date: '2023-04-05', headline: 'HDFC Bank announces merger exchange ratio at 42 HDFC Bank shares for 25 HDFC shares', source: 'NSE Filing', category: 'Acquisition', sentiment: 'Neutral', whyItMatters: 'Exchange ratio was in line with market expectations. Existing HDFC shareholders received fair value, indicating a balanced merger structure.', relevanceScore: 75 },
  { id: 'hdfc-n8', date: '2024-05-20', headline: 'HDFC Bank to open 1,500 new branches in FY25, targeting semi-urban and rural markets', source: 'Business Standard', category: 'Product', sentiment: 'Positive', whyItMatters: 'Branch expansion into under-penetrated markets suggests confidence in growth potential beyond metros. Deposit mobilisation from these branches is expected to improve the credit-deposit ratio.', relevanceScore: 55 },
  { id: 'hdfc-n9', date: '2023-12-20', headline: 'India GDP growth at 8.4% in Q3 FY24 boosts banking sector outlook', source: 'Ministry of Finance', category: 'Macro', sentiment: 'Positive', whyItMatters: 'Strong GDP growth supports credit demand and asset quality. Banks with robust franchises like HDFC Bank benefit disproportionately from economic expansion.', relevanceScore: 50 },
  { id: 'hdfc-n10', date: '2024-02-15', headline: 'HDFC Bank credit card user base crosses 2 Cr; fastest growing in India', source: 'Moneycontrol', category: 'Product', sentiment: 'Positive', whyItMatters: 'Credit card business provides high-yield fee income and strengthens the retail banking franchise. Rapid growth here diversifies revenue beyond lending.', relevanceScore: 60 },
];

const hdfcNews: NewsAnalysis = {
  status: 'ready',
  events: hdfcNewsEvents,
  overallSentiment: 'Positive',
  narrativeSummary:
    'The dominant narrative around HDFC Bank centres on the successful execution of its merger with HDFC Ltd and the resulting earnings acceleration. While a brief period of deposit-growth concerns created near-term pressure, the overall trajectory appears constructive. Digital banking initiatives, branch expansion, and strong macro tailwinds support a positive medium-term outlook. Based on available data, the news flow suggests strengthening fundamentals and institutional confidence.',
};

const hdfcRedFlags: RedFlag[] = [
  { id: 'hdfc-rf1', category: 'Valuation', severity: 'Low', title: 'Valuation premium to sector peers', evidence: 'PE of 21.5x vs banking sector average of ~15x. PB of 2.92x vs sector average of ~2.0x.', explanation: 'HDFC Bank has historically traded at a premium due to superior asset quality and consistent returns. However, the premium means any earnings disappointment could lead to sharper corrections than peers.', investorCaution: 'Investors should be aware that the premium valuation leaves less room for error. Monitor quarterly results closely for any deviation from growth trajectory.' },
  { id: 'hdfc-rf2', category: 'Integration Risk', severity: 'Medium', title: 'HDFC Ltd merger integration remains ongoing', evidence: 'Credit-deposit ratio stood at ~110% post-merger vs industry norm of ~75-80%. Deposit growth lagged loan growth in H1 FY24.', explanation: 'The merger with HDFC Ltd brought a large mortgage book funded by bonds, not deposits. The bank needs to grow its deposit base significantly to bring the credit-deposit ratio to sustainable levels. This is a 2–3 year process.', investorCaution: 'Track quarterly deposit growth and credit-deposit ratio trends. Slower-than-expected deposit mobilisation could pressure margins and limit lending growth.' },
];

const hdfcMacro: MacroContext = {
  status: 'ready',
  factors: [
    { factor: 'Interest Rates (RBI Repo Rate)', sensitivity: 'Medium', currentImpact: 'Neutral', explanation: 'HDFC Bank benefits from rate hikes via improved NIMs but faces pressure from higher deposit costs. The net effect is broadly neutral at current rate levels. A rate-cut cycle could compress NIMs but boost credit demand.' },
    { factor: 'GDP / Economic Growth', sensitivity: 'High', currentImpact: 'Positive', explanation: 'India\'s GDP growth at 7-8% supports robust credit demand. HDFC Bank, with its diversified loan book, is a direct beneficiary of economic expansion. A slowdown to sub-6% growth would impact loan growth.' },
    { factor: 'Inflation (CPI)', sensitivity: 'Low', currentImpact: 'Neutral', explanation: 'Moderate inflation (~5%) is manageable. Very high inflation could trigger rate hikes and asset quality stress, but HDFC Bank\'s borrower quality provides a cushion.' },
    { factor: 'Regulatory Environment', sensitivity: 'Medium', currentImpact: 'Neutral', explanation: 'RBI\'s evolving norms on risk weights, digital lending, and unsecured loans affect all banks. HDFC Bank\'s conservative approach positions it well to adapt to tighter regulations.' },
  ],
  overallAssessment:
    'The macro environment appears broadly supportive for HDFC Bank. Strong GDP growth drives credit demand, while moderate inflation keeps asset quality stable. The primary macro risk is a potential global slowdown that could impact capital flows and credit appetite.',
};

const hdfcScenarios: ScenariosAnalysis = {
  status: 'ready',
  scenarios: [
    {
      type: 'Bull',
      title: 'Merger synergies accelerate + credit growth boom',
      probabilityBand: 'Medium',
      conditions: [
        'Credit-deposit ratio normalises to ~85% by FY26',
        'India GDP stays above 7% for next 2 years',
        'Cost-to-income ratio drops below 38%',
        'Digital banking market share gains continue',
      ],
      businessImpact: 'EPS could grow at 20%+ CAGR for FY25-FY27, with ROE expanding toward 18.5%. The merger would be considered a strategic success.',
      valuationImplication: 'PE re-rating to 25-28x could push stock toward ₹2,400-2,600 range over 18–24 months.',
      keyRisks: ['Merger execution delays', 'Competition from fintech platforms'],
      watchSignals: ['Quarterly deposit growth rate', 'Cost-to-income ratio trend', 'NIM trajectory'],
    },
    {
      type: 'Base',
      title: 'Steady growth with gradual integration',
      probabilityBand: 'High',
      conditions: [
        'Credit-deposit ratio improves to ~95% by FY26',
        'India GDP at 6.5-7%',
        'NIM stable at 3.4-3.6%',
        'No major asset quality surprises',
      ],
      businessImpact: 'EPS grows at 14-16% CAGR. ROE stable at 16-17%. The bank continues to be a quality compounder but without dramatic re-rating.',
      valuationImplication: 'PE stays in 20-23x range. Stock may deliver 12-15% annual returns including dividends.',
      keyRisks: ['Slower branch-led deposit mobilisation', 'Regulatory changes in unsecured lending'],
      watchSignals: ['Quarterly earnings growth', 'NPA ratios', 'Market share trends'],
    },
    {
      type: 'Bear',
      title: 'NPA cycle + margin compression',
      probabilityBand: 'Low',
      conditions: [
        'Global recession impacts India GDP to sub-6%',
        'NPA cycle triggers 200+ bps jump in slippages',
        'RBI imposes additional regulatory costs',
        'Deposit war erodes NIM below 3.0%',
      ],
      businessImpact: 'EPS growth could decelerate to single digits. Credit costs would rise significantly. ROE may drop to 13-14%.',
      valuationImplication: 'PE de-rating to 15-18x could push stock to ₹1,200-1,400 range.',
      keyRisks: ['Systemic credit event', 'Prolonged global risk-off environment'],
      watchSignals: ['Global recession indicators', 'RBI credit growth data', 'Slippage ratio trend'],
    },
  ],
  macroContext: hdfcMacro,
  triggerChecklist: [
    'Track quarterly credit-deposit ratio improvements',
    'Monitor NIM trends for margin pressure signals',
    'Watch FII ownership changes as a sentiment proxy',
    'Review RBI policy statements for regulatory directional changes',
    'Compare deposit growth vs system-wide growth rates',
  ],
};

const hdfcScores: ResearchScore[] = [
  { category: 'Business Quality', score: 9, maxScore: 10, weight: 0.20, factors: [{ name: 'Market Leadership', value: '#1 Private Bank by market cap', impact: 'Positive' }, { name: 'Moat Quality', value: 'Strong deposit franchise + digital platform', impact: 'Positive' }, { name: 'Revenue Diversity', value: 'Retail + wholesale + fee income', impact: 'Positive' }], explanation: 'HDFC Bank exhibits exceptional business quality with a dominant market position, diversified revenue streams, and a sustainable competitive moat in deposits and digital banking.' },
  { category: 'Financial Strength', score: 8, maxScore: 10, weight: 0.20, factors: [{ name: 'ROE Consistency', value: '16-18% for 10 years', impact: 'Positive' }, { name: 'Asset Quality', value: 'GNPA 1.24%, NNPA 0.33%', impact: 'Positive' }, { name: 'Capital Adequacy', value: 'CAR ~18.5%', impact: 'Positive' }], explanation: 'Financial metrics indicate strong and consistent performance. Asset quality is among the best in Indian banking. The only deduction is for post-merger integration uncertainty.' },
  { category: 'Valuation Attractiveness', score: 6, maxScore: 10, weight: 0.15, factors: [{ name: 'PE vs History', value: '21.5x vs 5Y median 22.8x', impact: 'Positive' }, { name: 'PE vs Sector', value: '21.5x vs sector avg 15x', impact: 'Negative' }, { name: 'PB vs History', value: '2.92x vs 5Y median 3.4x', impact: 'Positive' }], explanation: 'Valuation appears fair relative to its own history but carries a premium vs sector. The premium is largely justified by quality, but limits upside potential in the near term.' },
  { category: 'Ownership Quality', score: 9, maxScore: 10, weight: 0.15, factors: [{ name: 'FII Holding', value: '34% — strong institutional confidence', impact: 'Positive' }, { name: 'Promoter Pledging', value: '0% — no pledging risk', impact: 'Positive' }, { name: 'Retail Concentration', value: '13% — low speculative risk', impact: 'Positive' }], explanation: 'Ownership structure is among the healthiest in Indian banking. Dominant institutional ownership and zero pledging suggest high governance confidence.' },
  { category: 'Risk Level', score: 8, maxScore: 10, weight: 0.10, factors: [{ name: 'Red Flags', value: '2 minor flags (Low/Medium)', impact: 'Positive' }, { name: 'Regulatory Risk', value: 'Well-positioned for compliance', impact: 'Positive' }, { name: 'Integration Risk', value: 'Merger still in progress', impact: 'Negative' }], explanation: 'Risk profile is low overall. The primary risk is merger integration, which is well-monitored and appears to be progressing as expected.' },
  { category: 'News Momentum', score: 8, maxScore: 10, weight: 0.10, factors: [{ name: 'Earnings Sentiment', value: 'Positive — 37% profit growth', impact: 'Positive' }, { name: 'Institutional Flow', value: 'FII increasing stakes', impact: 'Positive' }, { name: 'Negative Events', value: 'Deposit growth concern — resolved', impact: 'Neutral' }], explanation: 'News flow is predominantly positive with strong earnings momentum. The deposit growth concern from Q3 FY24 appears to be normalising.' },
  { category: 'Macro Resilience', score: 7, maxScore: 10, weight: 0.10, factors: [{ name: 'GDP Sensitivity', value: 'High — benefits from India growth', impact: 'Positive' }, { name: 'Rate Sensitivity', value: 'Medium — NIM impact manageable', impact: 'Neutral' }, { name: 'Global Risk', value: 'FII-heavy stock sensitive to global flows', impact: 'Negative' }], explanation: 'Benefits from strong India macro but carries exposure to global risk-off events via FII ownership. Overall, the macro environment appears supportive.' },
];

const hdfcPros: ProConItem[] = [
  { point: 'Consistent compounder with 16-18% ROE over a decade', evidence: '10-year ROE range: 16.3%–17.8%, with no single year below 16%', category: 'Financial Strength' },
  { point: 'Best-in-class asset quality with GNPA at 1.24%', evidence: 'GNPA 1.24%, NNPA 0.33% — lowest among top-5 banks by market cap', category: 'Financial Strength' },
  { point: 'Post-merger scale creates India\'s largest private bank', evidence: 'Total assets >₹36 Lakh Cr, combined customer base >10 Cr accounts', category: 'Business Quality' },
  { point: 'Strong institutional ownership provides price stability', evidence: 'FII 34% + DII 27.5% = 61.5% institutional, zero promoter pledging', category: 'Ownership Quality' },
  { point: 'Digital banking moat with fastest-growing credit card franchise', evidence: '2 Cr+ credit cards, PayZapp platform, #1 in digital transaction market share', category: 'Business Quality' },
  { point: 'Valuation is below own historical median', evidence: 'PE 21.5x vs 5Y median 22.8x; PB 2.92x vs 5Y median 3.4x', category: 'Valuation' },
];

const hdfcCons: ProConItem[] = [
  { point: 'Valuation premium to sector limits near-term upside', evidence: 'PE premium of ~43% over banking sector average of 15x', category: 'Valuation' },
  { point: 'Merger integration is a multi-year process with execution risk', evidence: 'Credit-deposit ratio at ~110% needs to reduce to ~85% over 2-3 years', category: 'Integration Risk' },
  { point: 'Deposit growth needs to accelerate to fund the expanded loan book', evidence: 'Q3 FY24 deposit growth lagged system growth, causing temporary stock pressure', category: 'Business Risk' },
  { point: 'FII-heavy ownership makes stock sensitive to global risk-off events', evidence: '34% FII holding — EM selloffs could trigger disproportionate outflows', category: 'Ownership Risk' },
  { point: 'Competitive pressure from fintechs in digital lending and payments', evidence: 'PhonePe, Paytm, and Jio Financial Services expanding into banking-adjacent services', category: 'Business Risk' },
];

const hdfcAssessment: FinalAssessment = {
  stance: 'Favorable',
  confidence: 'High',
  thesisStrength: 'Strong',
  timeHorizon: 'Long',
  topEvidence: [
    'Consistent 16-18% ROE over 10 years indicates a durable earnings engine',
    'Best-in-class asset quality (GNPA 1.24%) provides downside protection',
    'Post-merger scale creates significant competitive advantages',
    'Valuation is below own historical median, suggesting reasonable entry point',
    'Strong institutional ownership (61.5%) supports price stability',
  ],
  unresolvedUncertainties: [
    'Merger integration timeline — deposit mobilisation pace remains a key variable',
    'Regulatory changes — RBI\'s evolving stance on risk weights and digital lending norms',
    'Global macro risk — potential FII outflows during EM risk-off episodes',
  ],
  suitableFor: ['Long-term investors seeking quality compounders', 'Value investors comfortable with slight premium for quality', 'Portfolio core holdings for India-focused allocation'],
  notSuitableFor: ['Short-term traders seeking quick returns', 'Investors seeking high dividend yield (current yield ~1.1%)', 'Those seeking deep-value or turnaround opportunities'],
  watchItems: ['Credit-deposit ratio quarterly trend', 'NIM trajectory post-merger', 'Deposit growth vs system growth', 'FII ownership changes', 'RBI policy direction'],
  reasonsAttractive: [
    'Dominant franchise in India\'s fastest-growing large economy',
    'Merger creates unmatched scale in retail banking + mortgages',
    'Consistent returns with low asset quality risk',
    'Below-median valuation provides reasonable entry',
    'Digital banking investments building future moat',
  ],
  reasonsCautious: [
    'Sector premium limits near-term re-rating potential',
    'Merger integration is a 2-3 year process with execution risks',
    'High FII ownership creates global macro sensitivity',
    'Competition from fintechs could erode fee income margins',
  ],
  whatStrengthensBull: [
    'Credit-deposit ratio normalising faster than expected',
    'Merger synergies driving cost-to-income below 38%',
    'India GDP growth sustaining above 7%',
  ],
  whatWeakensThesis: [
    'Persistent deposit growth lag requiring costly funding alternatives',
    'Unexpected NPA spike in the merged mortgage portfolio',
    'RBI imposing additional capital or liquidity requirements',
  ],
};

const hdfcSources: SourceAttribution[] = [
  { category: 'Financial Statements', name: 'BSE/NSE Annual Filings', description: 'Audited annual reports and quarterly results filed with stock exchanges', url: 'https://www.bseindia.com', reliability: 'High', sourceType: 'Financials', accessedAt: '2024-06-30' },
  { category: 'Price Data', name: 'NSE Historical Data', description: 'Daily and monthly OHLCV price data from National Stock Exchange', url: 'https://www.nseindia.com', reliability: 'High', sourceType: 'Price', accessedAt: '2024-06-30' },
  { category: 'Ownership', name: 'SEBI Shareholding Filings', description: 'Quarterly shareholding pattern disclosures as mandated by SEBI', url: 'https://www.sebi.gov.in', reliability: 'High', sourceType: 'Ownership', accessedAt: '2024-06-30' },
  { category: 'News', name: 'Multiple Financial Publications', description: 'Economic Times, Livemint, Moneycontrol, Business Standard', reliability: 'Medium', sourceType: 'News', accessedAt: '2024-06-30' },
  { category: 'Macro Data', name: 'RBI & Ministry of Finance', description: 'GDP data, monetary policy statements, banking statistics', url: 'https://www.rbi.org.in', reliability: 'High', sourceType: 'Macro', accessedAt: '2024-06-30' },
  { category: 'Corporate Actions', name: 'BSE Corporate Actions', description: 'Dividend, split, bonus, and merger announcements', url: 'https://www.bseindia.com/corporates', reliability: 'High', sourceType: 'Corporate Actions', accessedAt: '2024-06-30' },
];

const hdfcMeta: ReportMeta = {
  generatedAt: '2024-07-01T10:00:00Z',
  dataCompleteness: 'full',
  coverageStart: '2015-04-01',
  coverageEnd: '2024-06-30',
  reportVersion: '1.0.0',
  tickerResolvedFrom: 'HDFCBANK',
};

const hdfcReport: ResearchReport = {
  meta: hdfcMeta,
  companyProfile: hdfcProfile,
  priceAnalysis: hdfcPriceAnalysis,
  fundamentals: hdfcFinancials,
  valuation: hdfcValuation,
  balanceSheetHealth: hdfcBalanceSheet,
  ownershipAnalysis: hdfcOwnership,
  corporateActions: hdfcCorporateActions,
  newsAnalysis: hdfcNews,
  redFlags: hdfcRedFlags,
  macroContext: hdfcMacro,
  scenarios: hdfcScenarios,
  scores: hdfcScores,
  pros: hdfcPros,
  cons: hdfcCons,
  finalAssessment: hdfcAssessment,
  sources: hdfcSources,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 2. TATA STEEL — Cyclical / Mixed Quality
// ═══════════════════════════════════════════════════════════════════════════════

const tataProfile: CompanyProfile = {
  name: 'Tata Steel Ltd',
  ticker: 'TATASTEEL',
  exchange: 'NSE',
  sector: 'Materials',
  industry: 'Iron & Steel',
  marketCap: 1_80_000,
  marketCapFormatted: '₹1.8 Lakh Cr',
  capClassification: 'Large Cap',
  country: 'India',
  isin: 'INE081A01020',
  listingStatus: 'Active',
  description:
    'Tata Steel is one of the world\'s most geographically diversified steel producers, with operations across India, Europe (via Tata Steel Europe/formerly Corus), and Southeast Asia. The company produces a wide range of flat and long steel products for construction, automotive, packaging, and industrial applications.',
  businessModel:
    'Vertically integrated steel production — from raw material mining (iron ore, coal) through blast furnaces and basic oxygen furnaces to finished steel products. India operations are low-cost; European operations face higher costs and environmental compliance pressures.',
  keyProducts: [
    'Hot Rolled Coils & Sheets',
    'Cold Rolled Products',
    'Galvanised Steel',
    'Rebars & Wire Rods',
    'Automotive Grade Steel',
    'Branded Products (Tata Tiscon, Tata Steelium)',
  ],
  foundedYear: 1907,
  headquartersCity: 'Mumbai',
  website: 'https://www.tatasteel.com',
};

const tataPriceAnalysis: PriceAnalysis = {
  status: 'ready',
  snapshot: {
    currentPrice: 148.50,
    previousClose: 146.20,
    dayChange: 2.30,
    dayChangePercent: 1.57,
    weekHigh52: 170.00,
    weekLow52: 108.00,
    volume: 35_000_000,
    avgVolume: 28_000_000,
    currency: 'INR',
  },
  historicalPrices: generateMonthlyPrices(2019, 7, 60, 85, 148, 0.08),
  cagr: [
    { period: '1Y', value: 5.2, benchmark: 14.5, benchmarkName: 'Nifty 50' },
    { period: '3Y', value: 25.1, benchmark: 12.8, benchmarkName: 'Nifty 50' },
    { period: '5Y', value: 12.0, benchmark: 13.2, benchmarkName: 'Nifty 50' },
    { period: '10Y', value: 6.3, benchmark: 12.1, benchmarkName: 'Nifty 50' },
  ],
  majorDrawdowns: [
    { startDate: '2020-01-15', endDate: '2020-03-23', peakPrice: 105, troughPrice: 55, drawdownPercent: -47.6, recoveryDate: '2021-01-20', cause: 'COVID-19 pandemic + commodity crash' },
    { startDate: '2022-04-01', endDate: '2022-06-17', peakPrice: 145, troughPrice: 86, drawdownPercent: -40.7, recoveryDate: '2023-07-10', cause: 'Steel price correction post commodity supercycle + Europe energy crisis' },
  ],
  trendQuality: 'Sideways',
  trendExplanation:
    'Tata Steel\'s price history shows high cyclicality driven by global steel prices and commodity cycles. While strong rallies occur during commodity upcycles, drawdowns of 40%+ are common. The long-term CAGR of 6.3% significantly lags the benchmark, indicating that the stock has not been a reliable compounder. Price performance is heavily event-driven.',
  benchmarkName: 'Nifty 50',
};

const tataFinancials: FundamentalsAnalysis = {
  status: 'ready',
  currency: 'INR',
  unitScale: 'Cr',
  metrics: [
    { year: 2015, revenue: 126214, revenueGrowth: null, ebitda: 12900, netProfit: 3718, netProfitGrowth: null, eps: 3.8, bookValuePerShare: 85, operatingMargin: 10.2, netMargin: 2.9, roe: 5.2, roce: 7.5, debtToEquity: 1.42, interestCoverage: 2.1, currentRatio: 0.85, freeCashFlow: 3200, operatingCashFlow: 9800, cashConversionRatio: 0.76 },
    { year: 2016, revenue: 108756, revenueGrowth: -13.8, ebitda: 10500, netProfit: -4486, netProfitGrowth: null, eps: -4.6, bookValuePerShare: 78, operatingMargin: 9.7, netMargin: -4.1, roe: -5.8, roce: 4.2, debtToEquity: 1.65, interestCoverage: 1.5, currentRatio: 0.72, freeCashFlow: -1200, operatingCashFlow: 5400, cashConversionRatio: null },
    { year: 2017, revenue: 117110, revenueGrowth: 7.7, ebitda: 16200, netProfit: 3522, netProfitGrowth: null, eps: 3.6, bookValuePerShare: 82, operatingMargin: 13.8, netMargin: 3.0, roe: 4.4, roce: 7.8, debtToEquity: 1.55, interestCoverage: 2.3, currentRatio: 0.78, freeCashFlow: 2800, operatingCashFlow: 11200, cashConversionRatio: 0.69 },
    { year: 2018, revenue: 133016, revenueGrowth: 13.6, ebitda: 22500, netProfit: 8754, netProfitGrowth: 148.6, eps: 8.9, bookValuePerShare: 92, operatingMargin: 16.9, netMargin: 6.6, roe: 10.2, roce: 11.5, debtToEquity: 1.38, interestCoverage: 3.2, currentRatio: 0.82, freeCashFlow: 5100, operatingCashFlow: 15800, cashConversionRatio: 0.70 },
    { year: 2019, revenue: 157669, revenueGrowth: 18.5, ebitda: 26000, netProfit: 9098, netProfitGrowth: 3.9, eps: 7.5, bookValuePerShare: 95, operatingMargin: 16.5, netMargin: 5.8, roe: 8.5, roce: 10.8, debtToEquity: 1.45, interestCoverage: 2.8, currentRatio: 0.80, freeCashFlow: 4200, operatingCashFlow: 16500, cashConversionRatio: 0.64 },
    { year: 2020, revenue: 132571, revenueGrowth: -15.9, ebitda: 14800, netProfit: 1573, netProfitGrowth: -82.7, eps: 1.3, bookValuePerShare: 88, operatingMargin: 11.2, netMargin: 1.2, roe: 1.5, roce: 5.2, debtToEquity: 1.52, interestCoverage: 1.8, currentRatio: 0.75, freeCashFlow: -800, operatingCashFlow: 8200, cashConversionRatio: null },
    { year: 2021, revenue: 156294, revenueGrowth: 17.9, ebitda: 32500, netProfit: 12547, netProfitGrowth: 697.7, eps: 10.3, bookValuePerShare: 105, operatingMargin: 20.8, netMargin: 8.0, roe: 13.2, roce: 14.5, debtToEquity: 1.15, interestCoverage: 4.5, currentRatio: 0.92, freeCashFlow: 10500, operatingCashFlow: 22000, cashConversionRatio: 0.85 },
    { year: 2022, revenue: 243959, revenueGrowth: 56.1, ebitda: 52000, netProfit: 33012, netProfitGrowth: 163.1, eps: 27.2, bookValuePerShare: 135, operatingMargin: 21.3, netMargin: 13.5, roe: 24.5, roce: 21.0, debtToEquity: 0.82, interestCoverage: 7.5, currentRatio: 1.10, freeCashFlow: 18000, operatingCashFlow: 35000, cashConversionRatio: 0.67 },
    { year: 2023, revenue: 224218, revenueGrowth: -8.1, ebitda: 28000, netProfit: 8075, netProfitGrowth: -75.5, eps: 6.6, bookValuePerShare: 128, operatingMargin: 12.5, netMargin: 3.6, roe: 5.4, roce: 8.2, debtToEquity: 1.05, interestCoverage: 3.0, currentRatio: 0.88, freeCashFlow: 2500, operatingCashFlow: 18000, cashConversionRatio: 0.64 },
    { year: 2024, revenue: 218345, revenueGrowth: -2.6, ebitda: 30500, netProfit: 9412, netProfitGrowth: 16.6, eps: 7.7, bookValuePerShare: 132, operatingMargin: 14.0, netMargin: 4.3, roe: 6.1, roce: 9.0, debtToEquity: 1.02, interestCoverage: 3.2, currentRatio: 0.90, freeCashFlow: 3800, operatingCashFlow: 19500, cashConversionRatio: 0.65 },
  ],
  highlights: [
    { metric: 'Revenue Volatility', currentValue: '₹2.18 Lakh Cr (FY24)', trend: 'deteriorating', explanation: 'Revenue has swung between ₹1.08 Lakh Cr and ₹2.44 Lakh Cr over 10 years, driven entirely by commodity price cycles. This level of volatility makes earnings difficult to predict.', benchmark: 'Compared to consumer staples with <5% revenue variation' },
    { metric: 'Debt-to-Equity', currentValue: '1.02x (FY24)', trend: 'improving', explanation: 'Debt-to-equity has improved from 1.65x in FY16 to 1.02x in FY24, largely due to deleveraging during the FY22 commodity supercycle. However, it remains elevated compared to non-cyclical companies.', benchmark: 'Nifty 50 median: ~0.5x' },
    { metric: 'ROE Inconsistency', currentValue: '6.1% (FY24)', trend: 'deteriorating', explanation: 'ROE has ranged from -5.8% to 24.5% over the past decade. The current 6.1% is below cost of equity (~12%), suggesting the company is not consistently generating adequate shareholder returns.', benchmark: 'Quality threshold: >15% consistently' },
  ],
};

const tataValuation: ValuationAnalysis = {
  status: 'ready',
  multiples: [
    { name: 'PE Ratio', current: 19.3, median5Y: 8.5, sectorAverage: 10.0, verdict: 'Rich', explanation: 'The current PE of 19.3x is significantly above both the 5-year median and sector average. However, cyclical stocks often show high PEs at earnings troughs. The elevated PE appears to reflect low base earnings rather than market overvaluation enthusiasm.' },
    { name: 'PB Ratio', current: 1.12, median5Y: 1.2, sectorAverage: 1.0, verdict: 'Fair', explanation: 'Price-to-book is near its median and sector average. For a capital-intensive steel company, this suggests the market is pricing in modest value creation above replacement cost.' },
    { name: 'EV/EBITDA', current: 7.5, median5Y: 5.8, sectorAverage: 6.0, verdict: 'Rich', explanation: 'EV/EBITDA at 7.5x is above the sector norm of 6x, partly reflecting lower EBITDA in FY24 compared to peak. Normalised for mid-cycle earnings, the valuation appears closer to fair value.' },
  ],
  historicalPE: [
    { year: 2015, pe: 22.0 }, { year: 2016, pe: null }, { year: 2017, pe: 23.0 },
    { year: 2018, pe: 9.5 }, { year: 2019, pe: 11.0 }, { year: 2020, pe: 65.0 },
    { year: 2021, pe: 6.5 }, { year: 2022, pe: 3.8 }, { year: 2023, pe: 16.0 },
    { year: 2024, pe: 19.3 },
  ],
  peers: [
    { companyName: 'JSW Steel', ticker: 'JSWSTEEL', pe: 25.0, pb: 2.8, evEbitda: 9.0, marketCap: '₹2.2 Lakh Cr', roe: 12.0 },
    { companyName: 'SAIL', ticker: 'SAIL', pe: 12.0, pb: 0.8, evEbitda: 5.5, marketCap: '₹0.5 Lakh Cr', roe: 6.5 },
    { companyName: 'Hindalco', ticker: 'HINDALCO', pe: 14.0, pb: 1.3, evEbitda: 7.0, marketCap: '₹1.3 Lakh Cr', roe: 9.0 },
    { companyName: 'Vedanta', ticker: 'VEDL', pe: 18.0, pb: 2.5, evEbitda: 6.5, marketCap: '₹1.6 Lakh Cr', roe: 15.0 },
    { companyName: 'NMDC', ticker: 'NMDC', pe: 8.0, pb: 1.6, evEbitda: 4.5, marketCap: '₹0.7 Lakh Cr', roe: 20.0 },
  ],
  dividendYield: 2.5,
  overallVerdict: 'Mixed',
  verdictExplanation:
    'Tata Steel\'s valuation presents a mixed picture. Headline PE appears rich, but this is partly a function of depressed cyclical earnings. PB is near fair value. For cyclical stocks, valuation interpretation requires normalising for the commodity cycle. Based on available data, the stock appears neither deeply discounted nor clearly overvalued — investors should focus on the commodity cycle outlook rather than absolute multiples.',
  evidence: [
    'PE of 19.3x is rich vs 5Y median of 8.5x, but distorted by low-base earnings',
    'PB of 1.12x is close to sector average of 1.0x',
    'EV/EBITDA at 7.5x above sector norm of 6.0x',
    'Dividend yield of 2.5% provides some income cushion during sideways periods',
  ],
};

const tataBalanceSheet: BalanceSheetHealth = {
  status: 'ready',
  debtTrend: [
    { year: 2020, totalDebt: 102000, debtToEquity: 1.52, interestCoverage: 1.8, currentRatio: 0.75 },
    { year: 2021, totalDebt: 88000, debtToEquity: 1.15, interestCoverage: 4.5, currentRatio: 0.92 },
    { year: 2022, totalDebt: 68000, debtToEquity: 0.82, interestCoverage: 7.5, currentRatio: 1.10 },
    { year: 2023, totalDebt: 78000, debtToEquity: 1.05, interestCoverage: 3.0, currentRatio: 0.88 },
    { year: 2024, totalDebt: 82000, debtToEquity: 1.02, interestCoverage: 3.2, currentRatio: 0.90 },
  ],
  overallVerdict: 'Stretched',
  verdictExplanation:
    'Tata Steel\'s balance sheet carries significant leverage, with debt-to-equity consistently above 1.0x. While the company deleveraged aggressively during the FY22 commodity boom, debt has crept back up due to ongoing capex and European operations. Interest coverage at 3.2x provides a buffer but offers limited margin for error during downturns. The balance sheet appears manageable in a favourable cycle but could become risky if steel prices decline significantly.',
  warnings: [
    'Debt-to-equity at 1.02x is above the comfort zone for non-financial companies',
    'Interest coverage of 3.2x could compress below 2x in a severe downturn',
    'European operations carry additional restructuring and environmental compliance liabilities',
    'Current ratio below 1.0 indicates tight short-term liquidity',
  ],
  evidence: [
    'Total debt of ₹82,000 Cr as of FY24',
    'D/E improved from 1.65x (FY16) to 1.02x (FY24) — but still elevated',
    'Interest coverage ranged from 1.5x (distress) to 7.5x (boom) — high volatility',
    'FY22 boom allowed significant deleveraging, but debt is rising again',
  ],
};

const tataOwnership: OwnershipAnalysis = {
  status: 'ready',
  snapshots: [
    { date: '2023-03-31', promoterHolding: 33.2, fiiHolding: 18.5, diiHolding: 19.8, retailHolding: 28.5, pledgedShares: 0 },
    { date: '2023-06-30', promoterHolding: 33.2, fiiHolding: 18.0, diiHolding: 20.2, retailHolding: 28.6, pledgedShares: 0 },
    { date: '2023-09-30', promoterHolding: 33.2, fiiHolding: 17.5, diiHolding: 20.5, retailHolding: 28.8, pledgedShares: 0 },
    { date: '2023-12-31', promoterHolding: 33.2, fiiHolding: 17.0, diiHolding: 20.8, retailHolding: 29.0, pledgedShares: 0 },
    { date: '2024-03-31', promoterHolding: 33.2, fiiHolding: 17.2, diiHolding: 20.5, retailHolding: 29.1, pledgedShares: 0 },
    { date: '2024-06-30', promoterHolding: 33.2, fiiHolding: 17.8, diiHolding: 19.5, retailHolding: 29.5, pledgedShares: 0 },
  ],
  trendSummary:
    'Promoter holding (Tata Sons) is stable at 33.2% with zero pledging, which is reassuring for governance. However, FII holding has declined from 18.5% to 17.8% over the past year, suggesting some institutional caution. Retail holding at ~29.5% is relatively high for a cyclical stock, which warrants attention — rising retail ownership during a sideways phase could indicate a "retail trap" pattern if institutional investors continue to reduce exposure.',
  redFlags: [
    'FII holding declining from 18.5% to 17.8% — institutions appear to be gradually reducing exposure',
    'Retail ownership rising to 29.5% — elevated for a volatile cyclical stock',
  ],
  evidence: [
    'Promoter (Tata Sons) holding stable at 33.2% — strong group backing',
    'Zero promoter pledging — governance positive',
    'FII trending down: 18.5% → 17.8% over 5 quarters',
    'Retail trending up: 28.5% → 29.5% — potential concern',
  ],
};

const tataCorporateActions: CorporateAction[] = [
  { date: '2024-05-20', type: 'Dividend', details: 'Final dividend of ₹3.60 per share for FY24', explanation: 'Consistent dividend maintained despite lower earnings. Yield of ~2.5% provides income during sideways price action.', sentiment: 'Positive' },
  { date: '2023-11-15', type: 'Demerger', details: 'Board approves demerger of Tata Steel Long Products Ltd', explanation: 'Demerger aims to simplify corporate structure and unlock value of specialty long products business. This is generally positive for shareholder value clarity.', sentiment: 'Positive' },
  { date: '2023-05-15', type: 'Dividend', details: 'Final dividend of ₹3.60 per share for FY23', explanation: 'Dividend maintained at same level despite 75% profit decline, indicating management confidence in medium-term recovery.', sentiment: 'Neutral' },
  { date: '2022-05-12', type: 'Dividend', details: 'Final dividend of ₹51 per share for FY22 (special)', explanation: 'Exceptional dividend of ₹51 reflecting the commodity supercycle windfall. This was a one-time distribution and should not be expected to recur.', sentiment: 'Cautionary' },
  { date: '2021-02-18', type: 'Rights Issue', details: 'Rights issue of ₹9,000 Cr at ₹100 per share', explanation: 'Rights issue was used to deleverage the balance sheet. While dilutive to existing shareholders, the debt reduction strengthened the financial position. Equity dilution events reduce EPS even if fundamentals remain stable.', sentiment: 'Cautionary' },
  { date: '2019-05-15', type: 'Dividend', details: 'Final dividend of ₹10 per share for FY19', explanation: 'Standard dividend reflecting moderate profitability.', sentiment: 'Positive' },
];

const tataNewsEvents: NewsEvent[] = [
  { id: 'tata-n1', date: '2024-05-10', headline: 'Tata Steel Q4 FY24 profit rises 17% QoQ; India operations shine', source: 'BSE Filing', category: 'Earnings', sentiment: 'Positive', whyItMatters: 'India operations continue to perform well due to infrastructure demand, partially offsetting weak European results. This suggests the company\'s India business is structurally strong.', relevanceScore: 85 },
  { id: 'tata-n2', date: '2024-03-15', headline: 'Tata Steel Europe restructuring could cost £500 million; blast furnace closure planned', source: 'Financial Times', category: 'Management', sentiment: 'Negative', whyItMatters: 'European operations continue to bleed cash. The restructuring plan, while strategically necessary, involves significant one-time costs and job losses. This has been a persistent drag on consolidated profitability.', relevanceScore: 90 },
  { id: 'tata-n3', date: '2024-01-20', headline: 'India steel demand grows 13% in 2023; fastest among major economies', source: 'World Steel Association', category: 'Macro', sentiment: 'Positive', whyItMatters: 'India\'s infrastructure buildout (roads, railways, urban housing) is driving robust steel demand. Tata Steel, as India\'s largest integrated producer, is a direct beneficiary.', relevanceScore: 75 },
  { id: 'tata-n4', date: '2023-10-25', headline: 'China steel exports surge 36%; global oversupply concerns mount', source: 'Reuters', category: 'Macro', sentiment: 'Negative', whyItMatters: 'Chinese steel dumping is the biggest structural risk for global steel producers. Indian producers have import duty protection, but excess global supply compresses prices and margins worldwide.', relevanceScore: 88 },
  { id: 'tata-n5', date: '2023-08-15', headline: 'Tata Steel announces ₹15,000 Cr expansion at Kalinganagar plant', source: 'Economic Times', category: 'Product', sentiment: 'Positive', whyItMatters: 'Capacity expansion in India focuses on high-margin products. However, the large capex commitment will keep debt elevated and free cash flow constrained for 2-3 years.', relevanceScore: 70 },
  { id: 'tata-n6', date: '2023-05-25', headline: 'Tata Steel UK receives £500 million UK government grant for green transition', source: 'BBC', category: 'Regulation', sentiment: 'Positive', whyItMatters: 'Government support reduces the cost of transitioning to electric arc furnaces in the UK. However, the transition still involves significant capital and operational disruption.', relevanceScore: 65 },
  { id: 'tata-n7', date: '2024-06-10', headline: 'Steel prices correct 8% in June amid global demand weakness', source: 'Livemint', category: 'Macro', sentiment: 'Negative', whyItMatters: 'Price corrections directly impact margins and profitability. Tata Steel\'s operating margin is highly sensitive to realisation changes, making near-term earnings uncertain.', relevanceScore: 80 },
  { id: 'tata-n8', date: '2023-12-05', headline: 'Tata Steel joins ResponsibleSteel; targets 2045 net-zero for India operations', source: 'Company Press Release', category: 'Product', sentiment: 'Positive', whyItMatters: 'ESG commitments are increasingly important for institutional investors. However, the pathway to net-zero steel involves significant technology and capital investments that may impact near-term returns.', relevanceScore: 45 },
];

const tataNews: NewsAnalysis = {
  status: 'ready',
  events: tataNewsEvents,
  overallSentiment: 'Mixed',
  narrativeSummary:
    'The Tata Steel narrative is defined by two contrasting themes: strong India operations benefiting from domestic infrastructure demand, and struggling European operations requiring costly restructuring. Global steel oversupply from China remains a persistent structural concern. Based on available data, the near-term outlook appears uncertain, with profitability heavily dependent on commodity cycles and the pace of European restructuring.',
};

const tataRedFlags: RedFlag[] = [
  { id: 'tata-rf1', category: 'Debt', severity: 'High', title: 'Elevated debt-to-equity ratio', evidence: 'D/E at 1.02x (FY24) with total debt of ₹82,000 Cr. Interest coverage of 3.2x provides limited buffer.', explanation: 'For a cyclical company, a D/E above 1.0x is concerning because earnings can swing dramatically. During downturns (like FY16 or FY20), interest coverage dropped to 1.5x–1.8x, approaching distress levels. High leverage amplifies both gains and losses.', investorCaution: 'Monitor the debt-to-equity trend quarterly. If D/E exceeds 1.3x while interest coverage drops below 2.0x, the balance sheet risk becomes severe.' },
  { id: 'tata-rf2', category: 'Earnings', severity: 'High', title: 'Highly inconsistent earnings driven by commodity cycles', evidence: 'Net profit ranged from -₹4,486 Cr (FY16 loss) to +₹33,012 Cr (FY22 peak). ROE ranged from -5.8% to 24.5%.', explanation: 'Earnings are almost entirely determined by steel prices, which the company cannot control. This makes fundamental analysis challenging and long-term return estimation unreliable.', investorCaution: 'Do not extrapolate peak-cycle earnings. Use normalised mid-cycle metrics for valuation. A single year\'s EPS is not indicative of sustainable earning power.' },
  { id: 'tata-rf3', category: 'Geography', severity: 'Medium', title: 'European operations are a persistent drag on profitability', evidence: 'Tata Steel Europe has required restructuring reserves, government grants, and operational losses over multiple years. UK operations planning blast furnace closures.', explanation: 'European steel faces higher energy costs, stricter environmental regulations, and competition from low-cost producers. Restructuring is expensive and disruptive, with no guarantee of turning profitable.', investorCaution: 'Assess Tata Steel\'s India-only earnings as a cleaner indicator of business quality. European restructuring timelines have historically been optimistic.' },
  { id: 'tata-rf4', category: 'Commodity Risk', severity: 'High', title: 'Heavy dependence on global commodity prices', evidence: 'Revenue declined 15.9% in FY20 and 8.1% in FY23 purely due to steel price corrections, despite stable volumes.', explanation: 'Tata Steel has limited pricing power. Global steel prices are set by supply-demand dynamics influenced by Chinese production, global infrastructure spending, and raw material costs.', investorCaution: 'Track China\'s steel export volumes, global PMI data, and iron ore prices as leading indicators for Tata Steel\'s profitability.' },
  { id: 'tata-rf5', category: 'Capital Allocation', severity: 'Medium', title: 'Large capex commitments could constrain free cash flow', evidence: 'Kalinganagar expansion of ₹15,000 Cr + UK restructuring costs of £500 million. FCF has been negative or minimal in down-cycle years.', explanation: 'Committed capex during uncertain steel markets could lead to elevated debt and reduced financial flexibility. If steel prices decline during the expansion phase, the company\'s leverage could increase.', investorCaution: 'Monitor free cash flow generation relative to capex commitments. Sustained negative FCF combined with high debt is a warning pattern.' },
];

const tataMacro: MacroContext = {
  status: 'ready',
  factors: [
    { factor: 'Commodity Prices (Steel, Iron Ore, Coking Coal)', sensitivity: 'High', currentImpact: 'Neutral', explanation: 'Steel realisations have corrected from FY22 peaks but are above pre-COVID levels. Tata Steel\'s margins are directly proportional to steel-iron ore spreads. Current spreads suggest moderate profitability.' },
    { factor: 'GDP / Infrastructure Spending', sensitivity: 'High', currentImpact: 'Positive', explanation: 'India\'s infrastructure buildout (National Infrastructure Pipeline, highway expansion, smart cities) is driving domestic steel demand growth of 8-10% annually. This is the strongest secular tailwind for the company.' },
    { factor: 'China Steel Exports', sensitivity: 'High', currentImpact: 'Negative', explanation: 'China\'s steel exports surging 36% in 2023 creates global oversupply and puts downward pressure on prices. Indian import duties provide partial protection, but global price signals still affect domestic realisations.' },
    { factor: 'Currency (INR/USD, GBP)', sensitivity: 'Medium', currentImpact: 'Neutral', explanation: 'European operations are in GBP/EUR, creating translation risk. Weakening INR benefits India exports but hurts import costs for coking coal.' },
    { factor: 'Environmental Regulations', sensitivity: 'Medium', currentImpact: 'Negative', explanation: 'EU Carbon Border Adjustment Mechanism (CBAM) and green steel mandates will increase compliance costs for European operations. India operations face less immediate pressure but ESG standards are tightening.' },
  ],
  overallAssessment:
    'The macro environment presents a mixed backdrop. Domestic India demand is robust, but global oversupply from China and environmental compliance costs in Europe create headwinds. Commodity price direction will be the single most important macro variable for Tata Steel\'s near-term performance.',
};

const tataScenarios: ScenariosAnalysis = {
  status: 'ready',
  scenarios: [
    { type: 'Bull', title: 'Commodity upcycle + India infrastructure boom', probabilityBand: 'Low', conditions: ['Steel prices rise 20%+ from current levels', 'India infrastructure spending accelerates post-elections', 'European restructuring succeeds in reducing losses', 'China curtails steel exports due to domestic policy'], businessImpact: 'Revenue could exceed ₹2.5 Lakh Cr with EBITDA margins of 20%+. Rapid deleveraging would strengthen the balance sheet. ROE could reach 15-18%.', valuationImplication: 'PE re-rating to 6-8x normalised earnings. Stock could reach ₹200-220 range.', keyRisks: ['Commodity cycle reversal', 'Geopolitical disruption'], watchSignals: ['Global steel price trends', 'China PMI data', 'India infrastructure order book growth'] },
    { type: 'Base', title: 'Moderate demand with stable prices', probabilityBand: 'High', conditions: ['Steel prices stable at current levels ±10%', 'India demand grows 6-8% annually', 'European operations continue at breakeven or small loss', 'Gradual deleveraging continues'], businessImpact: 'Revenue stable around ₹2.1-2.3 Lakh Cr. EBITDA margins of 13-15%. Modest debt reduction. ROE of 6-8%.', valuationImplication: 'Stock trades in ₹130-170 range. Returns driven primarily by dividend yield (~2.5%) with modest capital appreciation.', keyRisks: ['European losses exceeding expectations', 'Capex overruns on Kalinganagar expansion'], watchSignals: ['Quarterly EBITDA margin trends', 'Debt reduction progress', 'India steel price realisations'] },
    { type: 'Bear', title: 'Global slowdown + China dumping intensifies', probabilityBand: 'Medium', conditions: ['Global recession reduces steel demand by 10-15%', 'China increases steel exports by another 20%+', 'Steel prices decline 25-30% from current levels', 'European operations require additional capital infusion'], businessImpact: 'Revenue could drop to ₹1.5-1.7 Lakh Cr. EBITDA margins compress to 5-8%. Losses in Europe deepen. Interest coverage drops below 2.0x.', valuationImplication: 'Stock could decline to ₹80-100 range. Dividend may be cut. Equity dilution risk if debt becomes unsustainable.', keyRisks: ['Covenant breach on debt', 'Forced asset sales', 'Credit rating downgrade'], watchSignals: ['Global recession indicators', 'China steel export volumes', 'Interest coverage ratio'] },
  ],
  macroContext: tataMacro,
  triggerChecklist: [
    'Monitor monthly global steel price indices',
    'Track China steel export data from World Steel Association',
    'Review India infrastructure spending trends post-budget',
    'Watch quarterly EBITDA margin and debt reduction',
    'Assess European restructuring progress every half-year',
  ],
};

const tataScores: ResearchScore[] = [
  { category: 'Business Quality', score: 6, maxScore: 10, weight: 0.20, factors: [{ name: 'Market Position', value: 'India\'s largest integrated steel producer', impact: 'Positive' }, { name: 'Vertical Integration', value: 'Own iron ore mines — cost advantage', impact: 'Positive' }, { name: 'Geographic Mix', value: 'European operations drag overall quality', impact: 'Negative' }], explanation: 'Strong India franchise offset by problematic European operations. Vertical integration provides cost advantages, but commodity dependence limits pricing power.' },
  { category: 'Financial Strength', score: 4, maxScore: 10, weight: 0.20, factors: [{ name: 'Earnings Consistency', value: 'ROE range: -5.8% to 24.5%', impact: 'Negative' }, { name: 'Debt Level', value: 'D/E at 1.02x — elevated', impact: 'Negative' }, { name: 'Cash Flow', value: 'Positive OCF but low FCF conversion', impact: 'Neutral' }], explanation: 'Financial metrics reflect the inherent cyclicality of the steel business. High leverage amplifies the cycle, creating periods of both strong and very weak financial performance.' },
  { category: 'Valuation Attractiveness', score: 5, maxScore: 10, weight: 0.15, factors: [{ name: 'PE vs History', value: '19.3x vs 5Y median 8.5x — appears rich', impact: 'Negative' }, { name: 'PB vs Sector', value: '1.12x vs sector avg 1.0x — fair', impact: 'Neutral' }, { name: 'Dividend Yield', value: '2.5% — provides income cushion', impact: 'Positive' }], explanation: 'Headline PE is misleading due to cyclical earnings trough. PB and dividend yield suggest more reasonable valuation. Overall, neither cheap nor expensive on normalised metrics.' },
  { category: 'Ownership Quality', score: 7, maxScore: 10, weight: 0.15, factors: [{ name: 'Promoter Group', value: 'Tata Sons at 33.2% — strong governance', impact: 'Positive' }, { name: 'Pledging', value: 'Zero pledging', impact: 'Positive' }, { name: 'FII Trend', value: 'Declining — institutions reducing exposure', impact: 'Negative' }], explanation: 'Tata group backing provides governance assurance. However, declining FII interest and rising retail ownership warrant monitoring.' },
  { category: 'Risk Level', score: 3, maxScore: 10, weight: 0.10, factors: [{ name: 'Red Flags', value: '5 flags (3 High, 2 Medium)', impact: 'Negative' }, { name: 'Cyclicality', value: 'Extreme earnings swings', impact: 'Negative' }, { name: 'Leverage Risk', value: 'D/E >1.0x in cyclical business', impact: 'Negative' }], explanation: 'Risk profile is elevated due to commodity cyclicality, leverage, and European exposure. This is not a "sleep well at night" stock.' },
  { category: 'News Momentum', score: 5, maxScore: 10, weight: 0.10, factors: [{ name: 'India Operations', value: 'Positive — demand + expansion', impact: 'Positive' }, { name: 'Europe Outlook', value: 'Negative — restructuring costs', impact: 'Negative' }, { name: 'Commodity Sentiment', value: 'Mixed — China oversupply concerns', impact: 'Negative' }], explanation: 'News flow is split between positive India developments and negative global/European themes. Net momentum is flat.' },
  { category: 'Macro Resilience', score: 3, maxScore: 10, weight: 0.10, factors: [{ name: 'Commodity Sensitivity', value: 'Very High — margins driven by steel prices', impact: 'Negative' }, { name: 'China Dependency', value: 'Global steel prices set by China', impact: 'Negative' }, { name: 'India Demand', value: 'Infrastructure spending is a tailwind', impact: 'Positive' }], explanation: 'Extremely sensitive to commodity cycles and global macro conditions. India domestic demand provides a partial floor, but global factors dominate.' },
];

const tataPros: ProConItem[] = [
  { point: 'India\'s largest integrated steel producer with captive iron ore mines', evidence: 'India capacity of ~21 MTPA with ~100% iron ore self-sufficiency for India operations', category: 'Business Quality' },
  { point: 'Tata group backing ensures strong governance and strategic support', evidence: 'Tata Sons holding at 33.2% with zero pledging. Group support during difficult periods (e.g., COVID).', category: 'Ownership Quality' },
  { point: 'India infrastructure demand provides a strong secular growth driver', evidence: 'India steel demand growing 8-10% annually. National Infrastructure Pipeline of ₹111 Lakh Cr over 5 years.', category: 'Macro Tailwind' },
  { point: 'Attractive dividend yield of ~2.5% provides income during sideways periods', evidence: 'Consistent dividend payment even during earning troughs (₹3.60/share in FY24).', category: 'Income' },
  { point: 'Deleveraging progress — D/E improved from 1.65x to 1.02x over 8 years', evidence: 'Aggressive debt reduction during FY22 commodity boom. Debt reduced by ~₹34,000 Cr since FY20 peak.', category: 'Financial Improvement' },
];

const tataCons: ProConItem[] = [
  { point: 'Earnings are highly unpredictable — ROE has ranged from -5.8% to 24.5%', evidence: 'Net profit swung from -₹4,486 Cr to +₹33,012 Cr over 10 years. No year-to-year consistency.', category: 'Earnings Risk' },
  { point: 'Debt remains elevated at 1.02x D/E with ₹82,000 Cr total debt', evidence: 'Interest coverage of 3.2x provides limited buffer; dropped to 1.5x during last downturn.', category: 'Balance Sheet' },
  { point: 'European operations are a persistent value destroyer', evidence: 'Multiple years of losses, restructuring costs, and government dependency for survival.', category: 'Geography Risk' },
  { point: 'Heavy commodity price dependence with no pricing power', evidence: 'Revenue correlation with global HRC prices >0.85. Company cannot control its top-line driver.', category: 'Commodity Risk' },
  { point: 'China steel dumping is a structural threat to global steel margins', evidence: 'China steel exports surged 36% in 2023, creating global oversupply and price pressure.', category: 'Competitive Risk' },
  { point: 'Large capex commitments may constrain free cash flow for 2-3 years', evidence: 'Kalinganagar expansion ₹15,000 Cr + UK green transition costs. FCF likely to remain muted.', category: 'Capital Allocation' },
];

const tataAssessment: FinalAssessment = {
  stance: 'Mixed',
  confidence: 'Medium',
  thesisStrength: 'Moderate',
  timeHorizon: 'Medium',
  topEvidence: [
    'India\'s largest integrated steel producer with cost advantages from captive iron ore',
    'Earnings are extremely cyclical — ROE range of -5.8% to 24.5% over a decade',
    'Debt at 1.02x D/E is elevated for a commodity business with volatile cash flows',
    'India demand is structurally strong (8-10% growth) but global oversupply creates headwinds',
    'European operations remain a drag on consolidated profitability',
  ],
  unresolvedUncertainties: [
    'Direction of the global steel price cycle — impossible to predict with confidence',
    'Whether European restructuring will succeed or require additional capital',
    'China\'s steel production and export policy decisions',
  ],
  suitableFor: ['Cyclical investors who can time commodity cycles', 'Investors comfortable with high volatility and 40%+ drawdowns', 'Income-oriented investors willing to accept capital risk for 2.5% dividend yield'],
  notSuitableFor: ['Risk-averse investors seeking consistent returns', 'Long-term compounding-focused portfolios', 'Investors unable to monitor commodity cycles actively'],
  watchItems: ['Global HRC steel prices', 'China steel export volumes', 'India infrastructure spending pace', 'D/E ratio and interest coverage trends', 'European restructuring timeline'],
  reasonsAttractive: ['India infrastructure demand is a strong secular driver', 'Tata group governance and strategic support', 'Decent dividend yield during sideways markets', 'India operations are genuinely cost-competitive'],
  reasonsCautious: ['Extreme earnings cyclicality makes returns unpredictable', 'Elevated leverage amplifies both up and downside', 'European operations are a value trap', 'Commodity dependence means limited control over profitability'],
  whatStrengthensBull: ['Global steel price recovery + India demand acceleration', 'Successful European restructuring to breakeven', 'Faster-than-expected Kalinganagar ramp-up'],
  whatWeakensThesis: ['Global recession causing steel price collapse', 'China steel exports increasing further', 'European operations requiring additional capital infusion', 'Capex overruns leading to higher debt'],
};

const tataSources: SourceAttribution[] = [
  { category: 'Financial Statements', name: 'BSE/NSE Annual Filings', description: 'Audited consolidated results including India and international operations', url: 'https://www.bseindia.com', reliability: 'High', sourceType: 'Financials', accessedAt: '2024-06-30' },
  { category: 'Price Data', name: 'NSE Historical Data', description: 'Daily and monthly OHLCV data', url: 'https://www.nseindia.com', reliability: 'High', sourceType: 'Price', accessedAt: '2024-06-30' },
  { category: 'Ownership', name: 'SEBI Shareholding Filings', description: 'Quarterly shareholding patterns', url: 'https://www.sebi.gov.in', reliability: 'High', sourceType: 'Ownership', accessedAt: '2024-06-30' },
  { category: 'News', name: 'Multiple Publications', description: 'FT, Reuters, Economic Times, Livemint, BBC', reliability: 'Medium', sourceType: 'News', accessedAt: '2024-06-30' },
  { category: 'Commodity Data', name: 'World Steel Association + LME', description: 'Global steel production, pricing, and trade data', url: 'https://worldsteel.org', reliability: 'High', sourceType: 'Macro', accessedAt: '2024-06-30' },
  { category: 'Corporate Actions', name: 'BSE Corporate Actions', description: 'Dividend, rights, and demerger announcements', url: 'https://www.bseindia.com/corporates', reliability: 'High', sourceType: 'Corporate Actions', accessedAt: '2024-06-30' },
];

const tataReport: ResearchReport = {
  meta: { generatedAt: '2024-07-01T10:00:00Z', dataCompleteness: 'full', coverageStart: '2015-04-01', coverageEnd: '2024-06-30', reportVersion: '1.0.0', tickerResolvedFrom: 'TATASTEEL' },
  companyProfile: tataProfile,
  priceAnalysis: tataPriceAnalysis,
  fundamentals: tataFinancials,
  valuation: tataValuation,
  balanceSheetHealth: tataBalanceSheet,
  ownershipAnalysis: tataOwnership,
  corporateActions: tataCorporateActions,
  newsAnalysis: tataNews,
  redFlags: tataRedFlags,
  macroContext: tataMacro,
  scenarios: tataScenarios,
  scores: tataScores,
  pros: tataPros,
  cons: tataCons,
  finalAssessment: tataAssessment,
  sources: tataSources,
};


// ═══════════════════════════════════════════════════════════════════════════════
// 3. YES BANK — Risky / Red-Flag Heavy
// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: Yes Bank intentionally has PARTIAL data:
//   - valuation.status = 'partial', peers = [] (tests partial-state rendering)
//   - Some financial metrics are null in early years (data gaps)
// ═══════════════════════════════════════════════════════════════════════════════

const yesProfile: CompanyProfile = {
  name: 'Yes Bank Ltd',
  ticker: 'YESBANK',
  exchange: 'NSE',
  sector: 'Financial Services',
  industry: 'Private Sector Bank',
  marketCap: 60_000,
  marketCapFormatted: '₹60,000 Cr',
  capClassification: 'Mid Cap',
  country: 'India',
  isin: 'INE528G01035',
  listingStatus: 'Active',
  description:
    'Yes Bank is an Indian private sector bank that underwent a severe financial crisis in 2020 due to governance failures, reckless lending, and massive asset quality deterioration. The bank was placed under an RBI moratorium and subsequently rescued through a consortium led by State Bank of India. It is now under new management and attempting a slow turnaround, but the scars of the crisis remain visible in its balance sheet and market reputation.',
  businessModel:
    'Traditional banking model — net interest income from lending, fee income from transaction banking. Post-crisis, the bank has shifted to safer retail lending from its earlier aggressive corporate loan book. Recovery is slow and constrained by legacy bad loans.',
  keyProducts: [
    'Retail Banking (Savings, FDs, Loans)',
    'Corporate Banking (scaled back post-crisis)',
    'Digital Banking (Yes Mobile app)',
    'Micro-lending partnerships',
  ],
  foundedYear: 2004,
  headquartersCity: 'Mumbai',
  website: 'https://www.yesbank.in',
};

const yesPriceAnalysis: PriceAnalysis = {
  status: 'ready',
  snapshot: {
    currentPrice: 22.50,
    previousClose: 22.10,
    dayChange: 0.40,
    dayChangePercent: 1.81,
    weekHigh52: 32.00,
    weekLow52: 17.00,
    volume: 180_000_000,
    avgVolume: 150_000_000,
    currency: 'INR',
  },
  historicalPrices: generateMonthlyPrices(2019, 7, 60, 85, 22, 0.15),
  cagr: [
    { period: '1Y', value: 10.5, benchmark: 14.5, benchmarkName: 'Nifty 50' },
    { period: '3Y', value: -5.2, benchmark: 12.8, benchmarkName: 'Nifty 50' },
    { period: '5Y', value: -40.3, benchmark: 13.2, benchmarkName: 'Nifty 50' },
    { period: '10Y', value: -25.8, benchmark: 12.1, benchmarkName: 'Nifty 50' },
  ],
  majorDrawdowns: [
    { startDate: '2018-09-01', endDate: '2020-03-06', peakPrice: 280, troughPrice: 12, drawdownPercent: -95.7, recoveryDate: undefined, cause: 'Governance failure, NPA crisis, RBI moratorium, near-total collapse of confidence. The stock has NEVER recovered to pre-crisis levels.' },
    { startDate: '2021-02-15', endDate: '2021-04-30', peakPrice: 22, troughPrice: 12, drawdownPercent: -45.0, recoveryDate: '2021-10-20', cause: 'FPO-related equity dilution and continued weak fundamentals' },
  ],
  trendQuality: 'Strong Downtrend',
  trendExplanation:
    'Yes Bank\'s stock has suffered a catastrophic permanent decline of ~92% from its 2018 highs. The 10-year CAGR of -25.8% indicates massive permanent capital destruction. The stock trades at a fraction of its pre-crisis levels, and recovery to pre-crisis prices appears extremely unlikely given the ~10x equity dilution that occurred during the rescue. Recent price action is range-bound between ₹17–32, driven primarily by speculative retail trading rather than fundamental improvement.',
  benchmarkName: 'Nifty 50',
};

const yesFinancials: FundamentalsAnalysis = {
  status: 'ready',
  currency: 'INR',
  unitScale: 'Cr',
  metrics: [
    { year: 2015, revenue: 12856, revenueGrowth: null, ebitda: null, netProfit: 2005, netProfitGrowth: null, eps: 8.9, bookValuePerShare: 58, operatingMargin: null, netMargin: 15.6, roe: 16.5, roce: 1.8, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2016, revenue: 17150, revenueGrowth: 33.4, ebitda: null, netProfit: 2540, netProfitGrowth: 26.7, eps: 11.2, bookValuePerShare: 68, operatingMargin: null, netMargin: 14.8, roe: 17.8, roce: 1.9, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2017, revenue: 21020, revenueGrowth: 22.6, ebitda: null, netProfit: 3330, netProfitGrowth: 31.1, eps: 14.5, bookValuePerShare: 80, operatingMargin: null, netMargin: 15.8, roe: 19.5, roce: 2.0, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2018, revenue: 24890, revenueGrowth: 18.4, ebitda: null, netProfit: 4225, netProfitGrowth: 26.9, eps: 18.4, bookValuePerShare: 96, operatingMargin: null, netMargin: 17.0, roe: 20.5, roce: 2.1, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    // NOTE: FY19 onwards shows the collapse
    { year: 2019, revenue: 26780, revenueGrowth: 7.6, ebitda: null, netProfit: 1720, netProfitGrowth: -59.3, eps: 7.5, bookValuePerShare: 85, operatingMargin: null, netMargin: 6.4, roe: 8.2, roce: 1.4, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2020, revenue: 22350, revenueGrowth: -16.5, ebitda: null, netProfit: -16418, netProfitGrowth: null, eps: -6.5, bookValuePerShare: 18, operatingMargin: null, netMargin: -73.4, roe: -85.0, roce: -5.0, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2021, revenue: 19250, revenueGrowth: -13.9, ebitda: null, netProfit: -3462, netProfitGrowth: null, eps: -1.4, bookValuePerShare: 14, operatingMargin: null, netMargin: -18.0, roe: -9.8, roce: -1.2, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2022, revenue: 18800, revenueGrowth: -2.3, ebitda: null, netProfit: 1066, netProfitGrowth: null, eps: 0.4, bookValuePerShare: 14.5, operatingMargin: null, netMargin: 5.7, roe: 2.8, roce: 0.5, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2023, revenue: 21500, revenueGrowth: 14.4, ebitda: null, netProfit: 1550, netProfitGrowth: 45.4, eps: 0.6, bookValuePerShare: 15.0, operatingMargin: null, netMargin: 7.2, roe: 4.0, roce: 0.7, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
    { year: 2024, revenue: 23400, revenueGrowth: 8.8, ebitda: null, netProfit: 1900, netProfitGrowth: 22.6, eps: 0.7, bookValuePerShare: 15.5, operatingMargin: null, netMargin: 8.1, roe: 4.5, roce: 0.8, debtToEquity: null, interestCoverage: null, currentRatio: null, freeCashFlow: null, operatingCashFlow: null, cashConversionRatio: null },
  ],
  highlights: [
    { metric: 'Net Profit Collapse & Partial Recovery', currentValue: '₹1,900 Cr (FY24)', trend: 'improving', explanation: 'Profits have recovered from the -₹16,418 Cr loss in FY20, but at ₹1,900 Cr they remain a fraction of the ₹4,225 Cr peak in FY18. The recovery trajectory is slow and the earnings base remains thin.', benchmark: 'Pre-crisis peak: ₹4,225 Cr (FY18)' },
    { metric: 'Return on Equity', currentValue: '4.5% (FY24)', trend: 'improving', explanation: 'ROE has recovered from -85% (FY20) to 4.5%, but this is well below the cost of equity (~12%) and far below the pre-crisis 20.5%. The bank is not generating adequate shareholder returns.', benchmark: 'Private banks avg: ~14%, Pre-crisis: 20.5%' },
    { metric: 'EPS Dilution', currentValue: '₹0.70 (FY24)', trend: 'stable', explanation: 'EPS was ₹18.4 in FY18. After ~10x equity dilution during the rescue, EPS has collapsed to ₹0.70 despite profits recovering. This dilution is permanent and cannot be reversed through earnings growth alone.', benchmark: 'Pre-crisis EPS: ₹18.4 (FY18)' },
  ],
};

// Yes Bank: valuation intentionally PARTIAL — empty peers to test UI state
const yesValuation: ValuationAnalysis = {
  status: 'partial', // INTENTIONAL: tests partial-state rendering
  multiples: [
    { name: 'PE Ratio', current: 32.0, median5Y: null, sectorAverage: 15.0, verdict: 'Rich', explanation: 'PE of 32x is extremely high for a bank with 4.5% ROE. This distorted multiple reflects the very low EPS base caused by massive equity dilution. Traditional PE analysis is largely meaningless for Yes Bank in its current state.' },
    { name: 'PB Ratio', current: 1.45, median5Y: null, sectorAverage: 2.0, verdict: 'Discounted', explanation: 'PB below 1.5x is optically cheap but reflects the poor quality of the book value. A large portion of the balance sheet consists of restructured loans and recoveries with uncertain realisation.' },
    { name: 'EV/EBITDA', current: null, median5Y: null, sectorAverage: null, verdict: 'N/A', explanation: 'Not applicable for banking companies.' },
  ],
  historicalPE: [
    { year: 2015, pe: 15.0 }, { year: 2016, pe: 16.5 }, { year: 2017, pe: 18.0 },
    { year: 2018, pe: 14.0 }, { year: 2019, pe: 12.0 }, { year: 2020, pe: null },
    { year: 2021, pe: null }, { year: 2022, pe: 52.0 }, { year: 2023, pe: 38.0 },
    { year: 2024, pe: 32.0 },
  ],
  peers: [], // INTENTIONAL: empty to test partial-state rendering
  dividendYield: 0,
  overallVerdict: 'Mixed',
  verdictExplanation:
    'Traditional valuation metrics are largely unreliable for Yes Bank due to the distorted earnings base and massive equity dilution. PE appears rich but is an artefact of low EPS, not high market expectations. PB appears cheap but book quality is uncertain. Peer comparison data is unavailable for this assessment. Based on available data, the stock appears to be priced for speculative recovery potential rather than current fundamentals.',
  evidence: [
    'PE of 32x distorted by EPS of just ₹0.70 (pre-crisis EPS was ₹18.4)',
    'PB of 1.45x appears cheap but book value quality is uncertain',
    'No peer comparison available — data limitation',
    'Zero dividend yield — no income return',
  ],
};

const yesBalanceSheet: BalanceSheetHealth = {
  status: 'ready',
  debtTrend: [
    { year: 2020, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2021, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2022, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2023, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
    { year: 2024, totalDebt: null, debtToEquity: null, interestCoverage: null, currentRatio: null },
  ],
  overallVerdict: 'Risky',
  verdictExplanation:
    'Yes Bank\'s balance sheet remains fragile despite improvements since the 2020 crisis. Gross NPA at ~2.0% has improved but restructured loan exposure adds hidden risk. Capital adequacy is adequate (~16%) but lower than peers. The bank lacks the provisioning buffer that established banks maintain. The AT1 bond write-off during the crisis (~₹8,400 Cr) destroyed additional tier-1 capital and severely damaged market confidence in the bank\'s capital instruments.',
  warnings: [
    'Legacy bad loans and restructured assets still create hidden asset quality risk',
    'AT1 bond write-off has permanently damaged the bank\'s ability to raise hybrid capital',
    'Capital adequacy is adequate but provides less buffer than established peers',
    'Deposit franchise remains weak compared to pre-crisis levels, relying on rate-sensitive deposits',
  ],
  evidence: [
    'GNPA improved to ~2.0% but restructured book adds ~3% potential stress',
    'CAR at ~16% — adequate but below top private banks (~18-19%)',
    'AT1 bond write-off of ₹8,400 Cr — unprecedented in Indian banking',
    'Deposit growth has recovered but relies on higher-cost channels',
  ],
};

const yesOwnership: OwnershipAnalysis = {
  status: 'ready',
  snapshots: [
    { date: '2023-03-31', promoterHolding: 0, fiiHolding: 16.5, diiHolding: 22.0, retailHolding: 33.5, pledgedShares: null },
    { date: '2023-06-30', promoterHolding: 0, fiiHolding: 15.8, diiHolding: 21.5, retailHolding: 34.2, pledgedShares: null },
    { date: '2023-09-30', promoterHolding: 0, fiiHolding: 15.2, diiHolding: 21.0, retailHolding: 35.0, pledgedShares: null },
    { date: '2023-12-31', promoterHolding: 0, fiiHolding: 14.8, diiHolding: 20.5, retailHolding: 35.8, pledgedShares: null },
    { date: '2024-03-31', promoterHolding: 0, fiiHolding: 14.5, diiHolding: 20.0, retailHolding: 36.5, pledgedShares: null },
    { date: '2024-06-30', promoterHolding: 0, fiiHolding: 15.0, diiHolding: 19.5, retailHolding: 36.0, pledgedShares: null },
  ],
  trendSummary:
    'Yes Bank has no traditional promoter — it was rescued by an SBI-led consortium that now holds ~29%. The key concern is the ownership trend: FII holding has declined from 16.5% to 15.0% over 5 quarters, while retail holding has risen from 33.5% to 36.0%. This pattern — institutions exiting while retail investors increase exposure — is a classic "retail trap" signal. Retail investors may be attracted by the low absolute stock price and turnaround narrative, but institutional money is quietly reducing exposure.',
  redFlags: [
    'No traditional promoter — bank was rescued from near-collapse',
    'FII holding declining steadily: 16.5% → 15.0% over 5 quarters',
    'Retail holding rising to 36.0% — classic retail trap pattern',
    'DII/MF holding also declining: 22.0% → 19.5%',
  ],
  evidence: [
    'SBI consortium holds ~29% as strategic/rescue investor, not traditional promoter',
    'FII declining from 16.5% to 15.0% — institutions are reducing exposure',
    'Retail rising from 33.5% to 36.0% — speculative retail interest is increasing',
    'Both FII and DII declining while retail rises — concerning divergence',
  ],
};

const yesCorporateActions: CorporateAction[] = [
  { date: '2020-07-15', type: 'Rights Issue', details: 'Follow-on Public Offer (FPO) raising ₹15,000 Cr at ₹12 per share', explanation: 'This massive equity raise diluted existing shareholders by approximately 10x. While necessary for the bank\'s survival, it permanently destroyed per-share economics. Pre-crisis shareholders lost approximately 95%+ of their investment value.', sentiment: 'Cautionary' },
  { date: '2020-03-05', type: 'Merger', details: 'RBI imposed moratorium; reconstruction scheme led by SBI consortium', explanation: 'The RBI\'s moratorium was an extraordinary intervention to prevent a bank failure. SBI and other banks invested ₹10,000 Cr to recapitalise Yes Bank. This was effectively a government-backed rescue, not a voluntary merger.', sentiment: 'Cautionary' },
  { date: '2020-03-14', type: 'Bonus', details: 'AT1 bonds worth ₹8,400 Cr written off to zero', explanation: 'Additional Tier 1 bonds were written off as part of the reconstruction scheme, causing total loss for AT1 bondholders. This unprecedented action in India severely damaged market trust in the bank\'s capital instruments and set a controversial precedent.', sentiment: 'Cautionary' },
  { date: '2023-11-20', type: 'Rights Issue', details: 'QIP of ₹5,000 Cr to strengthen capital base', explanation: 'Additional equity raise to improve capital ratios. While strengthening the balance sheet, it further dilutes per-share metrics for existing shareholders. The need for repeated capital raises suggests the bank has not yet reached self-sustaining profitability.', sentiment: 'Cautionary' },
  { date: '2019-11-25', type: 'Dividend', details: 'No dividend declared for FY19 (last dividend was FY18)', explanation: 'Dividend suspension was an early warning sign of financial stress. The bank has not paid any dividend since FY18 and is unlikely to resume dividends for several years.', sentiment: 'Cautionary' },
];

const yesNewsEvents: NewsEvent[] = [
  { id: 'yes-n1', date: '2024-04-25', headline: 'Yes Bank Q4 FY24 profit rises 23% to ₹575 Cr; asset quality stable', source: 'BSE Filing', category: 'Earnings', sentiment: 'Positive', whyItMatters: 'Slow but steady profit improvement indicates the turnaround is making incremental progress. However, absolute profit levels remain a fraction of pre-crisis levels, and the growth rate is from a very low base.', relevanceScore: 70 },
  { id: 'yes-n2', date: '2024-02-10', headline: 'Yes Bank\'s stressed asset pool still contains ₹15,000 Cr in watch-category loans', source: 'Moneycontrol', category: 'Management', sentiment: 'Negative', whyItMatters: 'Hidden stress in the loan book could lead to future provisioning spikes. Watch-category loans are not yet classified as NPAs but have elevated default risk. This represents ongoing balance sheet uncertainty.', relevanceScore: 88 },
  { id: 'yes-n3', date: '2023-09-15', headline: 'Former Yes Bank CEO Rana Kapoor convicted in money laundering case', source: 'NDTV', category: 'Governance', sentiment: 'Negative', whyItMatters: 'While Rana Kapoor is no longer associated with the bank, his conviction reinforces the narrative of governance failure that led to the crisis. This continued negative publicity impacts the bank\'s reputation.', relevanceScore: 65 },
  { id: 'yes-n4', date: '2023-07-01', headline: 'SBI consortium lock-in period on Yes Bank shares ends; potential overhang', source: 'Economic Times', category: 'Management', sentiment: 'Negative', whyItMatters: 'End of the lock-in period means rescue investors can sell their stakes. This creates a potential supply overhang. If SBI or other consortium banks start selling, it would be a significant bearish signal.', relevanceScore: 82 },
  { id: 'yes-n5', date: '2024-06-01', headline: 'Yes Bank partners with NPCI for UPI expansion; aims to grow digital transactions', source: 'Business Standard', category: 'Product', sentiment: 'Positive', whyItMatters: 'Digital banking investments could help Yes Bank attract younger customers and build a low-cost deposit base. However, the bank is late to this market and faces intense competition from established players.', relevanceScore: 40 },
  { id: 'yes-n6', date: '2023-11-22', headline: 'Yes Bank completes ₹5,000 Cr QIP; dilutes equity further', source: 'BSE Filing', category: 'Management', sentiment: 'Negative', whyItMatters: 'Repeated equity dilution continues to erode per-share economics. The need for external capital raises suggests the bank cannot generate sufficient internal capital through retained earnings alone.', relevanceScore: 78 },
  { id: 'yes-n7', date: '2024-03-20', headline: 'Yes Bank retail loan book crosses ₹1 Lakh Cr; pivot from corporate lending progressing', source: 'Livemint', category: 'Product', sentiment: 'Positive', whyItMatters: 'Shift toward retail lending reduces concentration risk that caused the crisis. Retail loans tend to have better credit quality and more predictable cash flows than the large corporate loans that led to the NPA disaster.', relevanceScore: 60 },
  { id: 'yes-n8', date: '2023-05-15', headline: 'Yes Bank reports GNPA improvement to 2.0% from 13.4% at crisis peak', source: 'BSE Filing', category: 'Earnings', sentiment: 'Positive', whyItMatters: 'NPA improvement is the most critical metric for the turnaround story. However, the improvement is partly from write-offs and restructuring rather than pure recovery, which means the underlying asset quality may be better than crisis levels but worse than the headline number suggests.', relevanceScore: 75 },
  { id: 'yes-n9', date: '2020-03-06', headline: 'RBI places Yes Bank under moratorium; withdrawal limit set at ₹50,000', source: 'RBI Press Release', category: 'Regulation', sentiment: 'Negative', whyItMatters: 'The moratorium was a watershed event in Indian banking — the first time a significant private bank came close to failure. The deposit freeze destroyed customer trust and caused permanent reputational damage that the bank continues to recover from.', relevanceScore: 100 },
  { id: 'yes-n10', date: '2024-01-10', headline: 'Moody\'s maintains stable outlook for Yes Bank; notes gradual improvement', source: 'Moody\'s', category: 'Regulation', sentiment: 'Neutral', whyItMatters: 'Rating agency acknowledgment of improvement is a modest positive. However, "stable" outlook means the rating agency does not expect rapid improvement, and the bank\'s ratings remain below investment-grade quality.', relevanceScore: 50 },
  { id: 'yes-n11', date: '2023-04-20', headline: 'SC upholds RBI\'s Yes Bank AT1 bond write-off; bondholders lose ₹8,400 Cr', source: 'Supreme Court of India', category: 'Litigation', sentiment: 'Negative', whyItMatters: 'Supreme Court validation of the AT1 write-off is a permanent loss for bondholders and sets a precedent that hybrid capital instruments can be written off during bank reconstructions. This limits Yes Bank\'s ability to raise AT1 capital in the future.', relevanceScore: 72 },
  { id: 'yes-n12', date: '2020-06-15', headline: 'CBI arrests former Yes Bank CEO Rana Kapoor for fraud and money laundering', source: 'CBI Press Release', category: 'Governance', sentiment: 'Negative', whyItMatters: 'The arrest confirmed the governance failures that led to the crisis. Related-party transactions, quid pro quo lending, and fraudulent practices were central to the bank\'s collapse. While new management has changed the culture, the reputational damage persists.', relevanceScore: 90 },
];

const yesNews: NewsAnalysis = {
  status: 'ready',
  events: yesNewsEvents,
  overallSentiment: 'Negative',
  narrativeSummary:
    'Yes Bank\'s narrative remains dominated by its 2020 crisis legacy. While incremental improvements in profitability and asset quality are visible, the stock of negative events — governance failures, AT1 bond write-off, multiple equity dilutions, and continued institutional selling — far outweighs the modest positives. Based on available data, the turnaround is proceeding slowly, but the path to becoming a "normal" bank with adequate returns is likely to take many more years. The retail-driven shareholding pattern suggests speculative interest rather than fundamental conviction.',
};

const yesRedFlags: RedFlag[] = [
  { id: 'yes-rf1', category: 'Governance', severity: 'High', title: 'History of catastrophic governance failure', evidence: 'Former CEO arrested for fraud. RBI moratorium imposed. Bank required government-backed rescue. Related-party lending and quid pro quo loan practices documented.', explanation: 'While new management has improved governance, the institutional scars remain. The bank\'s crisis was not due to external factors — it was caused by internal fraud and reckless lending at the highest management levels. Trust recovery takes years.', investorCaution: 'Governance risk has structurally elevated risk premium for this stock. Verify that all key management positions are held by credible professionals with clean track records.' },
  { id: 'yes-rf2', category: 'Equity Dilution', severity: 'High', title: 'Massive permanent equity dilution (~10x)', evidence: 'Share count expanded from ~230 Cr pre-crisis to ~2,800 Cr post-FPO and QIPs. EPS collapsed from ₹18.4 to ₹0.70 as a result.', explanation: 'The equity dilution is permanent and irreversible. Even if the bank returns to pre-crisis profit levels, EPS will remain at ~1/10th of pre-crisis levels due to the expanded share count. This fundamentally changes the per-share investment thesis.', investorCaution: 'Do NOT compare current stock price to pre-crisis levels and assume "cheap." The share count is ~10x larger, making the stock price mathematically non-comparable to historical prices.' },
  { id: 'yes-rf3', category: 'Ownership Pattern', severity: 'High', title: 'Retail trap pattern — institutions exiting while retail piles in', evidence: 'FII declined from 16.5% to 15.0%. DII from 22.0% to 19.5%. Retail rose from 33.5% to 36.0% over 5 quarters.', explanation: 'When institutional investors reduce exposure while retail investors increase positions, it often signals that "smart money" sees risks that retail investors are overlooking. The low absolute stock price (₹22) attracts retail speculators who may not understand the dilution impact.', investorCaution: 'Be cautious of the "it\'s only ₹22, how much lower can it go" narrative. The stock can decline further if institutional selling accelerates.' },
  { id: 'yes-rf4', category: 'Asset Quality', severity: 'Medium', title: 'Hidden stress in watch-category loans', evidence: '₹15,000 Cr in watch-category loans not yet classified as NPAs. GNPA improvement partly from write-offs rather than genuine recovery.', explanation: 'Reported GNPA of 2.0% may understate true asset quality stress. Watch-category loans and restructured assets could become NPAs in adverse conditions, requiring additional provisioning that would erode profits.', investorCaution: 'Track credit cost trends and watch for provisions exceeding normal run-rates. Any uptick in slippages from the watch-list would be a significant negative.' },
  { id: 'yes-rf5', category: 'Capital Instruments', severity: 'High', title: 'AT1 bond write-off destroyed market trust in hybrid capital', evidence: '₹8,400 Cr in AT1 bonds written off to zero. Supreme Court upheld the write-off. Bank may face higher costs or inability to raise AT1 capital.', explanation: 'The AT1 write-off set a precedent in Indian banking and severely damaged investor trust. The bank\'s ability to raise hybrid capital at reasonable costs is impaired, limiting its capital management flexibility.', investorCaution: 'This event has long-term implications for the bank\'s cost of capital and capital structure flexibility. Monitor CET1 ratios carefully.' },
  { id: 'yes-rf6', category: 'Returns', severity: 'High', title: 'ROE well below cost of equity — not generating shareholder value', evidence: 'ROE at 4.5% vs estimated cost of equity of ~12%. This means the bank is currently destroying shareholder value on a risk-adjusted basis.', explanation: 'A company that consistently earns below its cost of equity is not creating value for shareholders. Yes Bank needs to at least double its ROE to reach acceptable levels, which may take 3-5 years at current improvement rates.', investorCaution: 'Until ROE consistently exceeds 10-12%, the stock is unlikely to see fundamental re-rating. The current price reflects speculative expectations, not demonstrated performance.' },
  { id: 'yes-rf7', category: 'Earnings Base', severity: 'Medium', title: 'Earnings recovery is from an extremely low base', evidence: 'FY24 net profit of ₹1,900 Cr is only 45% of the FY18 peak of ₹4,225 Cr, despite 10x more shares outstanding.', explanation: 'Growth percentages look impressive (23% YoY) but are from a very low base. It would take many years of sustained 20%+ growth to reach earnings levels that justify the current market capitalisation.', investorCaution: 'Focus on absolute earnings levels and ROE, not growth percentages. A 20% growth rate from ₹1,900 Cr is very different from 20% growth from ₹4,225 Cr.' },
  { id: 'yes-rf8', category: 'Lock-in Risk', severity: 'Medium', title: 'SBI consortium lock-in ended — potential selling overhang', evidence: 'SBI consortium\'s 3-year lock-in on rescue investment expired in March 2023. Consortium banks collectively hold ~29% of the bank.', explanation: 'If rescue investors decide to exit their positions, the selling pressure on a stock with 180M daily trading volume could be significant. Even partial selling would be interpreted as loss of confidence.', investorCaution: 'Monitor quarterly shareholding patterns for any reduction in SBI consortium holdings. Any decline would be a major bearish signal.' },
];

const yesMacro: MacroContext = {
  status: 'ready',
  factors: [
    { factor: 'Interest Rates', sensitivity: 'High', currentImpact: 'Neutral', explanation: 'Yes Bank\'s reliance on higher-cost deposits makes it more sensitive to rate changes than well-established banks with cheaper CASA franchises. Rising rates compress margins more for weaker banks.' },
    { factor: 'GDP / Economic Growth', sensitivity: 'Medium', currentImpact: 'Positive', explanation: 'Economic growth supports credit demand, but Yes Bank\'s ability to capture this growth is limited by its weakened franchise and cautious lending approach post-crisis.' },
    { factor: 'Banking Sector Health', sensitivity: 'High', currentImpact: 'Positive', explanation: 'The overall Indian banking sector is in good health, which helps Yes Bank through improved credit conditions. However, Yes Bank is not a proxy for sector health — its recovery is stock-specific.' },
    { factor: 'Regulatory Environment', sensitivity: 'High', currentImpact: 'Neutral', explanation: 'As a previously-failed bank, Yes Bank faces heightened regulatory scrutiny. Any new RBI requirements on capital, provisioning, or governance could disproportionately impact the bank compared to healthier peers.' },
  ],
  overallAssessment:
    'While the broader macro environment is supportive for Indian banking, Yes Bank\'s ability to benefit from favourable conditions is constrained by its weak franchise, limited capital flexibility, and regulatory overhang. The bank\'s recovery is more dependent on internal execution than on external macro factors.',
};

const yesScenarios: ScenariosAnalysis = {
  status: 'ready',
  scenarios: [
    { type: 'Bull', title: 'Successful turnaround with ROE normalisation', probabilityBand: 'Low', conditions: ['ROE reaches 10%+ by FY27', 'Asset quality remains stable with no provisioning surprises', 'Retail loan book scales profitably', 'SBI consortium remains invested and supportive'], businessImpact: 'Net profit could reach ₹4,000-5,000 Cr. ROE improvement to 10%+ would signal the turnaround is real.', valuationImplication: 'PB re-rating to 1.5-2.0x if ROE normalises. Stock could trade in ₹28-35 range.', keyRisks: ['Asset quality surprises from watch-list loans', 'Execution risk in scaling retail loans profitably'], watchSignals: ['Quarterly ROE trend', 'Credit cost ratio', 'CASA ratio improvement'] },
    { type: 'Base', title: 'Slow grind — improvement but sub-par returns', probabilityBand: 'High', conditions: ['ROE stays in 4-8% range for 2-3 years', 'Gradual NPA resolution but no clean slate', 'Deposit franchise slowly rebuilds', 'No additional equity dilution needed'], businessImpact: 'Profits grow 15-20% annually but from a low base. ROE remains below cost of equity. The bank survives but doesn\'t thrive.', valuationImplication: 'Stock trades in ₹18-28 range. No fundamental re-rating. Returns driven by speculation and news flow.', keyRisks: ['Continued institutional selling', 'Competitive loss of customers to stronger banks'], watchSignals: ['ROE progression', 'Institutional ownership trends', 'Deposit cost trends'] },
    { type: 'Bear', title: 'Turnaround stalls + hidden NPAs surface', probabilityBand: 'Medium', conditions: ['Watch-list loans turn into NPAs — credit costs spike', 'SBI consortium begins selling its 29% stake', 'Additional equity dilution required', 'Deposit flight as rate-sensitive customers leave'], businessImpact: 'Return to losses. Additional provisioning requirements could wipe out 2-3 years of profit. Market capitalisation could halve.', valuationImplication: 'Stock could decline to ₹10-15 range. PB could fall below 0.8x. Another round of equity dilution is possible.', keyRisks: ['Systemic credit event triggering NPA spike', 'Loss of depositor confidence'], watchSignals: ['Watch-list loan migration to NPAs', 'SBI consortium stake changes', 'Deposit growth rate'] },
  ],
  macroContext: yesMacro,
  triggerChecklist: [
    'Track quarterly ROE — is it consistently trending toward 10%?',
    'Monitor SBI consortium shareholding for any reduction',
    'Watch credit cost ratio for provisioning surprises',
    'Track CASA ratio — a key indicator of franchise quality',
    'Monitor watch-list loan migration to NPAs',
    'Compare deposit growth to system-wide growth rates',
  ],
};

const yesScores: ResearchScore[] = [
  { category: 'Business Quality', score: 3, maxScore: 10, weight: 0.20, factors: [{ name: 'Franchise Quality', value: 'Weakened by crisis — trust deficit remains', impact: 'Negative' }, { name: 'Business Model Pivot', value: 'Shifting to retail — positive direction', impact: 'Positive' }, { name: 'Brand Reputation', value: 'Severely damaged by fraud/moratorium', impact: 'Negative' }], explanation: 'The bank\'s franchise was severely damaged by the 2020 crisis. While the pivot to retail lending is a correct strategic direction, rebuilding trust and market share is a multi-year process.' },
  { category: 'Financial Strength', score: 2, maxScore: 10, weight: 0.20, factors: [{ name: 'ROE', value: '4.5% — well below cost of equity', impact: 'Negative' }, { name: 'EPS', value: '₹0.70 — destroyed by dilution', impact: 'Negative' }, { name: 'Profit Recovery', value: 'Slowly improving from massive loss', impact: 'Neutral' }], explanation: 'Financial metrics remain weak despite improvements. The bank is not generating adequate shareholder returns, and the dilution impact is permanent.' },
  { category: 'Valuation Attractiveness', score: 4, maxScore: 10, weight: 0.15, factors: [{ name: 'PE', value: '32x — distorted and unreliable', impact: 'Negative' }, { name: 'PB', value: '1.45x — optically cheap, quality uncertain', impact: 'Neutral' }, { name: 'Peer Data', value: 'Unavailable — cannot benchmark', impact: 'Negative' }], explanation: 'Valuation metrics are largely meaningless in the current state. The stock is priced for speculative recovery rather than current fundamentals.' },
  { category: 'Ownership Quality', score: 2, maxScore: 10, weight: 0.15, factors: [{ name: 'Promoter', value: 'No traditional promoter — rescue consortium', impact: 'Negative' }, { name: 'FII Trend', value: 'Declining — institutions exiting', impact: 'Negative' }, { name: 'Retail Trap', value: 'Rising retail ownership to 36%', impact: 'Negative' }], explanation: 'Ownership pattern is a significant concern. Institutions are reducing exposure while retail investors are increasing — a classic retail trap pattern.' },
  { category: 'Risk Level', score: 2, maxScore: 10, weight: 0.10, factors: [{ name: 'Red Flags', value: '8 flags — 4 High severity', impact: 'Negative' }, { name: 'Governance History', value: 'Catastrophic failure', impact: 'Negative' }, { name: 'Dilution Risk', value: 'Further equity raises possible', impact: 'Negative' }], explanation: 'Risk profile is very high. The combination of governance history, dilution, ownership patterns, and hidden asset quality risks makes this one of the riskiest banking stocks in India.' },
  { category: 'News Momentum', score: 3, maxScore: 10, weight: 0.10, factors: [{ name: 'Recovery Progress', value: 'Slow but visible improvement', impact: 'Positive' }, { name: 'Crisis Legacy', value: 'Negative events still dominate narrative', impact: 'Negative' }, { name: 'Management Actions', value: 'Repeated dilution and lock-in expirations', impact: 'Negative' }], explanation: 'News flow is net negative. While operational improvements are reported, they are overshadowed by governance legacy, dilution events, and institutional selling signals.' },
  { category: 'Macro Resilience', score: 4, maxScore: 10, weight: 0.10, factors: [{ name: 'Rate Sensitivity', value: 'Higher than peers due to weak deposit franchise', impact: 'Negative' }, { name: 'Sector Tailwind', value: 'Indian banking sector is healthy overall', impact: 'Positive' }, { name: 'Regulatory Scrutiny', value: 'Heightened RBI oversight', impact: 'Negative' }], explanation: 'Less resilient to macro shifts than peers due to weaker deposit franchise and higher regulatory scrutiny. Benefits modestly from sector tailwinds but is not a macro play.' },
];

const yesPros: ProConItem[] = [
  { point: 'Gradual turnaround is visible — profits recovering and NPAs declining', evidence: 'Net profit from -₹16,418 Cr (FY20) to +₹1,900 Cr (FY24). GNPA from 13.4% to 2.0%.', category: 'Recovery' },
  { point: 'Pivot to retail lending reduces concentration risk that caused the crisis', evidence: 'Retail loan book crossed ₹1 Lakh Cr. Corporate lending scaled back significantly.', category: 'Strategy' },
  { point: 'New management team with clean track record', evidence: 'Management change post-crisis. New CEO from South Indian Bank with no legacy issues.', category: 'Governance' },
  { point: 'Low absolute stock price may provide optionality on successful turnaround', evidence: 'At ₹22, the stock offers leveraged exposure to any fundamental improvement.', category: 'Optionality' },
  { point: 'Indian banking sector tailwinds support overall credit growth', evidence: 'India GDP 7%+, credit growth 15%+, banking sector broadly healthy.', category: 'Macro' },
];

const yesCons: ProConItem[] = [
  { point: 'Catastrophic governance failure — trust recovery takes many years', evidence: 'CEO arrested for fraud. RBI moratorium imposed. Government-backed rescue required.', category: 'Governance' },
  { point: 'Permanent ~10x equity dilution has destroyed per-share economics', evidence: 'Share count expanded from ~230 Cr to ~2,800 Cr. EPS from ₹18.4 to ₹0.70.', category: 'Dilution' },
  { point: 'ROE at 4.5% is well below cost of equity — not creating shareholder value', evidence: 'Cost of equity ~12%. Current ROE creates negative economic value added.', category: 'Returns' },
  { point: 'Retail trap pattern — institutions exiting while retail piles in', evidence: 'FII 16.5%→15.0%, DII 22.0%→19.5%, Retail 33.5%→36.0% over 5 quarters.', category: 'Ownership' },
  { point: 'Hidden asset quality risk from ₹15,000 Cr watch-list loans', evidence: 'Watch-list loans not yet classified as NPAs could trigger future provisioning.', category: 'Asset Quality' },
  { point: 'AT1 bond write-off limits future capital management flexibility', evidence: '₹8,400 Cr AT1 write-off. Market may demand higher coupon or refuse to participate.', category: 'Capital' },
  { point: 'Stock price comparison to pre-crisis levels is mathematically meaningless', evidence: 'With 10x more shares outstanding, ₹22 today ≠ ₹22 in 2018 in per-share value terms.', category: 'Valuation Trap' },
];

const yesAssessment: FinalAssessment = {
  stance: 'Risky',
  confidence: 'Low',
  thesisStrength: 'Weak',
  timeHorizon: 'Long',
  topEvidence: [
    'ROE of 4.5% is well below cost of equity — the bank is currently destroying shareholder value',
    '~10x permanent equity dilution has irreversibly changed per-share economics',
    'Retail trap ownership pattern — institutions exiting while retail increases exposure',
    '8 red flags including 4 at High severity covering governance, dilution, ownership, and asset quality',
    'Recovery pace is slow — at current improvement rates, ROE normalisation may take 3-5+ years',
  ],
  unresolvedUncertainties: [
    'Whether watch-list loans will migrate to NPAs and trigger provisioning spikes',
    'Whether SBI consortium will begin selling its 29% stake',
    'Whether the bank can scale retail lending profitably without compromising on asset quality',
  ],
  suitableFor: ['Speculative investors comfortable with potential total loss', 'Turnaround specialists with deep banking sector expertise'],
  notSuitableFor: ['Risk-averse investors', 'Core portfolio holdings', 'Income-seeking investors (zero dividend)', 'Investors who cannot monitor quarterly results closely', 'Long-term compounding strategies'],
  watchItems: ['Quarterly ROE trajectory toward 10%', 'SBI consortium shareholding changes', 'Watch-list to NPA migration ratio', 'CASA ratio improvement', 'Credit cost trends', 'Any further equity dilution announcements'],
  reasonsAttractive: ['Turnaround is visible — profits recovering', 'Low absolute price offers leveraged optionality', 'Retail lending pivot is strategically sound', 'Indian banking tailwinds provide macro support'],
  reasonsCautious: ['Governance scars will take years to heal', 'Permanent dilution cannot be undone', 'ROE below cost of equity = value destruction', 'Institutional money is quietly leaving', 'Hidden asset quality risks remain'],
  whatStrengthensBull: ['ROE reaching 10%+ consistently', 'SBI consortium maintaining or increasing stake', 'Clean resolution of watch-list loans'],
  whatWeakensThesis: ['SBI consortium selling shares', 'NPA spike from watch-list migration', 'Another round of equity dilution', 'Deposit flight to stronger banks'],
};

const yesSources: SourceAttribution[] = [
  { category: 'Financial Statements', name: 'BSE/NSE Annual Filings', description: 'Audited annual and quarterly results', url: 'https://www.bseindia.com', reliability: 'High', sourceType: 'Financials', accessedAt: '2024-06-30' },
  { category: 'Price Data', name: 'NSE Historical Data', description: 'Daily and monthly OHLCV data', url: 'https://www.nseindia.com', reliability: 'High', sourceType: 'Price', accessedAt: '2024-06-30' },
  { category: 'Ownership', name: 'SEBI Shareholding Filings', description: 'Quarterly shareholding patterns', url: 'https://www.sebi.gov.in', reliability: 'High', sourceType: 'Ownership', accessedAt: '2024-06-30' },
  { category: 'Regulatory', name: 'RBI Press Releases', description: 'Moratorium orders, reconstruction scheme details', url: 'https://www.rbi.org.in', reliability: 'High', sourceType: 'Macro', accessedAt: '2024-06-30' },
  { category: 'Legal', name: 'Supreme Court Judgments', description: 'AT1 bond write-off ruling', reliability: 'High', sourceType: 'Other', accessedAt: '2024-06-30' },
  { category: 'News', name: 'Multiple Publications', description: 'Moneycontrol, NDTV, Economic Times, Business Standard, CBI', reliability: 'Medium', sourceType: 'News', accessedAt: '2024-06-30' },
  { category: 'Corporate Actions', name: 'BSE Corporate Actions', description: 'FPO, QIP, moratorium, AT1 write-off filings', url: 'https://www.bseindia.com/corporates', reliability: 'High', sourceType: 'Corporate Actions', accessedAt: '2024-06-30' },
];

const yesReport: ResearchReport = {
  meta: { generatedAt: '2024-07-01T10:00:00Z', dataCompleteness: 'partial', coverageStart: '2015-04-01', coverageEnd: '2024-06-30', reportVersion: '1.0.0', tickerResolvedFrom: 'YESBANK' },
  companyProfile: yesProfile,
  priceAnalysis: yesPriceAnalysis,
  fundamentals: yesFinancials,
  valuation: yesValuation,
  balanceSheetHealth: yesBalanceSheet,
  ownershipAnalysis: yesOwnership,
  corporateActions: yesCorporateActions,
  newsAnalysis: yesNews,
  redFlags: yesRedFlags,
  macroContext: yesMacro,
  scenarios: yesScenarios,
  scores: yesScores,
  pros: yesPros,
  cons: yesCons,
  finalAssessment: yesAssessment,
  sources: yesSources,
};


// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const MOCK_RESEARCH_REPORTS: Record<string, ResearchReport> = {
  HDFCBANK: hdfcReport,
  TATASTEEL: tataReport,
  YESBANK: yesReport,
};

export const AVAILABLE_STOCKS: CompanySearchResult[] = [
  { ticker: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', sector: 'Financial Services', industry: 'Private Sector Bank', marketCapFormatted: '₹13.5 Lakh Cr' },
  { ticker: 'TATASTEEL', name: 'Tata Steel Ltd', exchange: 'NSE', sector: 'Materials', industry: 'Iron & Steel', marketCapFormatted: '₹1.8 Lakh Cr' },
  { ticker: 'YESBANK', name: 'Yes Bank Ltd', exchange: 'NSE', sector: 'Financial Services', industry: 'Private Sector Bank', marketCapFormatted: '₹60,000 Cr' },
];
