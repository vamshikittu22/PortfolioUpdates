// Broker detection from raw file bytes — near-deterministic (zip magic vs
// CSV header text), provable without a DB or network.
//
// STUB — RED phase (04-02 Task 2). Real implementation lands in GREEN.

export function detectBroker(_bytes: Uint8Array, _fileName: string): 'groww' | 'robinhood' | 'unknown' {
  return 'unknown';
}
