const test = require('node:test');
const assert = require('node:assert/strict');

const { formatBarcodeDisplay } = require('../utils/productBarcode');

test('formatBarcodeDisplay returns a readable barcode label', () => {
  assert.equal(formatBarcodeDisplay('MM-000123'), 'MM-000123');
  assert.equal(formatBarcodeDisplay('  mm-000124  '), 'MM-000124');
});

test('formatBarcodeDisplay falls back to a placeholder when barcode is missing', () => {
  assert.equal(formatBarcodeDisplay(''), '—');
  assert.equal(formatBarcodeDisplay(null), '—');
});
