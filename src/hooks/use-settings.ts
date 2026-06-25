'use client';

import { useState, useEffect } from 'react';

export type AIProvider = 'gemini' | 'openai' | 'claude' | 'openrouter' | 'nvidia' | 'huggingface';

export interface AppSettings {
  preferredProvider: AIProvider;
  keys: {
    gemini: string;
    openai: string;
    claude: string;
    openrouter: string;
    nvidia: string;
    huggingface: string;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  preferredProvider: 'gemini',
  keys: {
    gemini: '',
    openai: '',
    claude: '',
    openrouter: '',
    nvidia: '',
    huggingface: '',
  },
};

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('folio_intel_settings');
      if (stored) {
        setSettingsState(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load settings from local storage', e);
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('folio_intel_settings', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save settings', e);
      }
      return updated;
    });
  };

  const updateKey = async (provider: AIProvider, key: string) => {
    // 1. Update local state and localStorage
    setSettingsState((prev) => {
      const updated = {
        ...prev,
        keys: { ...prev.keys, [provider]: key },
      };
      localStorage.setItem('folio_intel_settings', JSON.stringify(updated));
      return updated;
    });

    // 2. Persist to .env.local on the server so it's globally available in the folder
    try {
      await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      });
    } catch (e) {
      console.error('Failed to sync key to server', e);
    }
  };

  return {
    settings,
    isLoaded,
    updateSettings,
    updateKey,
  };
}
