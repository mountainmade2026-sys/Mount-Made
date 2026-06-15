const test = require('node:test');
const assert = require('node:assert/strict');

const { generateProductBarcode, isValidProductBarcode } = require('../utils/productBarcode');

test('generateProductBarcode creates a unique, deterministic code for each product id', () => {
  const first = generateProductBarcode(1);
  const second = generateProductBarcode(2);

  assert.equal(first.startsWith('MM-'), true);
  assert.equal(second.startsWith('MM-'), true);
  assert.notEqual(first, second);
  assert.equal(isValidProductBarcode(first), true);
  assert.equal(isValidProductBarcode(second), true);
});

test('generateProductBarcode uses a padded product id format', () => {
  assert.equal(generateProductBarcode(7), 'MM-000007');
  assert.equal(generateProductBarcode(42), 'MM-000042');
});
