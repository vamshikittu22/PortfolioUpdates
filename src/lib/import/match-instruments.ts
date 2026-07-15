// STUB for RED -- real implementation lands in the GREEN commit.
import type { Instrument } from '@/lib/types';
import type { ImportBroker, ParsedRow } from './types';

export interface SavedMapping {
  broker: ImportBroker;
  brokerSymbol: string;
  instrumentId: string;
}

export function matchInstruments(
  rows: ParsedRow[],
  _instruments: Instrument[],
  _savedMappings: SavedMapping[]
): ParsedRow[] {
  return rows;
}
