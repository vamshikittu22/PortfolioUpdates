// Broker money/quantity/date normalization. Every function returns `null`
// on failure — NEVER a fabricated `0` or a guessed date. An unparseable
// cell is a row validation failure the caller must surface, not silently
// coerce (04-RESEARCH Anti-Patterns: "this project's cardinal sin").
//
// STUB — RED phase (04-02 Task 2). Real implementations land in GREEN.

export function parseMoney(_raw: string | null): number | null {
  return null;
}

export function parseQuantity(_raw: string | null): number | null {
  return null;
}

export function parseRobinhoodDate(_raw: string | null): string | null {
  return null;
}

export function parseGrowwDate(_raw: string | null): string | null {
  return null;
}
