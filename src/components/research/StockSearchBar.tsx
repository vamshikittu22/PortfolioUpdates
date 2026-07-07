'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X, Building2 } from 'lucide-react';
import { searchCompanies } from '@/lib/research/research-service';
import type { CompanySearchResult } from '@/lib/research/research-types';
import { cn } from '@/utils/cn';

interface StockSearchBarProps {
  onSelect: (ticker: string) => void;
  selectedTicker?: string;
}

export function StockSearchBar({ onSelect, selectedTicker }: StockSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set initial query if selectedTicker is provided
  useEffect(() => {
    if (selectedTicker) {
      setQuery(selectedTicker);
    }
  }, [selectedTicker]);

  // Debounced/triggered search
  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    // Avoid searching if query is currently the exact selected ticker
    if (query === selectedTicker) {
      return;
    }

    setIsLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const searchResults = await searchCompanies(query);
        setResults(searchResults);
        setIsOpen(true);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [query, selectedTicker]);

  const handleSelect = (ticker: string) => {
    setQuery(ticker);
    setIsOpen(false);
    onSelect(ticker);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto z-30">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length > 0 && setIsOpen(true)}
          placeholder="Search stock, ticker, or company name..."
          className="w-full pl-11 pr-10 py-3 bg-muted/40 border border-border/80 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-sm transition-all text-foreground placeholder:text-muted-foreground outline-none"
        />
        {isLoading ? (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted/80 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {isOpen && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border/80 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2 border-b border-border/30 bg-muted/10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {results.length > 0 ? 'Matching Securities' : 'Search Status'}
            </span>
          </div>
          
          {results.length > 0 ? (
            <div className="divide-y divide-border/30">
              {results.map((item) => (
                <button
                  key={item.ticker}
                  onClick={() => handleSelect(item.ticker)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">{item.ticker}</span>
                        <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded font-semibold border border-border/50">
                          {item.exchange}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate block max-w-[240px] sm:max-w-[320px]">
                        {item.name}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-bold block text-foreground">
                      {item.marketCapFormatted}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {item.sector}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground space-y-2">
              <p>No matching stocks found in the mock database.</p>
              <div className="text-[10px] bg-muted/30 border border-border p-2 rounded-lg">
                Supported demo assets: <strong className="text-foreground">HDFCBANK</strong>, <strong className="text-foreground">TATASTEEL</strong>, or <strong className="text-foreground">YESBANK</strong>.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
