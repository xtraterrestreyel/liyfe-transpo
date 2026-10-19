// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFee } from './pricing.js';

const P = { tierMiles: 10, tierPriceCents: 499, maxMiles: 40, serviceFeeCents: 50 };

test('0–10 miles is one tier', () => {
  assert.equal(calculateFee(0.4, P).tiers, 1);
  assert.equal(calculateFee(10, P).tiers, 1);
  assert.equal(calculateFee(10, P).deliveryFeeCents, 499);
});

test('each started 10 miles adds a tier', () => {
  assert.equal(calculateFee(10.1, P).tiers, 2);
  assert.equal(calculateFee(20, P).deliveryFeeCents, 998);
  assert.equal(calculateFee(25, P).deliveryFeeCents, 1497);
  assert.equal(calculateFee(35, P).deliveryFeeCents, 1996);
});

test('service fee is added on top', () => {
  assert.equal(calculateFee(35, P).totalCents, 2046);
});

test('past the max distance is out of area', () => {
  assert.equal(calculateFee(40, P).inArea, true);
  assert.equal(calculateFee(40.2, P).inArea, false);
});
