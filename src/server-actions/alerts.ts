'use server';

// Server Actions for the price-alert CRUD surface (ALRT-02). Each mutation:
//   1. Gets the cookie-bound server Supabase client (`@/utils/supabase/server`)
//      — NEVER the admin client (`@/utils/supabase/admin`), which bypasses RLS
//      and must never touch user-facing writes (see that file's warning
//      comment, and `src/server-actions/portfolio.ts`'s identical rule).
//   2. Calls `supabase.auth.getUser()` and throws `Unauthorized` if null
//      (defense-in-depth alongside RLS).
//   3. Resolves `accountId` via `getAccountId`.
//   4. Performs the mutation through the SAME cookie-bound client so RLS
//      (public.price_alerts' account-ownership policies) authorizes the write.
//   5. Calls `revalidatePath('/alerts')` before returning `{ success: true }`
//      (or a friendly `{ success: false, error }` for expected/recoverable
//      failures — including the duplicate (account,instrument,direction)
//      unique-constraint violation, Postgres code 23505).
//
// Ticker selection reuses `searchInstrumentsAction` from `./portfolio` — the
// SAME real ISIN+exchange master search the holdings dialog uses (PORT-06's
// "search the real master, never free-text" rule extended to alerts).
//
// `last_triggered_at` is never written here — that column is the evaluator's
// (05-05), written only by the service role's sweep.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getAccountId } from '@/lib/supabase/portfolio';
import { searchInstrumentsAction as searchInstrumentsFromPortfolio } from './portfolio';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Instrument } from '@/lib/types';

// A bare `export { searchInstrumentsAction } from './portfolio'` re-export
// silently breaks Next's "use server" module analysis — the whole file's
// client-bundle exports resolve to nothing (confirmed live via `npm run
// build`: "The module has no exports at all", first surfaced once
// AlertFormDialog/AlertsTable actually imported from this file). A real
// async function defined directly in this file, delegating to the existing
// implementation, satisfies the "every export is a Server Function"
// requirement instead.
export async function searchInstrumentsAction(query: string): Promise<Instrument[]> {
  return searchInstrumentsFromPortfolio(query);
}

type ActionResult = { success: true } | { success: false; error: string };

async function requireAuthedContext(): Promise<{ supabase: SupabaseClient; accountId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const accountId = await getAccountId(supabase, user.id);
  return { supabase, accountId };
}

type AlertDirection = 'above' | 'below';

function assertValidThreshold(threshold: number) {
  if (!(threshold > 0)) throw new Error('Threshold must be greater than zero');
}

function assertValidCooldown(cooldownMinutes: number | undefined) {
  if (cooldownMinutes !== undefined && !(cooldownMinutes >= 60)) {
    throw new Error('Cooldown must be at least 60 minutes');
  }
}

/** Friendly mapping for the UNIQUE(account_id,instrument_id,direction) constraint (portfolio.ts:288 precedent). */
function friendlyAlertError(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'An alert for this ticker and direction already exists';
  }
  return error.message;
}

export interface CreatePriceAlertInput {
  instrumentId: string;
  direction: AlertDirection;
  threshold: number;
  cooldownMinutes?: number;
}

/** createPriceAlert — inserts one price_alerts row (ALRT-02). */
export async function createPriceAlert(input: CreatePriceAlertInput): Promise<ActionResult> {
  assertValidThreshold(input.threshold);
  assertValidCooldown(input.cooldownMinutes);
  const { supabase, accountId } = await requireAuthedContext();

  const { error } = await supabase.from('price_alerts').insert({
    account_id: accountId,
    instrument_id: input.instrumentId,
    direction: input.direction,
    threshold: input.threshold,
    cooldown_minutes: input.cooldownMinutes ?? 1440,
    is_active: true,
  });
  if (error) return { success: false, error: friendlyAlertError(error) };

  revalidatePath('/alerts');
  return { success: true };
}

export interface UpdatePriceAlertInput {
  id: string;
  threshold: number;
  cooldownMinutes: number;
  direction: AlertDirection;
}

/**
 * updatePriceAlert — corrects threshold/cooldown/direction on an existing
 * alert. RLS scopes the update to the owner; a foreign/nonexistent id simply
 * updates zero rows rather than leaking existence.
 */
export async function updatePriceAlert(input: UpdatePriceAlertInput): Promise<ActionResult> {
  assertValidThreshold(input.threshold);
  assertValidCooldown(input.cooldownMinutes);
  const { supabase } = await requireAuthedContext();

  const { error } = await supabase
    .from('price_alerts')
    .update({
      threshold: input.threshold,
      cooldown_minutes: input.cooldownMinutes,
      direction: input.direction,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  // Changing direction could collide with an existing (account,instrument,direction)
  // row — same friendly 23505 mapping as create.
  if (error) return { success: false, error: friendlyAlertError(error) };

  revalidatePath('/alerts');
  return { success: true };
}

export interface TogglePriceAlertInput {
  id: string;
  isActive: boolean;
}

/** togglePriceAlert — flips is_active without touching threshold/direction. */
export async function togglePriceAlert(input: TogglePriceAlertInput): Promise<ActionResult> {
  const { supabase } = await requireAuthedContext();

  const { error } = await supabase
    .from('price_alerts')
    .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/alerts');
  return { success: true };
}

export interface DeletePriceAlertInput {
  id: string;
}

/** deletePriceAlert — deletes by id. RLS scopes deletes to the caller's account. */
export async function deletePriceAlert(input: DeletePriceAlertInput): Promise<ActionResult> {
  const { supabase } = await requireAuthedContext();

  const { error } = await supabase.from('price_alerts').delete().eq('id', input.id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/alerts');
  return { success: true };
}
