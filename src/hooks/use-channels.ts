'use client';

import { useState, useEffect, useCallback } from 'react';
import type { YTChannel } from '@/lib/mock-youtube-data';
import { MOCK_CHANNELS } from '@/lib/mock-youtube-data';
import { createClient } from '@/utils/supabase/client';

const STORAGE_PREFIX = 'folio_intel_channels';

/**
 * Resolve the current user's email from the real Supabase session.
 * Used to namespace localStorage keys per account. Falls back to 'default'
 * when there is no authenticated user (the proxy would normally have
 * redirected first).
 */
async function getUserKey(): Promise<string> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      // Sanitize email to a safe localStorage key segment
      return user.email.replace(/[^a-zA-Z0-9@._-]/g, '_');
    }
  } catch {
    // Ignore auth read errors
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

  const [userKey, setUserKey] = useState<string | null>(null);

  // Resolve the per-user storage namespace, then load channels from localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolvedUserKey = await getUserKey();
      if (cancelled) return;
      setUserKey(resolvedUserKey);
      try {
        const key = storageKey(resolvedUserKey);
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist channels to localStorage whenever they change (after initial load)
  const persistChannels = useCallback(
    (updated: YTChannel[]) => {
      if (userKey === null) return;
      try {
        const key = storageKey(userKey);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save channels to localStorage', e);
      }
    },
    [userKey]
  );

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
