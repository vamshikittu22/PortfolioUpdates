'use client';

import React from 'react';
import { TrendingUp, Award, Layers, ShieldAlert, Sparkles } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Welcome Hero Banner */}
      <div className="glass-card rounded-2xl p-6 md:p-8 relative overflow-hidden glass-card-glow">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/5 blur-[80px] pointer-events-none" />
        <div className="relative z-10 max-w-xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-xs text-primary font-medium">
            <Sparkles className="h-3 w-3" />
            <span>Step 1 Active</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Welcome to <span className="bg-gradient-to-r from-primary to-crypto bg-clip-text text-transparent">FolioIntel</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Your read-only personal portfolio intelligence dashboard is starting to take shape. All core system configurations, styles, and routing structures have been established.
          </p>
        </div>
      </div>

      {/* Grid of Core Module Statuses */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">Supabase Database</h3>
            <p className="text-xs text-muted-foreground mt-1">
              All 8 database schemas, constraints, and Row Level Security policies have been initialized.
            </p>
          </div>
          <div className="text-[10px] uppercase font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full inline-block">
            Initialized
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="h-10 w-10 rounded-lg bg-crypto/10 flex items-center justify-center text-crypto">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">Authentication System</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Middlewares, OAuth callback pipelines, and route guards redirect unauthenticated requests to `/login`.
            </p>
          </div>
          <div className="text-[10px] uppercase font-semibold text-crypto bg-crypto/10 px-2 py-0.5 rounded-full inline-block">
            Armed
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 space-y-4">
          <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center text-warning">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">Visual Shell & Theme</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Collapsible sidebar, top navigation drawer, theme sync state, and styling constants are configured.
            </p>
          </div>
          <div className="text-[10px] uppercase font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full inline-block">
            Dark (Default)
          </div>
        </div>
      </div>

      {/* Database Schema Visualizer Quick Cards */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="font-bold text-lg mb-3">Database Tables Created</h3>
        <div className="flex flex-wrap gap-2">
          {['profiles', 'brokers', 'holdings', 'price_cache', 'news_items', 'yt_channels', 'yt_videos', 'alerts'].map((tbl) => (
            <span key={tbl} className="text-xs font-mono bg-muted/60 border border-border/80 px-2.5 py-1 rounded-lg">
              {tbl}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
