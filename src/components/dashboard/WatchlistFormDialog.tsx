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
import { addToWatchlist, searchInstrumentsAction } from '@/server-actions/portfolio';

interface WatchlistFormDialogProps {
  trigger: React.ReactNode;
}

export function WatchlistFormDialog({ trigger }: WatchlistFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [query, open]);

  const handleAdd = (instrumentId: string) => {
    setError(null);
    setAddingId(instrumentId);
    startTransition(async () => {
      try {
        const result = await addToWatchlist({ instrumentId });
        if (result.success) {
          setOpen(false);
          setQuery('');
          setResults([]);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setAddingId(null);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setResults([]);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Watchlist</DialogTitle>
          <DialogDescription>Search the real instrument master — no free-text tickers.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
            <div className="max-h-52 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
              {results.map((inst) => (
                <button
                  type="button"
                  key={inst.id}
                  disabled={isPending && addingId === inst.id}
                  onClick={() => handleAdd(inst.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer disabled:opacity-60"
                >
                  <span className="font-semibold">{inst.symbol}</span>{' '}
                  <span className="text-muted-foreground">
                    {inst.exchange} · {inst.displayName}
                  </span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-danger text-xs">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <button type="button" className="px-4 py-2 text-sm rounded-lg border border-border cursor-pointer">
              Close
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
