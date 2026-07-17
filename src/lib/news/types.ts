// Phase 6 news domain types — NEW module tree, deliberately separate from the
// DIRTY src/lib/types.ts (which still owns the mock-era display NewsItem for
// this session's unrelated in-flight edits). Later Phase 6 plans (fetch,
// parse, match, summarize, sweep) import ONLY from here for the real pipeline.

// The normalized shape every fetch/parse path (Finnhub, Google News RSS,
// Indian publisher RSS) produces before dedup/match/summarize runs. Finnhub's
// `datetime` (unix seconds) and RSS RFC-822 pubDates are both converted to
// ISO-8601 UTC at parse time (06-RESEARCH-external.md Pitfall 4) — no source-
// specific date shape ever leaks past the parse boundary.
export interface RawNewsItem {
  title: string;
  url: string;
  source: string;
  publishedAtIso: string;
  abstract: string | null;
}

// Mirrors the CHECK constraints on news_items (sentiment_label, importance)
// from the Phase-1 DDL — see supabase/migrations/20260714032952_initial_schema.sql.
export interface NewsSummaryResult {
  summary: string;
  whyItMatters: string;
  sentimentLabel: 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral';
  importance: 'High' | 'Medium' | 'Low';
}

export interface InstrumentMatch {
  instrumentId: string;
  matchedVia: 'symbol' | 'company-name';
}
