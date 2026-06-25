'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Search, SlidersHorizontal, Briefcase,
  Clock, LayoutGrid, AlertCircle, CheckCircle2, XCircle,
  Loader2, Info,
} from 'lucide-react';
import { ChannelPanel } from '@/components/youtube/ChannelPanel';
import { VideoInsightCard } from '@/components/youtube/VideoInsightCard';
import { YouTubeEmptyState } from '@/components/youtube/EmptyState';
import {
  MOCK_CHANNELS, MOCK_VIDEOS, MOCK_HOLDINGS,
  type YTChannel, type YTVideo,
} from '@/lib/mock-youtube-data';
import { groupByWeek, type LiveVideo } from '@/lib/youtube-types';
import { VideoAnalysisModal } from '@/components/youtube/VideoAnalysisModal';
import { useSettings } from '@/hooks/use-settings';

type FilterTab = 'all' | 'portfolio' | 'bullish' | 'bearish';
type TimeFilter = '7d' | '30d' | 'all';

// Maps a mock YTVideo to LiveVideo
function mockToLiveVideo(v: YTVideo): LiveVideo {
  return {
    video_id: v.video_id,
    channel_id: v.channel_id,
    channel_name: v.channel_name,
    title: v.title,
    published_at: v.published_at,
    thumbnail_url: v.thumbnail_url || '',
    duration: v.duration,
    view_count: v.view_count,
    description: '',
    analysis_status: 'done',
    analysis: {
      summary_bullets: v.transcript_summary,
      mentioned_tickers: v.mentioned_tickers,
      bullish_on: v.bullish_on,
      bearish_on: v.bearish_on,
      key_themes: v.key_points,
      affects_portfolio: v.affects_portfolio,
      confidence: 'high',
      analysis_source: 'gemini',
      transcript_available: true,
    }
  };
}

type ToastType = 'success' | 'error' | 'info';
interface Toast { type: ToastType; message: string; detail?: string }

export default function YouTubePage() {
  const [channels, setChannels] = useState<YTChannel[]>(MOCK_CHANNELS);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30d');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isScanning, setIsScanning] = useState(false);
  const [isResolvingChannel, setIsResolvingChannel] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  
  const [realVideos, setRealVideos] = useState<LiveVideo[]>([]);
  const [useRealData, setUseRealData] = useState(false);
  const [lastScanStats, setLastScanStats] = useState<{ found: number; duration: number } | null>(null);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  
  const [activeModalVideoId, setActiveModalVideoId] = useState<string | null>(null);
  
  const { settings } = useSettings();

  useEffect(() => {
    const missing: string[] = [];
    if (!settings.keys[settings.preferredProvider]) {
      missing.push(settings.preferredProvider.toUpperCase());
    }
    setMissingKeys(missing);
  }, [settings.preferredProvider, settings.keys]);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 5000);
  }, []);

  // ── Channel Handlers ──────────────────────────────────────────────
  const handleAddChannel = useCallback(async (url: string) => {
    setIsResolvingChannel(true);

    try {
      const res = await fetch(`/api/youtube/channel?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast({
          type: 'error',
          message: data.error ?? 'Could not resolve channel',
          detail: data.hint ?? 'Check the URL and try again',
        });
        return;
      }

      const ch = data.channel;
      const newChannel: YTChannel = {
        channel_id: ch.channel_id,
        channel_name: ch.channel_name,
        handle: ch.handle,
        avatar_color: 'from-teal-500 to-cyan-600',
        is_active: true,
        subscriber_count: ch.subscriber_count,
        video_count: 0,
      };

      setChannels((prev) => {
        if (prev.some((c) => c.channel_id === ch.channel_id)) {
          showToast({ type: 'info', message: `${ch.channel_name} is already tracked` });
          return prev;
        }
        return [...prev, newChannel];
      });

      showToast({
        type: 'success',
        message: `Added ${ch.channel_name}`,
        detail: `Click "Fetch Videos" to load content`,
      });
    } catch (err) {
      showToast({ type: 'error', message: 'Network error resolving channel' });
    } finally {
      setIsResolvingChannel(false);
    }
  }, [showToast]);

  const handleToggleChannel = useCallback((id: string) => {
    setChannels((prev) => prev.map((c) => c.channel_id === id ? { ...c, is_active: !c.is_active } : c));
  }, []);

  const handleRemoveChannel = useCallback((id: string) => {
    setChannels((prev) => prev.filter((c) => c.channel_id !== id));
    if (selectedChannelId === id) setSelectedChannelId(null);
  }, [selectedChannelId]);

  // ── Real Fetch ─────────────────────────────────────────────────────
  const handleScan = useCallback(async () => {
    const activeChannels = channels.filter((c) => c.is_active);
    if (!activeChannels.length) {
      showToast({ type: 'info', message: 'No active channels to fetch' });
      return;
    }

    setIsScanning(true);
    const startTime = Date.now();
    try {
      let fetchedVideos: LiveVideo[] = [];
      let foundCount = 0;

      for (const ch of activeChannels) {
        const isMock = MOCK_CHANNELS.some((mc) => mc.channel_id === ch.channel_id);
        
        if (isMock) {
          // Bypass API for demo channels to avoid 404s, just pull their mock videos
          const mockVids = MOCK_VIDEOS.filter(v => v.channel_id === ch.channel_id).map(mockToLiveVideo);
          fetchedVideos = [...fetchedVideos, ...mockVids];
          foundCount += mockVids.length;
        } else {
          // Real channel, hit the API
          const res = await fetch(`/api/youtube/videos?channel_id=${ch.channel_id}&channel_name=${encodeURIComponent(ch.channel_name)}&max=30`);
          const data = await res.json();
          if (data.success && data.videos) {
            fetchedVideos = [...fetchedVideos, ...data.videos];
            foundCount += data.videos.length;
          }
        }
      }

      setRealVideos(fetchedVideos);
      setUseRealData(true);
      setMissingKeys([]);
      setLastScanStats({
        found: foundCount,
        duration: Math.round((Date.now() - startTime) / 1000),
      });

      showToast({
        type: 'success',
        message: `Fetched ${foundCount} video${foundCount !== 1 ? 's' : ''}`,
        detail: `Click on a video to analyze it`,
      });
    } catch (err) {
      showToast({ type: 'error', message: 'Network error during fetch' });
    } finally {
      setIsScanning(false);
    }
  }, [channels, showToast]);

  const handleAnalyze = useCallback(async (videoId: string, channelName: string, title: string) => {
    setRealVideos((prev) => prev.map((v) => v.video_id === videoId ? { ...v, analysis_status: 'analyzing' } : v));
    
    try {
      const res = await fetch('/api/youtube/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          video_id: videoId, 
          title, 
          channel_name: channelName, 
          holdings: MOCK_HOLDINGS,
          ai_provider: settings.preferredProvider,
          ai_api_key: settings.keys[settings.preferredProvider]
        }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setRealVideos((prev) => prev.map((v) => 
          v.video_id === videoId 
            ? { ...v, analysis_status: 'done', analysis: data.analysis } 
            : v
        ));
      } else {
        setRealVideos((prev) => prev.map((v) => 
          v.video_id === videoId 
            ? { ...v, analysis_status: 'error', error_msg: data.error || 'Analysis failed' } 
            : v
        ));
      }
    } catch (err) {
      setRealVideos((prev) => prev.map((v) => 
        v.video_id === videoId 
          ? { ...v, analysis_status: 'error', error_msg: 'Network error' } 
          : v
      ));
    }
  }, []);

  // ── Video Feed (real or mock) ─────────────────────────────────────
  const sourceVideos: LiveVideo[] = useRealData ? realVideos : MOCK_VIDEOS.map(mockToLiveVideo);

  const isMockChannel = (id: string) => id.startsWith('UC_') || !MOCK_CHANNELS.some((c) => c.channel_id === id);

  const filteredVideos = useMemo(() => {
    let videos = [...sourceVideos];

    if (selectedChannelId) {
      if (useRealData || !isMockChannel(selectedChannelId)) {
        videos = videos.filter((v) => v.channel_id === selectedChannelId);
      }
    }

    if (useRealData) {
      const activeIds = new Set(channels.filter((c) => c.is_active).map((c) => c.channel_id));
      videos = videos.filter((v) => activeIds.has(v.channel_id));
    }

    if (activeTab === 'portfolio') videos = videos.filter((v) => v.analysis?.affects_portfolio.length);
    else if (activeTab === 'bullish') videos = videos.filter((v) => v.analysis?.bullish_on.length);
    else if (activeTab === 'bearish') videos = videos.filter((v) => v.analysis?.bearish_on.length);

    const now = Date.now();
    if (timeFilter === '7d') videos = videos.filter((v) => now - new Date(v.published_at).getTime() < 7 * 86400000);
    else if (timeFilter === '30d') videos = videos.filter((v) => now - new Date(v.published_at).getTime() < 30 * 86400000);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      videos = videos.filter((v) =>
        v.title.toLowerCase().includes(q) ||
        v.channel_name.toLowerCase().includes(q) ||
        v.analysis?.mentioned_tickers.some((t) => t.toLowerCase().includes(q))
      );
    }

    return videos;
  }, [sourceVideos, channels, selectedChannelId, activeTab, timeFilter, searchQuery, useRealData]);

  const groupedVideos = useMemo(() => groupByWeek(filteredVideos), [filteredVideos]);

  const portfolioHitCount = sourceVideos.filter((v) => v.analysis?.affects_portfolio.length).length;
  const activeChannelCount = channels.filter((c) => c.is_active).length;

  const tabs: { id: FilterTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'all', label: 'All Videos', icon: <LayoutGrid className="h-3.5 w-3.5" />, count: sourceVideos.length },
    { id: 'portfolio', label: 'Affects Portfolio', icon: <Briefcase className="h-3.5 w-3.5" />, count: portfolioHitCount },
    { id: 'bullish', label: 'Bullish', icon: <span className="text-success font-bold text-xs">↑</span> },
    { id: 'bearish', label: 'Bearish', icon: <span className="text-danger font-bold text-xs">↓</span> },
  ];

  const toastIcon = {
    success: <CheckCircle2 className="h-4 w-4 text-success shrink-0" />,
    error: <XCircle className="h-4 w-4 text-danger shrink-0" />,
    info: <Info className="h-4 w-4 text-primary shrink-0" />,
  };

  const toastStyles = {
    success: 'bg-success/10 border-success/20',
    error: 'bg-danger/10 border-danger/20',
    info: 'bg-primary/10 border-primary/20',
  };

  return (
    <div className="flex flex-col h-full gap-0">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight">YouTube Intelligence</h1>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
              useRealData
                ? 'bg-success/10 text-success border-success/20'
                : 'bg-muted/60 text-muted-foreground border-border/40'
            }`}>
              {useRealData ? 'Live Data' : 'Demo Mode'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {useRealData
              ? `${lastScanStats?.found ?? 0} videos fetched · ${lastScanStats?.duration ?? 0}s`
              : 'Add channels to fetch their videos automatically'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground border border-border/50 rounded-lg px-2.5 py-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{activeChannelCount} active channel{activeChannelCount !== 1 ? 's' : ''}</span>
          </div>
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary/15 cursor-pointer"
          >
            {isScanning
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching…</>
              : <><RefreshCw className="h-4 w-4" /> Fetch Videos</>
            }
          </button>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            className={`mb-4 flex items-start gap-2.5 px-4 py-3 border rounded-xl text-sm ${toastStyles[toast.type]}`}
          >
            {toastIcon[toast.type]}
            <div>
              <p className="font-semibold text-foreground">{toast.message}</p>
              {toast.detail && <p className="text-xs text-muted-foreground mt-0.5">{toast.detail}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {missingKeys.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 bg-warning/10 border border-warning/20 rounded-xl"
        >
          <div className="flex items-start gap-2.5 flex-1">
            <AlertCircle className="h-4.5 w-4.5 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">AI Intelligence is running in local Demo/Keyword mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active provider <span className="font-mono text-warning font-bold">{missingKeys.join(', ')}</span> has no API key configured. You can get deep multilingual insights (English/Hindi/Telugu translation) by setting up a free key.
              </p>
            </div>
          </div>
          <a
            href="/settings"
            className="px-3.5 py-1.5 bg-warning/20 hover:bg-warning/30 text-warning hover:text-warning/80 font-bold rounded-lg text-xs transition-all whitespace-nowrap self-stretch sm:self-auto flex items-center justify-center"
          >
            Configure Key
          </a>
        </motion.div>
      )}

      <div className="flex gap-5 flex-1 min-h-0">
        <div className="hidden lg:flex flex-col w-72 shrink-0">
          <div className="glass-card rounded-2xl p-4 h-full">
            <ChannelPanel
              channels={channels}
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
              onToggleChannel={handleToggleChannel}
              onRemoveChannel={handleRemoveChannel}
              onAddChannel={handleAddChannel}
              isResolving={isResolvingChannel}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 gap-4">
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedChannelId(null)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !selectedChannelId ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted/40 text-muted-foreground border border-border/40'
              }`}
            >All</button>
            {channels.filter((c) => c.is_active).map((c) => (
              <button key={c.channel_id}
                onClick={() => setSelectedChannelId(selectedChannelId === c.channel_id ? null : c.channel_id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedChannelId === c.channel_id ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted/40 text-muted-foreground border border-border/40'
                }`}
              >
                <div className={`h-4 w-4 rounded bg-gradient-to-br ${c.avatar_color} flex items-center justify-center text-white text-[9px] font-bold`}>
                  {c.channel_name[0]}
                </div>
                {c.channel_name.split(' ')[0]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-muted/30 border border-border/40 rounded-xl p-1">
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-muted/30 border border-border/40 rounded-xl p-1">
              {(['7d', '30d', 'all'] as TimeFilter[]).map((t) => (
                <button key={t} onClick={() => setTimeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    timeFilter === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'all' ? 'All time' : `Last ${t}`}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[140px] max-w-xs ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ticker, channel, keyword…"
                className="w-full pl-8 pr-3 py-2 bg-background/60 border border-border/60 focus:border-primary rounded-xl text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          {(searchQuery || activeTab !== 'all' || selectedChannelId) && (
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filteredVideos.length}</span> video{filteredVideos.length !== 1 ? 's' : ''}
              {searchQuery && <span> matching <span className="text-primary">"{searchQuery}"</span></span>}
            </p>
          )}

          <div className="flex-1 overflow-y-auto space-y-8 pr-0.5 pb-4">
            {channels.length === 0 ? (
              <YouTubeEmptyState onAdd={() => {}} />
            ) : groupedVideos.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <SlidersHorizontal className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <h3 className="text-base font-semibold text-foreground mb-1">No videos match</h3>
                <p className="text-sm text-muted-foreground">Try adjusting filters or running a fetch</p>
                <button onClick={() => { setSearchQuery(''); setActiveTab('all'); setTimeFilter('30d'); }}
                  className="mt-4 text-xs text-primary hover:underline cursor-pointer"
                >Reset filters</button>
              </motion.div>
            ) : (
              groupedVideos.map((group) => (
                <div key={group.label} className="space-y-4">
                  <h3 className="text-sm font-bold text-foreground/80 sticky top-0 bg-background/90 backdrop-blur py-2 z-10">
                    {group.label}
                  </h3>
                  <div className="space-y-4">
                    {group.videos.map((video, i) => (
                      <VideoInsightCard 
                        key={video.video_id} 
                        video={video} 
                        index={i} 
                        onAnalyze={() => handleAnalyze(video.video_id, video.channel_name, video.title)}
                        onOpenModal={() => setActiveModalVideoId(video.video_id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      <VideoAnalysisModal 
        isOpen={!!activeModalVideoId}
        onClose={() => setActiveModalVideoId(null)}
        video={realVideos.find(v => v.video_id === activeModalVideoId) || sourceVideos.find(v => v.video_id === activeModalVideoId) || null}
        onAnalyze={() => {
          const v = realVideos.find(v => v.video_id === activeModalVideoId) || sourceVideos.find(v => v.video_id === activeModalVideoId);
          if (v) handleAnalyze(v.video_id, v.channel_name, v.title);
        }}
      />
    </div>
  );
}
