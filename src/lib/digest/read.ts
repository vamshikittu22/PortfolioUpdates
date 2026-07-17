/**
 * DGST-02 — read-only status lookup for the caller's own `digest_preferences`
 * row. Mirrors the read-only, cookie-bound, never-fabricate style of
 * `src/lib/telegram/read.ts`: accepts an already-constructed cookie-bound
 * `SupabaseClient` (RLS-scoped) — NEVER the admin client. The `/alerts` RSC
 * uses this to render an honest enabled/disabled toggle state, never a
 * guessed one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DigestPreferenceView {
  enabled: boolean;
}

/**
 * getDigestPreference — the caller's own opt-in state, or `{ enabled: false
 * }` when no row exists yet (the honest opt-in default — no row == disabled,
 * per the digest_preferences migration's own comment). A query error is
 * NOT swallowed here (read path, matches getTelegramLink — the RSC surfaces
 * it).
 */
export async function getDigestPreference(
  supabase: SupabaseClient,
  userId: string
): Promise<DigestPreferenceView> {
  const { data, error } = await supabase
    .from('digest_preferences')
    .select('enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load digest preference: ${error.message}`);
  }

  if (!data) {
    return { enabled: false };
  }

  return { enabled: data.enabled as boolean };
}
