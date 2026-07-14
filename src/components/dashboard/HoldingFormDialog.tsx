'use client';

import React, { useEffect, useState, useTransition } from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Instrument } from '@/lib/types';
import {
  addHolding,
  editHolding,
  sellHolding,
  recordSplit,
  recordBonus,
  searchInstrumentsAction,
} from '@/server-actions/portfolio';

export type HoldingDialogMode = 'add' | 'edit' | 'sell' | 'split' | 'bonus';

interface HoldingFormDialogProps {
  mode: HoldingDialogMode;
  trigger: React.ReactNode;
  /** Required for edit/sell/split/bonus — the target position. */
  instrumentId?: string;
  /** Display label (e.g. "TCS · NSE") shown when the instrument is already known. */
  instrumentLabel?: string;
}

const MODE_COPY: Record<HoldingDialogMode, { title: string; description: string }> = {
  add: { title: 'Add Holding', description: 'Search the instrument master and record a BUY.' },
  edit: {
    title: 'Edit Holding',
    description:
      'Phase 2 MVP: resets this position to the corrected quantity/price (replaces all prior lots for this instrument).',
  },
  sell: { title: 'Sell Holding', description: 'Record a partial or full SELL transaction.' },
  split: { title: 'Record Split', description: 'Add the bonus quantity from a stock split (no cash flow).' },
  bonus: { title: 'Record Bonus Shares', description: 'Add bonus shares issued for this holding (no cash flow).' },
};

export function HoldingFormDialog({ mode, trigger, instrumentId, instrumentLabel }: HoldingFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Instrument search only applies to `add` — edit/sell/split/bonus are
  // always opened from a known row (HoldingsTable passes instrumentId), so
  // the instrument is already fixed and shown via `instrumentLabel` instead
  // of a re-searchable field.
  const needsSearch = mode === 'add';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!needsSearch || !open || selected) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(async () => {
      try {
        const r = await searchInstrumentsAction(query);
        if (!cancelled) setResults(r);
      } catch (err) {
        if (!cancelled) setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, needsSearch, open, selected]);

  const resolvedInstrumentId = mode === 'add' ? selected?.id : instrumentId;
  const copy = MODE_COPY[mode];
  const needsPrice = mode === 'add' || mode === 'edit' || mode === 'sell';
  const quantityLabel = mode === 'split' || mode === 'bonus' ? 'Additional Quantity' : 'Quantity';

  const resetForm = () => {
    setQuantity('');
    setPrice('');
    setSelected(null);
    setQuery('');
    setResults([]);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resolvedInstrumentId) {
      setError('Select an instrument first');
      return;
    }

    const qty = parseFloat(quantity);
    const p = parseFloat(price);

    startTransition(async () => {
      try {
        let result;
        if (mode === 'add') {
          result = await addHolding({ instrumentId: resolvedInstrumentId, quantity: qty, price: p, date });
        } else if (mode === 'edit') {
          result = await editHolding({ instrumentId: resolvedInstrumentId, quantity: qty, price: p, date });
        } else if (mode === 'sell') {
          result = await sellHolding({ instrumentId: resolvedInstrumentId, quantity: qty, price: p, date });
        } else if (mode === 'split') {
          result = await recordSplit({ instrumentId: resolvedInstrumentId, additionalQuantity: qty, date });
        } else {
          result = await recordBonus({ instrumentId: resolvedInstrumentId, additionalQuantity: qty, date });
        }

        if (result.success) {
          setOpen(false);
          resetForm();
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {instrumentLabel ? `${instrumentLabel} — ${copy.description}` : copy.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsSearch && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Instrument</label>
              {selected ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm">
                  <span>
                    {selected.symbol} · {selected.exchange} — {selected.displayName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-xs text-primary cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search symbol or company name..."
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
                  />
                  {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                  {searchError && <p className="text-xs text-danger">{searchError}</p>}
                  {results.length > 0 && (
                    <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
                      {results.map((inst) => (
                        <button
                          type="button"
                          key={inst.id}
                          onClick={() => {
                            setSelected(inst);
                            setResults([]);
                            setQuery('');
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer"
                        >
                          <span className="font-semibold">{inst.symbol}</span>{' '}
                          <span className="text-muted-foreground">
                            {inst.exchange} · {inst.displayName}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">{quantityLabel}</label>
            <input
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
              required
            />
          </div>

          {needsPrice && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Price</label>
              <input
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
              required
            />
          </div>

          {error && <p className="text-danger text-xs">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <button type="button" className="px-4 py-2 text-sm rounded-lg border border-border cursor-pointer">
                Cancel
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-semibold cursor-pointer disabled:opacity-60"
            >
              {isPending ? 'Saving…' : copy.title}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
