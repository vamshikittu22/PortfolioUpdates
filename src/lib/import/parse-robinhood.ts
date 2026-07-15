// Robinhood activity-report CSV parser -- header-name-driven (never
// positional; the file has both 9- and 11-column variants in the wild),
// Trans Code -> ImportTxnType mapping, and honest reporting of every
// unsupported row type (04-RESEARCH: "skip + report", never a silent drop).
// Pure: the only input is the file's decoded text.

import Papa from 'papaparse';
import { parseMoney, parseQuantity, parseRobinhoodDate } from './normalize';
import type { ImportTxnType, ParsedRow, RowStatus } from './types';

type RobinhoodCsvRow = Record<string, string | undefined>;

/**
 * Trans Codes this app does not yet model as ledger transactions, with a
 * human-readable reason surfaced in the preview (04-RESEARCH Trans Code
 * table). Anything not in this map AND not Buy/Sell/SPL falls back to a
 * generic "Unsupported Trans Code" reason -- still reported, never dropped.
 */
const UNSUPPORTED_REASONS: Record<string, string> = {
  CDIV: 'Cash dividends are not supported yet',
  SPR: 'Reverse splits are not supported yet (would reduce quantity)',
  CONV: 'Conversions are not supported yet',
  SXCH: 'Exchanges are not supported yet',
  MRGS: 'Mergers are not supported yet',
  OEXP: 'Options are not supported yet',
  OASGN: 'Options are not supported yet',
  ACH: 'Cash transfers are not supported yet',
  INT: 'Interest payments are not supported yet',
  DFEE: 'Fees are not supported yet',
  GOLD: 'Membership fees are not supported yet',
  MRGN: 'Margin activity is not supported yet',
};

function mapTransCode(code: string): ImportTxnType | null {
  if (code === 'Buy') return 'BUY';
  if (code === 'Sell') return 'SELL';
  if (code === 'SPL') return 'SPLIT';
  return null;
}

function buildRawFields(raw: RobinhoodCsvRow): Record<string, string | null> {
  const rawFields: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    rawFields[key] = value == null || value === '' ? null : value;
  }
  return rawFields;
}

export function parseRobinhood(text: string): ParsedRow[] {
  const parsed = Papa.parse<RobinhoodCsvRow>(text, { header: true, skipEmptyLines: true });
  const rows: ParsedRow[] = [];

  parsed.data.forEach((raw, i) => {
    const dateISO = parseRobinhoodDate(raw['Activity Date'] ?? null);
    // A row whose date fails to parse (footer/disclaimer text, blank line
    // that survived skipEmptyLines) is skipped entirely -- not emitted.
    if (dateISO == null) return;

    const rawFields = buildRawFields(raw);
    const transCode = (raw['Trans Code'] ?? '').trim();
    const symbol = (raw['Instrument'] ?? '').trim();
    const txnType = mapTransCode(transCode);

    if (txnType == null) {
      rows.push({
        rowIndex: i,
        broker: 'robinhood',
        rawFields,
        symbol,
        isin: null,
        txnType: null,
        quantity: null,
        quantityStr: null,
        price: null,
        priceStr: null,
        dateISO,
        status: 'unsupported',
        statusReason: UNSUPPORTED_REASONS[transCode] ?? `Unsupported Trans Code "${transCode}"`,
      });
      return;
    }

    const quantity = parseQuantity(raw['Quantity'] ?? null);
    const price = parseMoney(raw['Price'] ?? null);

    let status: RowStatus = 'valid';
    let statusReason: string | undefined;

    if (quantity == null) {
      status = 'invalid';
      statusReason = 'Quantity could not be parsed';
    } else if (txnType !== 'SPLIT' && price == null) {
      // SPLIT rows carry a null price by design (no cash flow); BUY/SELL
      // require a numeric price -- a blank/garbage price is a row error,
      // never coerced to 0 (this project's cardinal sin).
      status = 'invalid';
      statusReason = 'Price could not be parsed';
    }

    rows.push({
      rowIndex: i,
      broker: 'robinhood',
      rawFields,
      symbol,
      isin: null, // Robinhood activity reports carry no ISIN -- ticker matching only.
      txnType,
      quantity,
      quantityStr: quantity != null ? String(quantity) : null,
      price: txnType === 'SPLIT' ? null : price,
      priceStr: txnType === 'SPLIT' ? null : price != null ? String(price) : null,
      dateISO,
      status,
      statusReason,
    });
  });

  return rows;
}
