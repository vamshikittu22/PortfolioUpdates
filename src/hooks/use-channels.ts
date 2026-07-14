'use client';

import { useState, useEffect, useCallback } from 'react';
import type { YTChannel } from '@/lib/mock-youtube-data';
import { createClient } from '@/utils/supabase/client';

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-green-500 to-emerald-700',
  'from-orange-500 to-amber-600',
  'from-purple-500 to-violet-700',
  'from-slate-500 to-slate-700',
  'from-teal-500 to-cyan-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
];

/**
 * `avatar_color` is not a persisted column on `public.yt_channels` (it's a
 * UI-cosmetic value). Derive it deterministically from `channel_name` so the
 * same channel always renders with the same color, instead of persisting it.
 */
function avatarColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface DbYtChannelRow {
  channel_id: string;
  channel_name: string;
  is_active: boolean;
}

type NewChannelInput = Omit<YTChannel, 'is_active'> & { is_active?: boolean };

/**
 * Hook that persists the user's tracked YouTube channels to Supabase
 * (`public.yt_channels`), scoped by RLS to their `investment_accounts` row.
 *
 * Replaces the old per-browser cache (previously backed by the browser's
 * client-side storage API): the channel list now follows the user across
 * devices/browsers instead of living per-browser. A brand-new user with
 * zero tracked channels sees a real empty list — there is NO auto-seed
 * from demo/sample channel data on empty, per the project's "never
 * silently fall back to mock data" rule.
 *
 * `avatar_color`, `subscriber_count`, and `video_count` on `YTChannel` are
 * UI-cosmetic fields with no corresponding column in the Phase 1 schema:
 * - `avatar_color` is derived deterministically from `channel_name`.
 * - `subscriber_count` / `video_count` are captured once from the
 *   `/api/youtube/channel` resolve response at add-time and are not
 *   persisted or refetched (they'll read as blank/0 after a reload).
 * This is an intentional simplification documented here, not a bug.
 */
export function useChannels() {
  const [channels, setChannels] = useState<YTChannel[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  // Small inline account_id lookup. Intentionally NOT imported from any
  // Phase 2 portfolio data-layer file — this hook/plan (WIRE-02) is
  // independent of the instruments/transactions schema work happening in
  // parallel. Some duplication of this ~3-line lookup is expected.
  const resolveAccountId = useCallback(async (): Promise<string | null> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error: accountError } = await supabase
      .from('investment_accounts')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (accountError || !data) return null;
    return data.id as string;
  }, []);

  // Resolve the user's account_id, then fetch their tracked channels.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolvedAccountId = await resolveAccountId();
      if (cancelled) return;

      if (!resolvedAccountId) {
        setError('No investment account found for this user');
        setIsLoaded(true);
        return;
      }
      setAccountId(resolvedAccountId);

      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('yt_channels')
        .select('channel_id, channel_name, is_active')
        .eq('account_id', resolvedAccountId);

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setIsLoaded(true);
        return;
      }

      const mapped: YTChannel[] = ((data ?? []) as DbYtChannelRow[]).map((row) => ({
        channel_id: row.channel_id,
        channel_name: row.channel_name,
        handle: '',
        avatar_color: avatarColorFor(row.channel_name),
        is_active: row.is_active,
        subscriber_count: '',
        video_count: 0,
      }));

      // No demo/sample channel fallback here — zero rows means a real,
      // honest empty state, not a signal to seed demo data.
      setChannels(mapped);
      setError(null);
      setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveAccountId]);

  const addChannel = useCallback(
    async (ch: NewChannelInput) => {
      if (!accountId) {
        const msg = 'No investment account found for this user';
        setError(msg);
        throw new Error(msg);
      }

      const supabase = createClient();
      const { error: insertError } = await supabase.from('yt_channels').insert({
        channel_id: ch.channel_id,
        account_id: accountId,
        channel_name: ch.channel_name,
        is_active: ch.is_active ?? true,
      });

      if (insertError) {
        setError(insertError.message);
        throw insertError;
      }

      setError(null);
      setChannels((prev) => {
        if (prev.some((c) => c.channel_id === ch.channel_id)) return prev;
        return [
          ...prev,
          {
            channel_id: ch.channel_id,
            channel_name: ch.channel_name,
            handle: ch.handle,
            avatar_color: ch.avatar_color || avatarColorFor(ch.channel_name),
            is_active: ch.is_active ?? true,
            subscriber_count: ch.subscriber_count,
            video_count: ch.video_count,
          },
        ];
      });
    },
    [accountId]
  );

  const toggleChannel = useCallback(
    async (channelId: string) => {
      if (!accountId) {
        const msg = 'No investment account found for this user';
        setError(msg);
        throw new Error(msg);
      }

      const current = channels.find((c) => c.channel_id === channelId);
      if (!current) return;
      const nextActive = !current.is_active;

      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('yt_channels')
        .update({ is_active: nextActive })
        .eq('channel_id', channelId)
        .eq('account_id', accountId);

      if (updateError) {
        setError(updateError.message);
        throw updateError;
      }

      setError(null);
      setChannels((prev) =>
        prev.map((c) => (c.channel_id === channelId ? { ...c, is_active: nextActive } : c))
      );
    },
    [accountId, channels]
  );

  const removeChannel = useCallback(
    async (channelId: string) => {
      if (!accountId) {
        const msg = 'No investment account found for this user';
        setError(msg);
        throw new Error(msg);
      }

      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('yt_channels')
        .delete()
        .eq('channel_id', channelId)
        .eq('account_id', accountId);

      if (deleteError) {
        setError(deleteError.message);
        throw deleteError;
      }

      setError(null);
      setChannels((prev) => prev.filter((c) => c.channel_id !== channelId));
    },
    [accountId]
  );

  return { channels, isLoaded, error, addChannel, toggleChannel, removeChannel };
}
