const test = require('node:test');
const assert = require('node:assert/strict');

const { getDeliveryChargeForSubtotal } = require('../utils/deliverySettings');

test('returns zero when delivery is disabled', () => {
  assert.equal(getDeliveryChargeForSubtotal(1500, { standard_delivery_enabled: 'false' }), 0);
});

test('uses the configured delivery charge', () => {
  assert.equal(getDeliveryChargeForSubtotal(1500, { standard_delivery_enabled: 'true', standard_delivery_charge: '89' }), 89);
});

test('falls back to zero for invalid values', () => {
  assert.equal(getDeliveryChargeForSubtotal(1500, { standard_delivery_enabled: 'true', standard_delivery_charge: '-5' }), 0);
});
