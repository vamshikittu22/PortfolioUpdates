'use client';

import { useState, useEffect, useCallback } from 'react';
import type { YTChannel } from '@/lib/mock-youtube-data';
import { MOCK_CHANNELS } from '@/lib/mock-youtube-data';

const STORAGE_PREFIX = 'folio_intel_channels';

/**
 * Get the current user's email from the session cookie.
 * Used to namespace localStorage keys per account.
 */
function getUserKey(): string {
  try {
    const match = document.cookie.match(
      new RegExp('(^| )foliointel-session=([^;]+)')
    );
    if (match) {
      const email = decodeURIComponent(match[2]);
      // Sanitize email to a safe localStorage key segment
      return email.replace(/[^a-zA-Z0-9@._-]/g, '_');
    }
  } catch {
    // Ignore cookie read errors
  }
  return 'default';
}

function storageKey(userKey: string): string {
  return `${STORAGE_PREFIX}_${userKey}`;
}

/**
 * Hook that persists YouTube channels to localStorage, scoped per user account.
 * On first load with no saved data, initializes from MOCK_CHANNELS.
 */
export function useChannels() {
  const [channels, setChannelsState] = useState<YTChannel[]>(MOCK_CHANNELS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load channels from localStorage on mount
  useEffect(() => {
    try {
      const key = storageKey(getUserKey());
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as YTChannel[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChannelsState(parsed);
        }
        // If stored but empty array, keep mock channels as starting point
      }
    } catch (e) {
      console.error('Failed to load channels from localStorage', e);
    }
    setIsLoaded(true);
  }, []);

  // Persist channels to localStorage whenever they change (after initial load)
  const persistChannels = useCallback((updated: YTChannel[]) => {
    try {
      const key = storageKey(getUserKey());
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save channels to localStorage', e);
    }
  }, []);

  const setChannels: typeof setChannelsState = useCallback(
    (action) => {
      setChannelsState((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        persistChannels(next);
        return next;
      });
    },
    [persistChannels]
  );

  return { channels, setChannels, isLoaded };
}
