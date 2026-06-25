'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  TrendingUp,
  TrendingDown,
  Briefcase,
  Clock,
  Eye,
  Loader2,
  AlertCircle,
  Wand2,
  ExternalLink,
  FileText
} from 'lucide-react';
import type { LiveVideo } from '@/lib/youtube-types';

interface VideoAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  video: LiveVideo | null;
  onAnalyze: () => void;
}

function timeAgo(isoString: string): string {
  const now = Date.now();
  const diff = now - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  return `${mins}m ago`;
}

function TickerBadge({ ticker, type }: { ticker: string; type: 'bullish' | 'bearish' | 'portfolio' }) {
  const styles = {
    bullish: 'bg-success/10 text-success border-success/20',
    bearish: 'bg-danger/10 text-danger border-danger/20',
    portfolio: 'bg-primary/10 text-primary border-primary/20 font-bold',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-mono font-semibold transition-all ${styles[type]}`}>
      {ticker}
    </span>
  );
}

export function VideoAnalysisModal({ isOpen, onClose, video, onAnalyze }: VideoAnalysisModalProps) {
  const [activeTab, setActiveTab] = React.useState<'insights' | 'transcript'>('insights');

  // Reset tab when modal closes or video changes
  React.useEffect(() => {
    setActiveTab('insights');
  }, [isOpen, video?.video_id]);

  if (!isOpen || !video) return null;

  const analysis = video.analysis;
  const hasPortfolioHits = analysis && analysis.affects_portfolio.length > 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`relative w-full max-w-3xl glass-card rounded-2xl shadow-2xl overflow-hidden border ${
            hasPortfolioHits ? 'border-primary/30 ring-1 ring-primary/20' : 'border-border/60'
          }`}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-muted/20">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Intelligence Report
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6">
            {/* Video Hero */}
            <div className="flex flex-col sm:flex-row gap-5 mb-8">
              <a
                href={`https://youtube.com/watch?v=${video.video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative h-36 sm:w-64 rounded-xl shrink-0 flex items-center justify-center overflow-hidden group cursor-pointer bg-slate-800"
              >
                {video.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnail_url}
                    alt={video.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                <div className="relative h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform z-10">
                  <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                </div>
                {video.duration && (
                  <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-mono px-2 py-0.5 rounded z-10">
                    {video.duration}
                  </span>
                )}
              </a>

              <div className="flex-1 space-y-3">
                <a
                  href={`https://youtube.com/watch?v=${video.video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-1.5"
                >
                  <h3 className="text-lg font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
                    {video.title}
                  </h3>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>

                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="font-semibold text-foreground/80">{video.channel_name}</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {timeAgo(video.published_at)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-4 w-4" />
                    {video.view_count || '0'} views
                  </span>
                </div>
              </div>
            </div>

            {/* Analysis Section */}
            {video.analysis_status === 'idle' && (
              <div className="flex flex-col items-center justify-center py-12 bg-muted/20 rounded-xl border border-border/50 border-dashed">
                <Wand2 className="h-10 w-10 text-primary/40 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Ready to Analyze</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                  Extract actionable insights, mentioned tickers, and determine bullish/bearish sentiments using the configured AI provider.
                </p>
                <button
                  onClick={onAnalyze}
                  className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-bold shadow-md shadow-primary/20 transition-all cursor-pointer"
                >
                  Generate Intelligence Report
                </button>
              </div>
            )}

            {video.analysis_status === 'analyzing' && (
              <div className="flex flex-col items-center justify-center py-16 bg-muted/10 rounded-xl border border-border/30">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
                <p className="text-sm font-semibold animate-pulse text-foreground/80">Analyzing transcript...</p>
                <p className="text-xs text-muted-foreground mt-2">This usually takes 3-5 seconds</p>
              </div>
            )}

            {video.analysis_status === 'error' && (
              <div className="flex flex-col items-center justify-center py-12 bg-danger/5 rounded-xl border border-danger/20">
                <AlertCircle className="h-10 w-10 text-danger/60 mb-4" />
                <h3 className="text-base font-semibold text-danger mb-2">Analysis Failed</h3>
                <p className="text-sm text-danger/80 text-center max-w-md mb-4">{video.error_msg}</p>
                <button
                  onClick={onAnalyze}
                  className="px-4 py-2 bg-danger/10 hover:bg-danger/20 text-danger rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            )}

            {video.analysis_status === 'done' && analysis && (
              <div className="space-y-6">
                
                {/* Tabs */}
                {analysis.raw_transcript && (
                  <div className="flex items-center gap-4 border-b border-border/50 pb-2 mb-4">
                    <button
                      onClick={() => setActiveTab('insights')}
                      className={`text-sm font-bold flex items-center gap-2 pb-2 -mb-[9px] border-b-2 transition-colors ${
                        activeTab === 'insights' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Wand2 className="h-4 w-4" /> Insights
                    </button>
                    <button
                      onClick={() => setActiveTab('transcript')}
                      className={`text-sm font-bold flex items-center gap-2 pb-2 -mb-[9px] border-b-2 transition-colors ${
                        activeTab === 'transcript' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <FileText className="h-4 w-4" /> Raw Transcript
                    </button>
                  </div>
                )}

                {activeTab === 'transcript' && analysis.raw_transcript && (
                  <div className="bg-muted/10 p-4 rounded-xl border border-border/50 max-h-96 overflow-y-auto">
                    <p className="text-sm text-foreground/80 leading-relaxed font-mono whitespace-pre-wrap">
                      {analysis.raw_transcript}
                    </p>
                  </div>
                )}

                {activeTab === 'insights' && (
                  <>
                    {hasPortfolioHits && (
                  <div className="flex flex-wrap items-center gap-2 p-3.5 bg-primary/10 rounded-xl border border-primary/20">
                    <Briefcase className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm font-medium text-primary">Direct portfolio impact:</span>
                    {analysis.affects_portfolio.map((t) => (
                      <TickerBadge key={t} ticker={t} type="portfolio" />
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                    Key Insights
                  </h4>
                  <ul className="space-y-2.5">
                    {analysis.summary_bullets.map((point, i) => (
                      <li key={i} className="flex gap-3 text-sm text-foreground/90 leading-relaxed">
                        <span className="text-primary font-mono shrink-0 mt-0.5">
                          {String(i + 1).padStart(2, '0')}.
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                  {analysis.bullish_on.length > 0 && (
                    <div className="space-y-3 p-4 bg-success/5 rounded-xl border border-success/10">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-success flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Bullish Outlook
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {analysis.bullish_on.map((t) => (
                          <TickerBadge key={t} ticker={t} type={analysis.affects_portfolio.includes(t) ? 'portfolio' : 'bullish'} />
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.bearish_on.length > 0 && (
                    <div className="space-y-3 p-4 bg-danger/5 rounded-xl border border-danger/10">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-danger flex items-center gap-2">
                        <TrendingDown className="h-4 w-4" />
                        Bearish Outlook
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {analysis.bearish_on.map((t) => (
                          <TickerBadge key={t} ticker={t} type="bearish" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {analysis.key_themes.length > 0 && (
                  <div className="pt-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Macro Themes</h4>
                    <div className="flex flex-wrap gap-2">
                      {analysis.key_themes.map((theme) => (
                        <span key={theme} className="text-xs px-3 py-1 bg-muted/50 border border-border/60 rounded-full text-foreground/80">
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {analysis.mentioned_tickers.length > 0 && (
                  <div className="pt-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">All Mentioned Tickers</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.mentioned_tickers.map((t) => (
                        <span key={t} className="text-[11px] font-mono text-muted-foreground bg-background border border-border/50 px-2 py-0.5 rounded-md">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(analysis.analysis_source === 'keyword' || analysis.analysis_source === 'description_only') && (
                  <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-500/90 leading-normal">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                      <div>
                        <span className="font-semibold block text-amber-500">Running in Demo / Keyword fallback mode</span>
                        This video was analyzed using a local keyword scanner. For full multi-language translation (Hindi/Telugu) and deep AI financial insights, configure a free Google Gemini key.
                      </div>
                    </div>
                    <a href="/settings" className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 hover:text-amber-400 font-semibold rounded-lg transition-colors whitespace-nowrap text-center self-stretch sm:self-auto flex items-center justify-center">
                      Configure AI Key
                    </a>
                  </div>
                )}
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
