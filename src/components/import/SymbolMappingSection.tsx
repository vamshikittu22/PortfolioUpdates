'use client';

// IMPT-04 (locked): one entry per unique unmatched broker symbol — resolving
// one entry fixes every row that carried it, and nothing is silently
// dropped. Two resolution paths per entry: map to an existing instrument
// (reuses searchInstrumentsAction — the same debounced pattern as
// HoldingFormDialog's instrument search, never a new picker) or create one.
// ISIN is never fabricated: prefilled for Groww (the file has it), required
// and left empty for Robinhood (the file has none). The container (04-06)
// disables commit while any unmatched symbol the user chose to import
// remains unresolved — this component only records the choice.

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Circle, Search } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { searchInstrumentsAction } from '@/server-actions/portfolio';
import type { Instrument, Exchange, Currency } from '@/lib/types';
import type { ImportBroker, CommitChoices } from '@/lib/import/types';

type Mapping = CommitChoices['mappings'][number];

// Two letters, nine alphanumerics, one check digit — the real ISIN shape.
// The server RPC validates again; this only avoids a round-trip on an
// obviously malformed value, never substitutes for server validation.
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const EXCHANGES: Exchange[] = ['NSE', 'BSE', 'NASDAQ', 'NYSE', 'OTHER'];
const CURRENCIES: Currency[] = ['INR', 'USD'];

interface SymbolMappingSectionProps {
  broker: ImportBroker;
  unmatchedSymbols: string[];
  growwIsinBySymbol?: Record<string, string>;
  value: CommitChoices['mappings'];
  onChange: (m: CommitChoices['mappings']) => void;
}

export function SymbolMappingSection({
  broker,
  unmatchedSymbols,
  growwIsinBySymbol,
  value,
  onChange,
}: SymbolMappingSectionProps) {
  if (unmatchedSymbols.length === 0) return null;

  const resolvedCount = unmatchedSymbols.filter((s) => value.some((m) => m.brokerSymbol === s)).length;

  const setMappingForSymbol = (symbol: string, mapping: Mapping | null) => {
    const rest = value.filter((m) => m.brokerSymbol !== symbol);
    onChange(mapping ? [...rest, mapping] : rest);
  };

  return (
    <div className="glass-card rounded-2xl border border-border/50 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Resolve symbols</h2>
        <span className="text-xs text-muted-foreground">
          {resolvedCount}/{unmatchedSymbols.length} resolved
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        These broker symbols could not be matched to an instrument automatically. Nothing is dropped —
        resolve each one below to include its rows in the import.
      </p>

      <div className="divide-y divide-border/30">
        {unmatchedSymbols.map((symbol) => (
          <SymbolEntry
            key={symbol}
            symbol={symbol}
            broker={broker}
            prefillIsin={growwIsinBySymbol?.[symbol]}
            mapping={value.find((m) => m.brokerSymbol === symbol) ?? null}
            onResolve={(mapping) => setMappingForSymbol(symbol, mapping)}
          />
        ))}
      </div>
    </div>
  );
}

interface SymbolEntryProps {
  symbol: string;
  broker: ImportBroker;
  prefillIsin?: string;
  mapping: Mapping | null;
  onResolve: (mapping: Mapping | null) => void;
}

function SymbolEntry({ symbol, broker, prefillIsin, mapping, onResolve }: SymbolEntryProps) {
  const [mode, setMode] = useState<'search' | 'create'>('search');

  // ---- Map to existing: reuses searchInstrumentsAction, debounced exactly
  // like HoldingFormDialog's instrument search. ----
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Instrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'search' || mapping) return;
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
  }, [query, mode, mapping]);

  // ---- Create new: ISIN is never fabricated — prefilled for Groww (the
  // file has it), required and left empty for Robinhood (the file has
  // none). ----
  const [ticker, setTicker] = useState(symbol);
  const [isin, setIsin] = useState(prefillIsin ?? '');
  const [exchange, setExchange] = useState<Exchange>(broker === 'groww' ? 'NSE' : 'NASDAQ');
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState<Currency>(broker === 'groww' ? 'INR' : 'USD');
  const isinValid = ISIN_PATTERN.test(isin.trim().toUpperCase());

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isinValid || !ticker.trim() || !displayName.trim()) return;
    onResolve({
      brokerSymbol: symbol,
      create: {
        isin: isin.trim().toUpperCase(),
        symbol: ticker.trim().toUpperCase(),
        exchange,
        displayName: displayName.trim(),
        currency,
      },
    });
  };

  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center gap-2">
        {mapping ? (
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-semibold text-sm">{symbol}</span>
        {mapping && (
          <button
            type="button"
            onClick={() => onResolve(null)}
            className="ml-auto text-xs text-primary cursor-pointer"
          >
            Change
          </button>
        )}
      </div>

      {mapping ? (
        <p className="text-xs text-muted-foreground pl-6">
          {'instrumentId' in mapping
            ? `Mapped to existing instrument (${mapping.instrumentId})`
            : `Will create ${mapping.create.symbol} · ${mapping.create.exchange} (${mapping.create.isin})`}
        </p>
      ) : (
        <div className="pl-6 space-y-3">
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setMode('search')}
              className={cn(
                'px-2.5 py-1 rounded-lg font-semibold cursor-pointer',
                mode === 'search' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground'
              )}
            >
              Map to existing
            </button>
            <button
              type="button"
              onClick={() => setMode('create')}
              className={cn(
                'px-2.5 py-1 rounded-lg font-semibold cursor-pointer',
                mode === 'create' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground'
              )}
            >
              Create new instrument
            </button>
          </div>

          {mode === 'search' ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search symbol or company name..."
                  className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
                />
              </div>
              {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
              {searchError && <p className="text-xs text-danger">{searchError}</p>}
              {results.length > 0 && (
                <div className="max-h-36 overflow-y-auto border border-border rounded-lg divide-y divide-border/50">
                  {results.map((inst) => (
                    <button
                      type="button"
                      key={inst.id}
                      onClick={() => onResolve({ brokerSymbol: symbol, instrumentId: inst.id })}
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
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Ticker</label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">ISIN</label>
                  <input
                    type="text"
                    value={isin}
                    onChange={(e) => setIsin(e.target.value.toUpperCase())}
                    className={cn(
                      'w-full px-2.5 py-1.5 bg-background border rounded-lg text-sm outline-none focus:border-primary',
                      isin && !isinValid ? 'border-danger' : 'border-border'
                    )}
                    placeholder="e.g. INE002A01018"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Exchange</label>
                  <Select value={exchange} onValueChange={(v) => setExchange(v as Exchange)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXCHANGES.map((ex) => (
                        <SelectItem key={ex} value={ex}>
                          {ex}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Currency</label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">Display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>
              {broker === 'robinhood' && !prefillIsin && (
                <p className="text-[11px] text-warning">
                  Robinhood exports carry no ISIN — enter the instrument&apos;s ISIN.
                </p>
              )}
              {isin && !isinValid && (
                <p className="text-[11px] text-danger">
                  ISIN must look like two letters, nine alphanumerics, one check digit (e.g. INE002A01018).
                </p>
              )}
              <button
                type="submit"
                disabled={!isinValid || !ticker.trim() || !displayName.trim()}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save mapping
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
