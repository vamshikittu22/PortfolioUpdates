// Broker money/quantity/date normalization. Every function returns `null`
// on failure — NEVER a fabricated `0` or a guessed date. An unparseable
// cell is a row validation failure the caller must surface, not silently
// coerce (04-RESEARCH Anti-Patterns: "this project's cardinal sin").

/** A plain non-negative decimal after all broker punctuation has been stripped. */
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Shared string-cleaning for money/quantity cells: trim, strip thousands
 * commas, strip a leading `$`, strip enclosing parentheses. Returns the
 * cleaned string plus whether parentheses were present (money's negative
 * signal — meaningless for quantity, which ignores the flag).
 */
function stripBrokerPunctuation(raw: string): { cleaned: string; wasParenthesized: boolean } {
  const s = raw.trim();
  const wasParenthesized = /^\(.*\)$/.test(s);
  const cleaned = s
    .replace(/^\(|\)$/g, '')
    .replace(/^\$/, '')
    .replace(/,/g, '')
    .trim();
  return { cleaned, wasParenthesized };
}

/**
 * Parse a broker money cell (`$1,234.50`, `($43.64)`, blank, or `—`).
 * Parentheses mean negative; `$` prefix and thousands commas are stripped.
 * Anything left that isn't a plain non-negative decimal -> null (caller
 * marks the ROW invalid, never coerces to 0).
 */
export function parseMoney(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '—' || trimmed === '-') return null;

  const { cleaned, wasParenthesized } = stripBrokerPunctuation(trimmed);
  if (!PLAIN_DECIMAL.test(cleaned)) return null;

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return wasParenthesized ? -n : n;
}

/**
 * Parse a broker quantity cell. Accepts fractional shares to >=6 decimal
 * places and thousands commas. Zero or negative -> null (Phase 2's
 * `transactions` CHECK constraint requires quantity > 0; a 0/negative
 * quantity is a row validation failure, not a silent import).
 */
export function parseQuantity(raw: string | null): number | null {
  if (raw == null) return null;
  const { cleaned } = stripBrokerPunctuation(raw);
  if (cleaned === '' || !PLAIN_DECIMAL.test(cleaned)) return null;

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Robinhood activity-report dates are `M/D/YYYY` (e.g. `9/18/2023`).
 * Anything else — including a trailing disclaimer sentence — returns null
 * so the caller drops the row instead of importing garbage.
 */
export function parseRobinhoodDate(raw: string | null): string | null {
  if (raw == null) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const [, month, day, year] = m;
  const mm = Number(month);
  const dd = Number(day);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const MONTH_NAMES: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Groww statement dates come in DD-MM-YYYY, DD/MM/YYYY, or DD MMM YYYY
 * (e.g. `18 Sep 2023`). Unrecognized -> null (the caller, 04-03's parser,
 * falls back to today with a visible note — that fallback does not live
 * here).
 */
export function parseGrowwDate(raw: string | null): string | null {
  if (raw == null) return null;
  const s = raw.trim();

  const numeric = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (numeric) {
    const [, day, month, year] = numeric;
    const dd = Number(day);
    const mm = Number(month);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const named = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const [, day, monthName, year] = named;
    const key = monthName.slice(0, 3).toLowerCase();
    const mm = MONTH_NAMES[key];
    if (!mm) return null;
    const dd = Number(day);
    if (dd < 1 || dd > 31) return null;
    return `${year}-${mm}-${day.padStart(2, '0')}`;
  }

  return null;
}
