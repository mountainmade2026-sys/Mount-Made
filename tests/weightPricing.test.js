const test = require('node:test');
const assert = require('node:assert/strict');

const { getWeightInGrams, getWeightMultiplier, clampWeightAmountToMaximum } = require('../utils/weightPricing');

test('converts kilograms to grams correctly', () => {
  assert.equal(getWeightInGrams(1.5, 'kg'), 1500);
  assert.equal(getWeightInGrams(250, 'g'), 250);
});

test('scales unit price by the selected weight amount', () => {
  const product = { weight: 250, weight_unit: 'g', unit: 'g' };
  const selected = { value: 500, unit: 'g' };

  assert.equal(getWeightMultiplier(product, selected), 2);
});

test('uses the default base weight when no custom selection is provided', () => {
  const product = { weight: 1, weight_unit: 'kg', unit: 'kg' };

  assert.equal(getWeightMultiplier(product, null), 1);
});

test('caps manual weight amounts to the supported maximum', () => {
  assert.equal(clampWeightAmountToMaximum(60, 'kg', 50000), 50000);
  assert.equal(clampWeightAmountToMaximum(75000, 'g', 50000), 50000);
  assert.equal(clampWeightAmountToMaximum(2.5, 'kg', 50000), 2500);
});
