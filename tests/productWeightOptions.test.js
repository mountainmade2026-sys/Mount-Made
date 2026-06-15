const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeWeightOptions, normalizeWeightProductData } = require('../utils/productWeightOptions');

test('normalizeWeightOptions converts comma-separated values into valid option objects', () => {
  const result = normalizeWeightOptions('250, 500, 1 kg');

  assert.deepStrictEqual(result, [
    { label: '250 g', value: '250 g' },
    { label: '500 g', value: '500 g' },
    { label: '1 kg', value: '1 kg' }
  ]);
});

test('normalizeWeightProductData preserves weight-based flags and defaults', () => {
  const result = normalizeWeightProductData({
    is_weight_based: 'true',
    weight_unit: 'kg',
    weight_options: '250, 500'
  });

  assert.equal(result.is_weight_based, true);
  assert.equal(result.weight_unit, 'kg');
  assert.deepStrictEqual(result.weight_options, [
    { label: '250 g', value: '250 g' },
    { label: '500 g', value: '500 g' }
  ]);
});
