'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  ExternalLink,
  Briefcase,
  Clock,
  Eye,
  Play,
  Wand2,
  Loader2,
  AlertCircle
} from 'lucide-react';
import type { LiveVideo } from '@/lib/youtube-types';

interface VideoInsightCardProps {
  video: LiveVideo;
  index: number;
  onAnalyze: () => void;
  onOpenModal: () => void;
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

export function VideoInsightCard({ video, index, onAnalyze, onOpenModal }: VideoInsightCardProps) {
  const analysis = video.analysis;
  const hasPortfolioHits = analysis && analysis.affects_portfolio.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: 'easeOut' }}
      className={`glass-card rounded-2xl overflow-hidden transition-all duration-300 hover:border-primary/30 cursor-pointer ${
        hasPortfolioHits ? 'glass-card-glow border border-primary/15' : ''
      }`}
      onClick={onOpenModal}
    >
      {hasPortfolioHits && analysis && (
        <div className="flex items-center gap-2 px-5 py-2 bg-primary/8 border-b border-primary/10">
          <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-primary">
            Affects your portfolio: {analysis.affects_portfolio.join(', ')}
          </span>
        </div>
      )}

      <div className="p-5">
        <div className="flex gap-4">
          <div
            className={`relative h-24 w-40 rounded-xl shrink-0 flex items-center justify-center overflow-hidden group bg-slate-800`}
          >
            {video.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.thumbnail_url}
                alt={video.title}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
            <div className="relative h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform z-10">
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </div>
            {video.duration && (
              <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded z-10">
                {video.duration}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <h3 className="text-sm font-bold text-foreground leading-snug line-clamp-2 transition-colors">
              {video.title}
            </h3>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="font-medium text-foreground/70">{video.channel_name}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo(video.published_at)}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {video.view_count || '0'} views
              </span>
            </div>

            {analysis && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {analysis.bullish_on.slice(0, 3).map((t) => (
                  <TickerBadge key={t} ticker={t} type={analysis.affects_portfolio.includes(t) ? 'portfolio' : 'bullish'} />
                ))}
                {analysis.bearish_on.slice(0, 2).map((t) => (
                  <TickerBadge key={t} ticker={t} type="bearish" />
                ))}
                {(analysis.bullish_on.length + analysis.bearish_on.length) > 5 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{analysis.bullish_on.length + analysis.bearish_on.length - 5} more
                  </span>
                )}
              </div>
            )}
            
            {video.analysis_status === 'idle' && (
              <div className="pt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnalyze();
                    onOpenModal(); // optionally open modal to see loading state
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Analyze Insights
                </button>
              </div>
            )}
            
            {video.analysis_status === 'analyzing' && (
              <div className="pt-2 flex items-center gap-2 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing transcript...
              </div>
            )}
            
            {video.analysis_status === 'error' && (
              <div className="pt-2 flex items-center gap-2 text-xs text-danger">
                <AlertCircle className="h-3.5 w-3.5" />
                {video.error_msg || 'Analysis failed'}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <a
              href={`https://youtube.com/watch?v=${video.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
