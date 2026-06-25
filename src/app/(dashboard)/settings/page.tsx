'use client';

import React from 'react';
import { useSettings, type AIProvider } from '@/hooks/use-settings';
import { motion } from 'framer-motion';
import { Key, Bot, Settings as SettingsIcon, CheckCircle2, ChevronRight } from 'lucide-react';

const PROVIDERS: { id: AIProvider; name: string; description: string }[] = [
  { id: 'gemini', name: 'Google Gemini', description: 'Gemini 1.5 Flash (Recommended - fast and cheap)' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4o or GPT-4o-mini' },
  { id: 'claude', name: 'Anthropic Claude', description: 'Claude 3.5 Sonnet' },
  { id: 'openrouter', name: 'OpenRouter', description: 'Access any open source or commercial model' },
  { id: 'nvidia', name: 'NVIDIA NIM', description: 'High-performance inference' },
  { id: 'huggingface', name: 'HuggingFace', description: 'Open-source models via serverless endpoints' },
];

export default function SettingsPage() {
  const { settings, isLoaded, updateSettings, updateKey } = useSettings();

  if (!isLoaded) {
    return <div className="p-8 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Application Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your API keys and configure how intelligence is processed. Keys are securely stored only in your local browser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-4 space-y-2">
          <div className="sticky top-6">
            <h3 className="font-semibold text-sm mb-3 px-1 text-muted-foreground uppercase tracking-wider">Configuration</h3>
            <div className="space-y-1">
              <div className="bg-primary/10 text-primary font-medium px-4 py-2.5 rounded-xl flex items-center justify-between cursor-default">
                <span className="flex items-center gap-2.5">
                  <Bot className="h-4 w-4" /> AI Models & APIs
                </span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-8 space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-border/50">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Bot className="h-5 w-5 text-primary" />
              Active AI Provider
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select which AI model you want to use for generating insights and analyzing YouTube transcripts.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => updateSettings({ preferredProvider: p.id })}
                  className={`flex flex-col text-left px-4 py-3 rounded-xl border transition-all ${
                    settings.preferredProvider === p.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border/60 hover:border-primary/40 bg-background/50 hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-sm text-foreground">{p.name}</span>
                    {settings.preferredProvider === p.id && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{p.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-border/50">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Key className="h-5 w-5 text-primary" />
              API Keys
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your API keys below. They are saved entirely locally in your browser's LocalStorage and are never sent to our servers.
            </p>

            <div className="space-y-5">
              {PROVIDERS.map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <label className="text-sm font-semibold flex items-center justify-between">
                    <span>{p.name} API Key</span>
                    {settings.keys[p.id] && <span className="text-[10px] text-success font-bold uppercase">Configured</span>}
                  </label>
                  <input
                    type="password"
                    value={settings.keys[p.id]}
                    onChange={(e) => updateKey(p.id, e.target.value)}
                    placeholder={`sk-...`}
                    className="w-full px-4 py-2.5 bg-background/60 border border-border/60 focus:border-primary rounded-xl text-sm outline-none transition-all placeholder:text-muted-foreground/40 font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
