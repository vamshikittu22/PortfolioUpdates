/**
 * ALRT-01 — read-only status lookup for the caller's own `telegram_links`
 * row. Mirrors the read-only, cookie-bound, never-fabricate style of
 * `src/lib/prices/get-portfolio-pnl.ts` / `src/lib/alerts/read.ts`: accepts
 * an already-constructed cookie-bound `SupabaseClient` (RLS-scoped) — NEVER
 * the admin client. The RSC/Server Actions use this to render an honest
 * linked/pending/unlinked state, never a guessed one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type TelegramLinkStatus = 'pending' | 'linked' | 'revoked' | 'none';

export interface TelegramLinkView {
  status: TelegramLinkStatus;
  linkedAt: string | null;
}

/**
 * getTelegramLink — the caller's own link status, or `'none'` when no row
 * exists yet (never generated a link, or unlinked).
 */
export async function getTelegramLink(
  supabase: SupabaseClient,
  userId: string
): Promise<TelegramLinkView> {
  const { data, error } = await supabase
    .from('telegram_links')
    .select('status, linked_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load telegram link: ${error.message}`);
  }

  if (!data) {
    return { status: 'none', linkedAt: null };
  }

  return {
    status: data.status as TelegramLinkStatus,
    linkedAt: (data.linked_at as string | null) ?? null,
  };
}
