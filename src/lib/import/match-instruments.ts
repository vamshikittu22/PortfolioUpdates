// Instrument matching (IMPT-04) -- pure given the instrument universe and
// saved mappings; the caller (04-04's Server Actions) supplies both from
// the DB. Order per row: saved mapping short-circuits everything, then
// broker-specific matching (ISIN for Groww, ticker+US-exchange for
// Robinhood) with a broker-implied auto-pick on multi-match, else
// 'unmatched'. A row already 'invalid'/'unsupported' is left untouched --
// matching does not rescue a bad row.

import type { Currency, Exchange, Instrument } from '@/lib/types';
import type { ImportBroker, ParsedRow } from './types';

export interface SavedMapping {
  broker: ImportBroker;
  brokerSymbol: string;
  instrumentId: string;
}

// Groww implies Indian exchanges; NSE is preferred over BSE on a multi-match
// (04-RESEARCH locked broker-disambiguation decision).
const GROWW_EXCHANGE_PREFERENCE: Exchange[] = ['NSE', 'BSE'];

// Robinhood implies US exchanges; multi-match auto-picks NASDAQ over NYSE
// over OTHER, shown + overridable in the preview UI.
const ROBINHOOD_EXCHANGES = new Set<Exchange>(['NASDAQ', 'NYSE', 'OTHER']);
const ROBINHOOD_EXCHANGE_PREFERENCE: Exchange[] = ['NASDAQ', 'NYSE', 'OTHER'];
const ROBINHOOD_CURRENCY: Currency = 'USD';

function pickPreferred(matches: Instrument[], preference: Exchange[]): Instrument {
  for (const exchange of preference) {
    const found = matches.find((m) => m.exchange === exchange);
    if (found) return found;
  }
  return matches[0];
}

function findSavedMapping(
  row: ParsedRow,
  savedMappings: SavedMapping[]
): SavedMapping | undefined {
  return savedMappings.find((m) => m.broker === row.broker && m.brokerSymbol === row.symbol);
}

function matchGroww(row: ParsedRow, instruments: Instrument[]): ParsedRow {
  const matches = row.isin ? instruments.filter((i) => i.isin === row.isin) : [];
  if (matches.length === 0) {
    return { ...row, status: 'unmatched' };
  }
  const picked = pickPreferred(matches, GROWW_EXCHANGE_PREFERENCE);
  return {
    ...row,
    instrumentId: picked.id,
    status: 'valid',
    statusReason:
      matches.length > 1
        ? `Multiple exchanges hold ISIN ${row.isin}; auto-picked ${picked.exchange} (overridable)`
        : row.statusReason,
  };
}

function matchRobinhood(row: ParsedRow, instruments: Instrument[]): ParsedRow {
  const candidates = instruments.filter(
    (i) => i.symbol === row.symbol && ROBINHOOD_EXCHANGES.has(i.exchange) && i.currency === ROBINHOOD_CURRENCY
  );
  if (candidates.length === 0) {
    return { ...row, status: 'unmatched' };
  }
  const picked = pickPreferred(candidates, ROBINHOOD_EXCHANGE_PREFERENCE);
  return {
    ...row,
    instrumentId: picked.id,
    status: 'valid',
    statusReason:
      candidates.length > 1
        ? `Multiple US exchanges list ${row.symbol}; auto-picked ${picked.exchange} (overridable)`
        : row.statusReason,
  };
}

export function matchInstruments(
  rows: ParsedRow[],
  instruments: Instrument[],
  savedMappings: SavedMapping[]
): ParsedRow[] {
  return rows.map((row) => {
    if (row.status === 'unsupported' || row.status === 'invalid') return row;

    const saved = findSavedMapping(row, savedMappings);
    if (saved) {
      return { ...row, instrumentId: saved.instrumentId, status: 'valid' };
    }

    return row.broker === 'groww' ? matchGroww(row, instruments) : matchRobinhood(row, instruments);
  });
}
