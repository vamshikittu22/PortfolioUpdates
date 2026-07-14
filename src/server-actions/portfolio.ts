'use server';

// Server Actions for every portfolio mutation the roadmap requires
// (PORT-01/02/03/05/06). Each action:
//   1. Gets the cookie-bound server Supabase client (`@/utils/supabase/server`)
//      — NEVER the admin client (`@/utils/supabase/admin`), which bypasses RLS
//      and must never touch user-facing writes (see that file's warning comment).
//   2. Calls `supabase.auth.getUser()` and throws `Unauthorized` if null
//      (defense-in-depth alongside RLS, matching `src/app/api/settings/keys/route.ts`).
//   3. Resolves `accountId` via `getAccountId`.
//   4. Performs the mutation through the SAME cookie-bound client so RLS applies.
//   5. Calls `revalidatePath` for every page that renders this data before
//      returning `{ success: true }` (or `{ success: false, error }` for
//      expected/recoverable failures).

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getAccountId, searchInstruments } from '@/lib/supabase/portfolio';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Instrument } from '@/lib/types';

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

function assertValidBuySell(quantity: number, price: number) {
  if (!(quantity > 0)) throw new Error('Quantity must be greater than zero');
  if (!(price >= 0)) throw new Error('Price must be zero or greater');
}

function assertValidQuantity(quantity: number) {
  if (!(quantity > 0)) throw new Error('Quantity must be greater than zero');
}

export interface AddHoldingInput {
  instrumentId: string;
  quantity: number;
  price: number;
  date: string;
  notes?: string;
}

/** addHolding — inserts one BUY transaction (PORT-01). */
export async function addHolding(input: AddHoldingInput): Promise<ActionResult> {
  assertValidBuySell(input.quantity, input.price);
  const { supabase, accountId } = await requireAuthedContext();

  const { error } = await supabase.from('transactions').insert({
    account_id: accountId,
    instrument_id: input.instrumentId,
    transaction_type: 'BUY',
    quantity: input.quantity,
    price: input.price,
    transaction_date: input.date,
    notes: input.notes ?? null,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}

export interface SellHoldingInput {
  instrumentId: string;
  quantity: number;
  price: number;
  date: string;
  notes?: string;
}

/**
 * sellHolding — the PARTIAL-SELL path the roadmap calls out (PORT-02):
 * inserts one SELL transaction. Distinct from `deleteHolding`, which closes
 * the position entirely rather than recording a market exit.
 */
export async function sellHolding(input: SellHoldingInput): Promise<ActionResult> {
  assertValidBuySell(input.quantity, input.price);
  const { supabase, accountId } = await requireAuthedContext();

  const { error } = await supabase.from('transactions').insert({
    account_id: accountId,
    instrument_id: input.instrumentId,
    transaction_type: 'SELL',
    quantity: input.quantity,
    price: input.price,
    transaction_date: input.date,
    notes: input.notes ?? null,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}

export interface EditHoldingInput {
  instrumentId: string;
  quantity: number;
  price: number;
  date: string;
}

/**
 * editHolding — Phase 2 MVP simplification (intentional, documented here, not
 * an oversight): deletes ALL existing transactions for (accountId,
 * instrumentId) and inserts a single corrected BUY row, resetting the
 * position rather than editing one specific historical lot. Full multi-lot
 * editing is out of scope for this phase. Sequential delete-then-insert
 * (rather than a DB transaction) is acceptable here because RLS scopes both
 * statements to the same account.
 */
export async function editHolding(input: EditHoldingInput): Promise<ActionResult> {
  assertValidBuySell(input.quantity, input.price);
  const { supabase, accountId } = await requireAuthedContext();

  const { error: deleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('account_id', accountId)
    .eq('instrument_id', input.instrumentId);
  if (deleteError) return { success: false, error: deleteError.message };

  const { error: insertError } = await supabase.from('transactions').insert({
    account_id: accountId,
    instrument_id: input.instrumentId,
    transaction_type: 'BUY',
    quantity: input.quantity,
    price: input.price,
    transaction_date: input.date,
  });
  if (insertError) return { success: false, error: insertError.message };

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}

export interface DeleteHoldingInput {
  instrumentId: string;
}

/**
 * deleteHolding — closes the position entirely (a correction/removal, NOT a
 * recorded market exit): deletes ALL transactions for (accountId,
 * instrumentId). This does not go through `deriveHoldings` history and is
 * distinct from `sellHolding`.
 */
export async function deleteHolding(input: DeleteHoldingInput): Promise<ActionResult> {
  const { supabase, accountId } = await requireAuthedContext();

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('account_id', accountId)
    .eq('instrument_id', input.instrumentId);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}

export interface RecordSplitInput {
  instrumentId: string;
  additionalQuantity: number;
  date: string;
  notes?: string;
}

/** recordSplit — inserts one SPLIT transaction, price: null (no cash flow). */
export async function recordSplit(input: RecordSplitInput): Promise<ActionResult> {
  assertValidQuantity(input.additionalQuantity);
  const { supabase, accountId } = await requireAuthedContext();

  const { error } = await supabase.from('transactions').insert({
    account_id: accountId,
    instrument_id: input.instrumentId,
    transaction_type: 'SPLIT',
    quantity: input.additionalQuantity,
    price: null,
    transaction_date: input.date,
    notes: input.notes ?? null,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}

export interface RecordBonusInput {
  instrumentId: string;
  additionalQuantity: number;
  date: string;
  notes?: string;
}

/** recordBonus — inserts one BONUS transaction, price: null (no cash flow). */
export async function recordBonus(input: RecordBonusInput): Promise<ActionResult> {
  assertValidQuantity(input.additionalQuantity);
  const { supabase, accountId } = await requireAuthedContext();

  const { error } = await supabase.from('transactions').insert({
    account_id: accountId,
    instrument_id: input.instrumentId,
    transaction_type: 'BONUS',
    quantity: input.additionalQuantity,
    price: null,
    transaction_date: input.date,
    notes: input.notes ?? null,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}

export interface AddToWatchlistInput {
  instrumentId: string;
}

/**
 * addToWatchlist — inserts into watchlist_items. Catches the
 * (account_id, instrument_id) unique-constraint violation (Postgres code
 * 23505 — already watching) and returns a friendly `{ success: false }`
 * instead of throwing/propagating a raw Postgres error.
 */
export async function addToWatchlist(input: AddToWatchlistInput): Promise<ActionResult> {
  const { supabase, accountId } = await requireAuthedContext();

  const { error } = await supabase.from('watchlist_items').insert({
    account_id: accountId,
    instrument_id: input.instrumentId,
  });
  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Already on watchlist' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}

/**
 * searchInstrumentsAction — thin Server Action wrapper around
 * `searchInstruments` (PORT-06 enforcement point: dialogs must search the
 * real ISIN+exchange master, never accept a free-text ticker). Exposed here
 * rather than a new API route to stay consistent with this phase's chosen
 * pattern of calling Server Actions directly from Client Components. This
 * is a small addition to this file beyond its original (02-04) task list,
 * per plan 02-05's instruction. Read-only — no accountId resolution needed,
 * only an authenticated session (matches `instruments`' RLS: any
 * authenticated user may SELECT the shared reference table).
 */
export async function searchInstrumentsAction(query: string): Promise<Instrument[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return searchInstruments(supabase, query);
}

export interface RemoveFromWatchlistInput {
  watchlistItemId: string;
}

/**
 * removeFromWatchlist — deletes by id. RLS already scopes deletes to the
 * caller's account, so no extra WHERE clause is needed beyond the id.
 */
export async function removeFromWatchlist(input: RemoveFromWatchlistInput): Promise<ActionResult> {
  const { supabase } = await requireAuthedContext();

  const { error } = await supabase.from('watchlist_items').delete().eq('id', input.watchlistItemId);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/holdings');
  revalidatePath('/news');
  return { success: true };
}
