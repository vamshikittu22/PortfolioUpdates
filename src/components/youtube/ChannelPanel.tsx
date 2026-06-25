'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Wifi, WifiOff, Users, Video, X, Link as LinkIcon, Loader2 } from 'lucide-react';
import type { YTChannel } from '@/lib/mock-youtube-data';

interface ChannelPanelProps {
  channels: YTChannel[];
  selectedChannelId: string | null;
  onSelectChannel: (id: string | null) => void;
  onToggleChannel: (id: string) => void;
  onRemoveChannel: (id: string) => void;
  onAddChannel: (url: string) => void;
  isResolving?: boolean;
}

export function ChannelPanel({
  channels,
  selectedChannelId,
  onSelectChannel,
  onToggleChannel,
  onRemoveChannel,
  onAddChannel,
  isResolving = false,
}: ChannelPanelProps) {
  const [addingChannel, setAddingChannel] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [inputError, setInputError] = useState('');

  const handleAdd = () => {
    if (!channelInput.trim()) {
      setInputError('Please enter a channel URL or ID');
      return;
    }
    onAddChannel(channelInput.trim());
    setChannelInput('');
    // Keep panel open while resolving — parent will close via toast
    setInputError('');
  };

  const activeCount = channels.filter((c) => c.is_active).length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-foreground">Tracked Channels</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {activeCount} active · {channels.length} total
          </p>
        </div>
        <button
          onClick={() => setAddingChannel(!addingChannel)}
          className="h-8 w-8 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors cursor-pointer"
          title="Add Channel"
        >
          {addingChannel ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {/* Add Channel Form */}
      <AnimatePresence>
        {addingChannel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-xl p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LinkIcon className="h-3 w-3" />
                <span>YouTube URL or Channel ID</span>
              </div>
              <input
                type="text"
                value={channelInput}
                onChange={(e) => { setChannelInput(e.target.value); setInputError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="@channelname or UCxxxxxxx"
                autoFocus
                className="w-full px-3 py-2 bg-background/60 border border-border focus:border-primary rounded-lg text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground/50"
              />
              {inputError && (
                <p className="text-[10px] text-danger">{inputError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={isResolving}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-primary text-primary-foreground disabled:bg-primary/50 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  {isResolving ? <><Loader2 className="h-3 w-3 animate-spin" /> Resolving…</> : 'Add Channel'}
                </button>
                <button
                  onClick={() => { setAddingChannel(false); setChannelInput(''); setInputError(''); }}
                  className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        <AnimatePresence>
          {channels.map((channel, index) => (
            <motion.div
              key={channel.channel_id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ delay: index * 0.05 }}
            >
              <div
                onClick={() => onSelectChannel(
                  selectedChannelId === channel.channel_id ? null : channel.channel_id
                )}
                className={`group relative flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedChannelId === channel.channel_id
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-card/50 border-border/40 hover:bg-muted/30 hover:border-border'
                } ${!channel.is_active ? 'opacity-50' : ''}`}
              >
                {/* Channel Avatar */}
                <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${channel.avatar_color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                  {channel.channel_name[0]}
                </div>

                {/* Channel Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {channel.channel_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" />
                      {channel.subscriber_count}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Video className="h-2.5 w-2.5" />
                      {channel.video_count} videos
                    </span>
                  </div>
                </div>

                {/* Active Toggle + Remove */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleChannel(channel.channel_id); }}
                    className={`p-1 rounded-md transition-colors cursor-pointer ${
                      channel.is_active
                        ? 'text-primary hover:bg-primary/10'
                        : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                    title={channel.is_active ? 'Pause scanning' : 'Resume scanning'}
                  >
                    {channel.is_active
                      ? <Wifi className="h-3.5 w-3.5" />
                      : <WifiOff className="h-3.5 w-3.5" />
                    }
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveChannel(channel.channel_id); }}
                    className="p-1 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                    title="Remove channel"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Active Indicator Dot */}
                <div className={`absolute top-3 right-3 h-1.5 w-1.5 rounded-full ${
                  channel.is_active ? 'bg-primary' : 'bg-muted-foreground/40'
                } ${selectedChannelId === channel.channel_id || true ? 'opacity-100' : 'group-hover:opacity-0 opacity-100'}`} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer: Scan Status */}
      <div className="pt-3 border-t border-border/30">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span>Last scan: 2 hours ago · Next: 6h</span>
        </div>
      </div>
    </div>
  );
}
