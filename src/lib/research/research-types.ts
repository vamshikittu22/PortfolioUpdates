// =============================================================================
// FolioIntel Research Module — TypeScript Data Model
// =============================================================================
// Every type in this file is designed for explainability, traceability, and
// transparent reasoning. No black-box scoring or opaque verdicts.
// =============================================================================

// ---------------------------------------------------------------------------
// Section & Report Status
// ---------------------------------------------------------------------------

/** Status of an individual section within the research report */
export type SectionStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'error' | 'stale';

/** Report-level metadata */
export interface ReportMeta {
  generatedAt: string;             // ISO date
  dataCompleteness: 'full' | 'partial';
  coverageStart: string;           // earliest data date
  coverageEnd: string;             // latest data date
  reportVersion: string;
  tickerResolvedFrom?: string;     // original search query
}

// ---------------------------------------------------------------------------
// Company Profile
// ---------------------------------------------------------------------------

export type CapClassification = 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Micro Cap';

export interface CompanyProfile {
  name: string;
  ticker: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number;
  marketCapFormatted: string;
  capClassification: CapClassification;
  country: string;
  isin?: string;
  listingStatus: 'Active' | 'Suspended' | 'Delisted';
  description: string;
  businessModel: string;
  keyProducts: string[];
  foundedYear?: number;
  headquartersCity?: string;
  website?: string;
}

// ---------------------------------------------------------------------------
// Price & Market Data
// ---------------------------------------------------------------------------

export interface PriceSnapshot {
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  weekHigh52: number;
  weekLow52: number;
  volume: number;
  avgVolume: number;
  currency: string;
}

export interface HistoricalPricePoint {
  date: string;       // ISO date
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
}

export interface CAGREntry {
  period: string;        // e.g. "1Y", "3Y", "5Y", "10Y", "Max"
  value: number;         // percentage
  benchmark?: number;    // benchmark CAGR for same period
  benchmarkName?: string;
}

export interface Drawdown {
  startDate: string;
  endDate: string;
  peakPrice: number;
  troughPrice: number;
  drawdownPercent: number;
  recoveryDate?: string;
  cause?: string;
}

export interface PriceAnalysis {
  status: SectionStatus;
  snapshot: PriceSnapshot;
  historicalPrices: HistoricalPricePoint[];
  cagr: CAGREntry[];
  majorDrawdowns: Drawdown[];
  trendQuality: 'Strong Uptrend' | 'Moderate Uptrend' | 'Sideways' | 'Moderate Downtrend' | 'Strong Downtrend';
  trendExplanation: string;
  benchmarkName: string;
}

// ---------------------------------------------------------------------------
// Financial Metrics (Fundamentals)
// ---------------------------------------------------------------------------

export interface FinancialMetricYear {
  year: number;
  revenue: number | null;
  revenueGrowth: number | null;
  ebitda: number | null;
  netProfit: number | null;
  netProfitGrowth: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  cashConversionRatio: number | null;
}

export interface FundamentalsAnalysis {
  status: SectionStatus;
  metrics: FinancialMetricYear[];
  currency: string;
  unitScale: 'Cr' | 'Mn' | 'Bn';   // display unit
  highlights: MetricHighlight[];
}

export interface MetricHighlight {
  metric: string;
  currentValue: string;
  trend: 'improving' | 'stable' | 'deteriorating';
  explanation: string;
  benchmark?: string;
}

// ---------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------

export interface ValuationMultiple {
  name: string;           // e.g. "PE Ratio"
  current: number | null;
  median5Y: number | null;
  sectorAverage: number | null;
  verdict: 'Rich' | 'Fair' | 'Discounted' | 'N/A';
  explanation: string;
}

export interface PeerValuation {
  companyName: string;
  ticker: string;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  marketCap: string;
  roe: number | null;
}

export interface ValuationAnalysis {
  status: SectionStatus;
  multiples: ValuationMultiple[];
  historicalPE: { year: number; pe: number | null }[];
  peers: PeerValuation[];
  dividendYield: number | null;
  overallVerdict: 'Rich' | 'Fair' | 'Discounted' | 'Mixed';
  verdictExplanation: string;
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Balance Sheet & Debt Health
// ---------------------------------------------------------------------------

export interface DebtTrendPoint {
  year: number;
  totalDebt: number | null;
  debtToEquity: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
}

export interface BalanceSheetHealth {
  status: SectionStatus;
  debtTrend: DebtTrendPoint[];
  overallVerdict: 'Healthy' | 'Manageable' | 'Stretched' | 'Risky';
  verdictExplanation: string;
  warnings: string[];
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Ownership / Shareholding
// ---------------------------------------------------------------------------

export interface OwnershipSnapshot {
  date: string;      // quarter end date
  promoterHolding: number;
  fiiHolding: number;
  diiHolding: number;
  retailHolding: number;
  pledgedShares: number | null;   // % of promoter holding pledged
}

export interface OwnershipAnalysis {
  status: SectionStatus;
  snapshots: OwnershipSnapshot[];
  trendSummary: string;
  redFlags: string[];
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Corporate Actions
// ---------------------------------------------------------------------------

export type CorporateActionType = 'Dividend' | 'Split' | 'Bonus' | 'Buyback' | 'Rights Issue' | 'Merger' | 'Demerger';

export interface CorporateAction {
  date: string;
  type: CorporateActionType;
  details: string;
  explanation: string;
  sentiment: 'Positive' | 'Neutral' | 'Cautionary';
}

// ---------------------------------------------------------------------------
// News & Narrative
// ---------------------------------------------------------------------------

export type NewsCategory =
  | 'Earnings'
  | 'Regulation'
  | 'Management'
  | 'Litigation'
  | 'Acquisition'
  | 'Macro'
  | 'Product'
  | 'Governance'
  | 'Other';

export interface NewsEvent {
  id: string;
  date: string;
  headline: string;
  source: string;
  url?: string;
  category: NewsCategory;
  sentiment: 'Positive' | 'Negative' | 'Neutral' | 'Mixed';
  whyItMatters: string;
  relevanceScore?: number;        // 0–100
  eventType?: string;             // e.g. "Q4 Results Beat"
}

export interface NewsAnalysis {
  status: SectionStatus;
  events: NewsEvent[];
  overallSentiment: 'Positive' | 'Negative' | 'Neutral' | 'Mixed';
  narrativeSummary: string;
}

// ---------------------------------------------------------------------------
// Red Flags
// ---------------------------------------------------------------------------

export type RedFlagSeverity = 'High' | 'Medium' | 'Low';

export interface RedFlag {
  id: string;
  category: string;
  severity: RedFlagSeverity;
  title: string;
  evidence: string;
  explanation: string;
  investorCaution: string;
}

// ---------------------------------------------------------------------------
// Macro Context
// ---------------------------------------------------------------------------

export type SensitivityLevel = 'High' | 'Medium' | 'Low';

export interface MacroFactor {
  factor: string;
  sensitivity: SensitivityLevel;
  currentImpact: 'Positive' | 'Negative' | 'Neutral';
  explanation: string;
}

export interface MacroContext {
  status: SectionStatus;
  factors: MacroFactor[];
  overallAssessment: string;
}

// ---------------------------------------------------------------------------
// Future Outlook / Scenarios
// ---------------------------------------------------------------------------

export type ScenarioType = 'Bull' | 'Base' | 'Bear';

export interface ScenarioCase {
  type: ScenarioType;
  title: string;
  probabilityBand: 'Low' | 'Medium' | 'High';
  conditions: string[];
  businessImpact: string;
  valuationImplication: string;
  keyRisks: string[];
  watchSignals?: string[];
}

export interface ScenariosAnalysis {
  status: SectionStatus;
  scenarios: ScenarioCase[];
  macroContext: MacroContext;
  triggerChecklist: string[];
}

// ---------------------------------------------------------------------------
// Scoring — Transparent & Explainable
// ---------------------------------------------------------------------------

export interface ScoreFactor {
  name: string;
  value: string;
  impact: 'Positive' | 'Negative' | 'Neutral';
}

export interface ResearchScore {
  category: string;
  score: number;          // 0–10
  maxScore: 10;
  weight: number;         // 0–1, all weights sum to 1
  factors: ScoreFactor[];
  explanation: string;
}

// ---------------------------------------------------------------------------
// Final Assessment — Decision Support (NOT Advice)
// ---------------------------------------------------------------------------

export type ResearchStance = 'Favorable' | 'Mixed' | 'Risky';
export type ConfidenceLevel = 'Low' | 'Medium' | 'High';
export type ThesisStrength = 'Weak' | 'Moderate' | 'Strong';
export type TimeHorizon = 'Short' | 'Medium' | 'Long';

export interface FinalAssessment {
  stance: ResearchStance;
  confidence: ConfidenceLevel;
  thesisStrength: ThesisStrength;
  timeHorizon: TimeHorizon;
  topEvidence: string[];
  unresolvedUncertainties: string[];
  suitableFor: string[];
  notSuitableFor: string[];
  watchItems: string[];
  reasonsAttractive: string[];
  reasonsCautious: string[];
  whatStrengthensBull: string[];
  whatWeakensThesis: string[];
}

// ---------------------------------------------------------------------------
// Source Attribution — Traceability
// ---------------------------------------------------------------------------

export type SourceType = 'Financials' | 'Price' | 'News' | 'Macro' | 'Ownership' | 'Corporate Actions' | 'Other';

export interface SourceAttribution {
  category: string;
  name: string;
  description: string;
  url?: string;
  lastUpdated?: string;
  reliability: 'High' | 'Medium' | 'Low';
  sourceType: SourceType;
  accessedAt?: string;
}

// ---------------------------------------------------------------------------
// Pros & Cons
// ---------------------------------------------------------------------------

export interface ProConItem {
  point: string;
  evidence: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Company Search
// ---------------------------------------------------------------------------

export interface CompanySearchResult {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCapFormatted: string;
}

// ---------------------------------------------------------------------------
// ResearchReport — Top-Level Aggregate
// ---------------------------------------------------------------------------

export interface ResearchReport {
  meta: ReportMeta;
  companyProfile: CompanyProfile;
  priceAnalysis: PriceAnalysis;
  fundamentals: FundamentalsAnalysis;
  valuation: ValuationAnalysis;
  balanceSheetHealth: BalanceSheetHealth;
  ownershipAnalysis: OwnershipAnalysis;
  corporateActions: CorporateAction[];
  newsAnalysis: NewsAnalysis;
  redFlags: RedFlag[];
  macroContext: MacroContext;
  scenarios: ScenariosAnalysis;
  scores: ResearchScore[];
  pros: ProConItem[];
  cons: ProConItem[];
  finalAssessment: FinalAssessment;
  sources: SourceAttribution[];
}
