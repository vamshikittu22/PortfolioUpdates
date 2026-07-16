'use client';

// ALRT-02 — create/edit dialog for price alerts. Modeled directly on
// HoldingFormDialog.tsx: same Radix dialog shell, same debounced
// real-instrument-master search (PORT-06's "never a free-text ticker" rule
// extended to alerts), same isPending/error idioms. Add mode searches
// instruments via `searchInstrumentsAction` (re-exported from
// `@/server-actions/alerts`, backed by the same master `searchInstruments`
// as holdings); edit mode fixes the instrument (shown read-only) and only
// lets direction/threshold/cooldown change.

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
import type { PriceAlertView } from '@/lib/alerts/read';
import { createPriceAlert, updatePriceAlert, searchInstrumentsAction } from '@/server-actions/alerts';
import { cn } from '@/utils/cn';

export type AlertDialogMode = 'add' | 'edit';

interface AlertFormDialogProps {
  mode: AlertDialogMode;
  trigger: React.ReactNode;
  /** Required for edit — the alert being modified. */
  alert?: PriceAlertView;
}

const MODE_COPY: Record<AlertDialogMode, { title: string; description: string }> = {
  add: { title: 'Create Alert', description: 'Search the instrument master and set a price trigger.' },
  edit: { title: 'Edit Alert', description: 'Adjust the direction, threshold, or cooldown for this alert.' },
};

const DEFAULT_COOLDOWN_MINUTES = 1440;
const MIN_COOLDOWN_MINUTES = 60;

export function AlertFormDialog({ mode, trigger, alert }: AlertFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Instrument search only applies to `add` — `edit` is always opened from a
  // known row (AlertsTable passes `alert`), so the instrument is fixed and
  // shown read-only instead of a re-searchable field.
  const needsSearch = mode === 'add';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [direction, setDirection] = useState<'above' | 'below'>(alert?.direction ?? 'above');
  const [threshold, setThreshold] = useState(alert ? String(alert.threshold) : '');
  const [cooldownMinutes, setCooldownMinutes] = useState(
    alert ? String(alert.cooldownMinutes) : String(DEFAULT_COOLDOWN_MINUTES)
  );

  // Re-seed edit-mode fields from the current alert every time the dialog
  // opens — the row's underlying data can change (revalidation) between
  // opens, and this component instance persists across row re-renders.
  useEffect(() => {
    if (!open || mode !== 'edit' || !alert) return;
    setDirection(alert.direction);
    setThreshold(String(alert.threshold));
    setCooldownMinutes(String(alert.cooldownMinutes));
  }, [open, mode, alert]);

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

  const resolvedInstrumentId = mode === 'add' ? selected?.id : alert?.instrumentId;
  const copy = MODE_COPY[mode];
  const instrumentLabel = mode === 'edit' && alert ? `${alert.ticker} · ${alert.exchange} — ${alert.name}` : null;

  const resetForm = () => {
    setSelected(null);
    setQuery('');
    setResults([]);
    setError(null);
    if (mode === 'add') {
      setDirection('above');
      setThreshold('');
      setCooldownMinutes(String(DEFAULT_COOLDOWN_MINUTES));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resolvedInstrumentId) {
      setError('Select an instrument first');
      return;
    }

    const parsedThreshold = parseFloat(threshold);
    if (!(parsedThreshold > 0)) {
      setError('Threshold must be greater than zero');
      return;
    }

    const parsedCooldown =
      cooldownMinutes.trim() === '' ? DEFAULT_COOLDOWN_MINUTES : parseInt(cooldownMinutes, 10);
    if (!(parsedCooldown >= MIN_COOLDOWN_MINUTES)) {
      setError(`Cooldown must be at least ${MIN_COOLDOWN_MINUTES} minutes`);
      return;
    }

    startTransition(async () => {
      try {
        const result =
          mode === 'add'
            ? await createPriceAlert({
                instrumentId: resolvedInstrumentId,
                direction,
                threshold: parsedThreshold,
                cooldownMinutes: parsedCooldown,
              })
            : await updatePriceAlert({
                id: alert!.id,
                direction,
                threshold: parsedThreshold,
                cooldownMinutes: parsedCooldown,
              });

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

          {mode === 'edit' && instrumentLabel && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Instrument</label>
              <div className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
                {instrumentLabel}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Direction</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection('above')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer transition-colors',
                  direction === 'above'
                    ? 'bg-success/10 border-success/40 text-success'
                    : 'border-border text-muted-foreground hover:bg-muted/30'
                )}
              >
                Above
              </button>
              <button
                type="button"
                onClick={() => setDirection('below')}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer transition-colors',
                  direction === 'below'
                    ? 'bg-danger/10 border-danger/40 text-danger'
                    : 'border-border text-muted-foreground hover:bg-muted/30'
                )}
              >
                Below
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Threshold</label>
            <input
              type="number"
              step="any"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Cooldown (minutes)</label>
            <input
              type="number"
              step="1"
              min={MIN_COOLDOWN_MINUTES}
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(e.target.value)}
              placeholder={String(DEFAULT_COOLDOWN_MINUTES)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
            />
            <p className="text-[11px] text-muted-foreground">
              How often this alert can re-notify once triggered (default 1440 = 24h, minimum {MIN_COOLDOWN_MINUTES}).
            </p>
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
