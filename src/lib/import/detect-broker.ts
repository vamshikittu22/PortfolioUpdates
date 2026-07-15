// Broker detection from raw file bytes — near-deterministic (zip magic vs
// CSV header text), provable without a DB or network. `fileName` is
// intentionally unused as anything more than documentation of intent: byte
// evidence must never be overridden by a (renamable, spoofable) extension.

export function detectBroker(bytes: Uint8Array, _fileName: string): 'groww' | 'robinhood' | 'unknown' {
  // Every .xlsx is a zip archive; zip files begin with the 'PK' magic
  // number. The header-scan parser (04-03) confirms it is actually a Groww
  // workbook; here we only need the byte-level evidence.
  const isZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) return 'groww';

  const head = new TextDecoder().decode(bytes.slice(0, 2048));
  if (/Trans Code/i.test(head) && /Activity Date/i.test(head)) return 'robinhood';

  return 'unknown';
}
