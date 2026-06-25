'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { PlusCircle } from 'lucide-react';

export function YouTubeEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center text-center py-24 px-6"
    >
      {/* Icon */}
      <div className="relative mb-6">
        <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/10 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-10 w-10 text-red-400"
          >
            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
            <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
          </svg>
        </div>
        <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <PlusCircle className="h-4 w-4 text-primary" />
        </div>
      </div>

      <h3 className="text-xl font-bold text-foreground mb-2">No Channels Tracked Yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-6">
        Add YouTube channels from the panel on the left. FolioIntel will scan their latest videos,
        extract key insights, and surface anything that mentions your portfolio holdings.
      </p>

      <div className="flex flex-col gap-3 text-xs text-muted-foreground max-w-xs">
        {[
          { icon: '📺', text: 'Track any financial YouTube channel' },
          { icon: '🤖', text: 'AI extracts bullish & bearish mentions' },
          { icon: '💼', text: 'Cross-referenced with your holdings' },
          { icon: '🔔', text: 'Alerts when your stocks are discussed' },
        ].map(({ icon, text }) => (
          <div key={text} className="flex items-center gap-2.5 p-2.5 glass-card rounded-xl border border-border/30">
            <span className="text-base">{icon}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        className="mt-8 flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all shadow-lg shadow-primary/20 cursor-pointer"
      >
        <PlusCircle className="h-4 w-4" />
        Add Your First Channel
      </button>
    </motion.div>
  );
}
