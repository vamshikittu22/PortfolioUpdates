/**
 * ALRT-02 / ALRT-03 / ALRT-05 — pure-function correctness proof for the alert
 * evaluation core: `evaluateAlerts` (level+cooldown trigger rule, null/failed
 * price exclusion, strict direction boundaries) and `computeAlertDedupeKey`
 * (the cooldown-window bucket key backing idempotent enqueue).
 *
 * Run:  npx tsx scripts/alerts-eval-test.ts
 * (Once 05-02 registers it: npm run test:alerts)
 *
 * This is a PURE unit test — no database, no network, no env vars, no
 * `Date.now()` (every `now` is injected). Same dependency-free style as
 * scripts/price-pnl-test.ts / scripts/rls-isolation-test.ts: node:assert/strict,
 * console.log('PASS') + process.exit(0) on success, throw / non-zero exit on
 * failure.
 * Do NOT weaken these assertions to make the script pass — a failure means the
 * implementation is wrong; fix evaluate.ts instead.
 */
import assert from 'node:assert/strict';
import { evaluateAlerts, isCooldownElapsed, computeAlertDedupeKey } from '../src/lib/alerts/evaluate';
import type { AlertEvalRow, PriceSnapshot } from '../src/lib/alerts/types';

const NOW = new Date('2026-07-16T12:00:00Z');

let nextId = 1;
function makeAlert(overrides: Partial<AlertEvalRow> = {}): AlertEvalRow {
  const id = overrides.id ?? `alert-${nextId++}`;
  return {
    id,
    accountId: 'account-1',
    userId: 'user-1',
    instrumentId: 'instrument-1',
    direction: 'above',
    threshold: 100,
    isActive: true,
    cooldownMinutes: 1440,
    lastTriggeredAt: null,
    ...overrides,
  };
}

function priceMap(entries: Record<string, PriceSnapshot>): Map<string, PriceSnapshot> {
  return new Map(Object.entries(entries));
}

function snapshot(price: number | null, fetchError: string | null = null): PriceSnapshot {
  return { price, fetchError };
}

// --- Case 1: above-alert, price > threshold, never triggered → fires ---
function testAboveFiresWhenPriceExceedsThreshold(): void {
  const alert = makeAlert({ direction: 'above', threshold: 100, lastTriggeredAt: null });
  const prices = priceMap({ 'instrument-1': snapshot(105) });
  const result = evaluateAlerts([alert], prices, NOW);
  assert.equal(result.length, 1, 'Case 1: expected exactly one triggered alert');
  assert.equal(result[0].alert.id, alert.id);
  assert.equal(result[0].price, 105);
}

// --- Case 2: above-alert, price === threshold → does NOT fire (boundary) ---
function testAboveDoesNotFireAtExactThreshold(): void {
  const alert = makeAlert({ direction: 'above', threshold: 100, lastTriggeredAt: null });
  const prices = priceMap({ 'instrument-1': snapshot(100) });
  const result = evaluateAlerts([alert], prices, NOW);
  assert.equal(result.length, 0, 'Case 2: exactly-equal must not fire (documented boundary)');
}

// --- Case 3: above-alert, price < threshold → does NOT fire ---
function testAboveDoesNotFireBelowThreshold(): void {
  const alert = makeAlert({ direction: 'above', threshold: 100, lastTriggeredAt: null });
  const prices = priceMap({ 'instrument-1': snapshot(95) });
  const result = evaluateAlerts([alert], prices, NOW);
  assert.equal(result.length, 0, 'Case 3: price below threshold must not fire an above-alert');
}

// --- Case 4: below-alert, price < threshold, cooldown elapsed → fires; price > threshold → not ---
function testBelowDirectionSemantics(): void {
  const alert = makeAlert({ direction: 'below', threshold: 50, lastTriggeredAt: null });

  const firing = evaluateAlerts([alert], priceMap({ 'instrument-1': snapshot(45) }), NOW);
  assert.equal(firing.length, 1, 'Case 4a: price below threshold must fire a below-alert');
  assert.equal(firing[0].price, 45);

  const notFiring = evaluateAlerts([alert], priceMap({ 'instrument-1': snapshot(55) }), NOW);
  assert.equal(notFiring.length, 0, 'Case 4b: price above threshold must not fire a below-alert');
}

// --- Case 5: is_active false, price way beyond threshold → does NOT fire ---
function testInactiveAlertNeverFires(): void {
  const alert = makeAlert({ direction: 'above', threshold: 100, isActive: false, lastTriggeredAt: null });
  const prices = priceMap({ 'instrument-1': snapshot(1000) });
  const result = evaluateAlerts([alert], prices, NOW);
  assert.equal(result.length, 0, 'Case 5: inactive alert must never fire regardless of price');
}

// --- Case 6: cooldown NOT elapsed → does NOT fire; cooldown elapsed → fires ---
function testCooldownGating(): void {
  const tenMinutesAgo = new Date(NOW.getTime() - 10 * 60_000).toISOString();
  const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString();

  const stillCoolingDown = makeAlert({
    direction: 'above',
    threshold: 100,
    cooldownMinutes: 1440,
    lastTriggeredAt: tenMinutesAgo,
  });
  const stillCoolingResult = evaluateAlerts(
    [stillCoolingDown],
    priceMap({ 'instrument-1': snapshot(150) }),
    NOW
  );
  assert.equal(stillCoolingResult.length, 0, 'Case 6a: cooldown not elapsed must not fire');

  const cooldownElapsed = makeAlert({
    direction: 'above',
    threshold: 100,
    cooldownMinutes: 1440,
    lastTriggeredAt: twoDaysAgo,
  });
  const elapsedResult = evaluateAlerts(
    [cooldownElapsed],
    priceMap({ 'instrument-1': snapshot(150) }),
    NOW
  );
  assert.equal(elapsedResult.length, 1, 'Case 6b: cooldown elapsed must fire');
}

// --- Case 7: isCooldownElapsed direct unit coverage ---
function testIsCooldownElapsedDirect(): void {
  assert.equal(isCooldownElapsed(null, 1440, NOW), true, 'Case 7a: never-triggered (null) must be elapsed');
  const tenMinutesAgo = new Date(NOW.getTime() - 10 * 60_000);
  assert.equal(
    isCooldownElapsed(tenMinutesAgo.toISOString(), 1440, NOW),
    false,
    'Case 7b: 10 minutes ago against a 1440-minute cooldown must not be elapsed'
  );
  const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000);
  assert.equal(
    isCooldownElapsed(twoDaysAgo.toISOString(), 1440, NOW),
    true,
    'Case 7c: 2 days ago against a 1440-minute (24h) cooldown must be elapsed'
  );
}

// --- Case 8: price snapshot is { price: null } (never fetched) → does NOT fire ---
function testNullPriceNeverFires(): void {
  const alert = makeAlert({ direction: 'above', threshold: 100, lastTriggeredAt: null });
  const prices = priceMap({ 'instrument-1': snapshot(null) });
  const result = evaluateAlerts([alert], prices, NOW);
  assert.equal(result.length, 0, 'Case 8: null price must never fire even though nominally beyond threshold');
}

// --- Case 9: price snapshot has fetchError set (last fetch failed) → does NOT fire ---
function testFetchErrorNeverFires(): void {
  const alert = makeAlert({ direction: 'above', threshold: 100, lastTriggeredAt: null });
  const prices = priceMap({ 'instrument-1': snapshot(100, 'HTTP 500') });
  const result = evaluateAlerts([alert], prices, NOW);
  assert.equal(result.length, 0, 'Case 9: fetchError set must never fire, even with a beyond-threshold stale price');
}

// --- Case 10: no entry in the price map at all → does NOT fire ---
function testMissingPriceMapEntryNeverFires(): void {
  const alert = makeAlert({ direction: 'above', threshold: 100, lastTriggeredAt: null });
  const prices = priceMap({});
  const result = evaluateAlerts([alert], prices, NOW);
  assert.equal(result.length, 0, 'Case 10: an instrument with no price map entry must never fire');
}

// --- Case 11: multiple alerts across instruments → returns exactly the ones that should fire ---
function testMultipleAlertsAcrossInstruments(): void {
  const fires1 = makeAlert({ id: 'fires-1', direction: 'above', threshold: 100, instrumentId: 'inst-a' });
  const fires2 = makeAlert({ id: 'fires-2', direction: 'below', threshold: 50, instrumentId: 'inst-b' });
  const doesNotFireInactive = makeAlert({
    id: 'inactive',
    direction: 'above',
    threshold: 10,
    isActive: false,
    instrumentId: 'inst-c',
  });
  const doesNotFireNull = makeAlert({
    id: 'null-price',
    direction: 'above',
    threshold: 10,
    instrumentId: 'inst-d',
  });
  const doesNotFireCooldown = makeAlert({
    id: 'cooling-down',
    direction: 'above',
    threshold: 10,
    cooldownMinutes: 1440,
    lastTriggeredAt: new Date(NOW.getTime() - 60_000).toISOString(),
    instrumentId: 'inst-e',
  });

  const prices = priceMap({
    'inst-a': snapshot(150),
    'inst-b': snapshot(40),
    'inst-c': snapshot(9999),
    'inst-d': snapshot(null),
    'inst-e': snapshot(9999),
  });

  const result = evaluateAlerts(
    [fires1, fires2, doesNotFireInactive, doesNotFireNull, doesNotFireCooldown],
    prices,
    NOW
  );

  assert.equal(result.length, 2, 'Case 11: exactly two alerts should fire');
  const firedIds = result.map((r) => r.alert.id).sort();
  assert.deepEqual(firedIds, ['fires-1', 'fires-2'].sort());
  const byId = new Map(result.map((r) => [r.alert.id, r.price]));
  assert.equal(byId.get('fires-1'), 150);
  assert.equal(byId.get('fires-2'), 40);
}

// --- Case 12: computeAlertDedupeKey format ---
function testComputeAlertDedupeKeyFormat(): void {
  const alert = makeAlert({ id: 'alert-format', cooldownMinutes: 1440 });
  const key = computeAlertDedupeKey(alert, NOW);
  const expectedBucket = Math.floor(NOW.getTime() / 1000 / (1440 * 60));
  assert.equal(key, `price_alert:alert-format:${expectedBucket}`, 'Case 12: dedupe key must be price_alert:{id}:{bucket}');
}

// --- Case 13: same alert, two `now`s inside the same cooldown window → identical key ---
function testComputeAlertDedupeKeySameWindow(): void {
  const alert = makeAlert({ id: 'alert-same-window', cooldownMinutes: 1440 });
  const keyA = computeAlertDedupeKey(alert, NOW);
  const fiveMinutesLater = new Date(NOW.getTime() + 5 * 60_000);
  const keyB = computeAlertDedupeKey(alert, fiveMinutesLater);
  assert.equal(keyA, keyB, 'Case 13: two calls inside the same cooldown window must produce an identical key (crash-recovery dedupe)');
}

// --- Case 14: `now` in the NEXT window (advance by cooldown_minutes) → a different key ---
function testComputeAlertDedupeKeyNextWindow(): void {
  const alert = makeAlert({ id: 'alert-next-window', cooldownMinutes: 1440 });
  const keyA = computeAlertDedupeKey(alert, NOW);
  const nextWindow = new Date(NOW.getTime() + 1440 * 60_000);
  const keyB = computeAlertDedupeKey(alert, nextWindow);
  assert.notEqual(keyA, keyB, 'Case 14: a now in the next cooldown window must produce a different key (next legitimate fire allowed)');
}

// --- Case 15: different alert ids → different keys at the same instant ---
function testComputeAlertDedupeKeyDifferentAlerts(): void {
  const alertA = makeAlert({ id: 'alert-x', cooldownMinutes: 1440 });
  const alertB = makeAlert({ id: 'alert-y', cooldownMinutes: 1440 });
  const keyA = computeAlertDedupeKey(alertA, NOW);
  const keyB = computeAlertDedupeKey(alertB, NOW);
  assert.notEqual(keyA, keyB, 'Case 15: different alert ids must produce different keys at the same instant');
}

function main(): void {
  testAboveFiresWhenPriceExceedsThreshold();
  testAboveDoesNotFireAtExactThreshold();
  testAboveDoesNotFireBelowThreshold();
  testBelowDirectionSemantics();
  testInactiveAlertNeverFires();
  testCooldownGating();
  testIsCooldownElapsedDirect();
  testNullPriceNeverFires();
  testFetchErrorNeverFires();
  testMissingPriceMapEntryNeverFires();
  testMultipleAlertsAcrossInstruments();
  testComputeAlertDedupeKeyFormat();
  testComputeAlertDedupeKeySameWindow();
  testComputeAlertDedupeKeyNextWindow();
  testComputeAlertDedupeKeyDifferentAlerts();

  console.log('PASS: alerts-eval — all 15 case groups passed (evaluateAlerts level+cooldown trigger rule, null/failed-price exclusion, strict direction boundaries, computeAlertDedupeKey cooldown-window bucket)');
  process.exit(0);
}

main();
