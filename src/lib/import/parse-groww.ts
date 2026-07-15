// Groww holdings-statement XLSX parser -- the phase's riskiest unknown
// (04-RESEARCH: LOW-MEDIUM confidence on the exact cell layout). Mitigated
// structurally, not informationally: SCAN for the header row by column
// name (never a fixed offset/position), read columns by name, and fail
// loudly with the first rows echoed back when no header is found.
//
// A Groww holdings statement is a point-in-time SNAPSHOT (instrument,
// quantity, average buy price) -- not a transaction log. Each equity row
// becomes exactly ONE synthetic opening BUY at the stated average price,
// never invented per-lot history (04-RESEARCH Pattern 3 / Pitfall 1). This
// preserves cost basis exactly through deriveHoldings.

import * as XLSX from 'xlsx';
import { parseGrowwDate, parseMoney, parseQuantity } from './normalize';
import { ImportParseError } from './types';
import type { ParsedRow } from './types';

const HEADER_SCAN_LIMIT = 30;
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const MF_ISIN_PREFIX = 'INF';
const DATE_IN_TEXT = /(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/;
const GROWW_NOTES =
  'Imported from Groww holdings statement (opening position; avg-cost snapshot)';

function normalizeHeaderCell(cell: unknown): string {
  return String(cell ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellToString(cell: unknown): string | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  return s === '' ? null : s;
}

function findColumn(headerRow: unknown[], matcher: (norm: string) => boolean): number {
  return headerRow.findIndex((c) => matcher(normalizeHeaderCell(c)));
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => c == null || String(c).trim() === '');
}

export function parseGroww(bytes: Uint8Array): ParsedRow[] {
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });

  const headerIdx = grid.findIndex((row, idx) => {
    if (idx >= HEADER_SCAN_LIMIT) return false;
    const hasIsin = row.some((c) => normalizeHeaderCell(c) === 'isin');
    const hasQuantity = row.some((c) => /quant/i.test(String(c ?? '')));
    return hasIsin && hasQuantity;
  });

  if (headerIdx === -1) {
    throw new ImportParseError(
      `Unrecognized Groww format: no header row containing "ISIN" and a quantity column found in sheet "${sheetName}". ` +
        `First rows seen: ${JSON.stringify(grid.slice(0, 5))}`
    );
  }

  const headerRow = grid[headerIdx];
  const isinCol = findColumn(headerRow, (n) => n === 'isin');
  const quantityCol = findColumn(headerRow, (n) => /quant/.test(n));
  const priceCol = findColumn(headerRow, (n) => /(average|avg).*price/.test(n) || /buy price/.test(n));
  const nameCol = findColumn(headerRow, (n) => /(stock|name|company)/.test(n));

  // Statement date: scan the title block ABOVE the header row for a
  // recognizable date substring (e.g. "Statement as on 10 Jul 2026"). Falls
  // back to today with a visible note -- never silently guessed.
  let statementDateISO: string | null = null;
  for (let i = 0; i < headerIdx; i++) {
    const rowText = grid[i].map((c) => String(c ?? '')).join(' ');
    const match = rowText.match(DATE_IN_TEXT);
    const candidate = match ? parseGrowwDate(match[1]) : null;
    if (candidate) {
      statementDateISO = candidate;
      break;
    }
  }
  const usedFallbackDate = statementDateISO == null;
  const dateISO = statementDateISO ?? new Date().toISOString().slice(0, 10);

  const rows: ParsedRow[] = [];

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const rawRow = grid[i];
    if (!rawRow || isBlankRow(rawRow)) continue;

    const isinCell = (cellToString(rawRow[isinCol]) ?? '').toUpperCase();
    if (!ISIN_PATTERN.test(isinCell)) {
      // First data row without a valid ISIN ends the holdings block --
      // drops totals/footer rows naturally, never guesses past them.
      break;
    }

    const rawFields: Record<string, string | null> = {};
    headerRow.forEach((h, colIdx) => {
      const key = normalizeHeaderCell(h) || `col${colIdx}`;
      rawFields[key] = cellToString(rawRow[colIdx]);
    });

    const symbol = (nameCol >= 0 ? cellToString(rawRow[nameCol]) : null) ?? isinCell;
    const quantity = parseQuantity(cellToString(rawRow[quantityCol]));
    const price = parseMoney(cellToString(rawRow[priceCol]));

    if (isinCell.startsWith(MF_ISIN_PREFIX)) {
      // Mutual fund holdings share the same statement -- valid ISIN, but
      // not an equity position this app models yet (04-RESEARCH Open
      // Question 3). Reported, never dropped, never errors the whole file.
      rows.push({
        rowIndex: i,
        broker: 'groww',
        rawFields,
        symbol,
        isin: isinCell,
        txnType: null,
        quantity,
        quantityStr: quantity != null ? String(quantity) : null,
        price,
        priceStr: price != null ? String(price) : null,
        dateISO,
        status: 'unsupported',
        statusReason: 'Mutual fund holdings are not supported yet',
      });
      continue;
    }

    rawFields.notes = GROWW_NOTES;

    let status: 'valid' | 'invalid' = 'valid';
    let statusReason: string | undefined = usedFallbackDate
      ? "Statement date not found in the file; using today's date"
      : undefined;

    if (quantity == null) {
      status = 'invalid';
      statusReason = 'Quantity could not be parsed';
    } else if (price == null) {
      status = 'invalid';
      statusReason = 'Average buy price could not be parsed';
    }

    rows.push({
      rowIndex: i,
      broker: 'groww',
      rawFields,
      symbol,
      isin: isinCell,
      txnType: 'BUY',
      quantity,
      quantityStr: quantity != null ? String(quantity) : null,
      price,
      priceStr: price != null ? String(price) : null,
      dateISO,
      status,
      statusReason,
    });
  }

  return rows;
}
