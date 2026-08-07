const test = require('node:test');
const assert = require('node:assert/strict');

const { getDeliveryChargeForSubtotal, computeCartGst, getItemGstAmount } = require('../utils/deliverySettings');

test('returns zero when delivery is disabled', () => {
  assert.equal(getDeliveryChargeForSubtotal(1500, { standard_delivery_enabled: 'false' }), 0);
});

test('uses the configured delivery charge below the free-delivery threshold', () => {
  assert.equal(getDeliveryChargeForSubtotal(1500, { standard_delivery_enabled: 'true', standard_delivery_charge: '89' }), 89);
});

test('uses a custom free-delivery threshold', () => {
  assert.equal(getDeliveryChargeForSubtotal(1499, { standard_delivery_enabled: 'true', standard_delivery_charge: '89', standard_delivery_free_above: '1500' }), 89);
  assert.equal(getDeliveryChargeForSubtotal(1500, { standard_delivery_enabled: 'true', standard_delivery_charge: '89', standard_delivery_free_above: '1500' }), 0);
});

test('falls back to zero for invalid values', () => {
  assert.equal(getDeliveryChargeForSubtotal(1500, { standard_delivery_enabled: 'true', standard_delivery_charge: '-5' }), 0);
});

test('applies product-specific GST overrides for delivery threshold and total', () => {
  const settings = {
    standard_delivery_enabled: 'true',
    standard_delivery_charge: '80',
    standard_delivery_free_above: '1200',
    product_gst_overrides: JSON.stringify({ '101': 12, '102': 18 })
  };

  const cartItems = [
    { product_id: '101', quantity: 1, price: 500, subtotal: 500 },
    { product_id: '102', quantity: 1, price: 500, subtotal: 500 }
  ];

  const gst = computeCartGst(cartItems, { '101': 12, '102': 18 });
  assert.equal(gst, 150);
  assert.equal(getDeliveryChargeForSubtotal(1000, settings, gst), 80);
  assert.equal(getDeliveryChargeForSubtotal(1150, settings, gst), 0);
});

test('returns the GST amount for a single item using the provided override', () => {
  const item = { product_id: '101', quantity: 2, price: 250, subtotal: 500 };
  assert.equal(getItemGstAmount(item, { '101': 12 }), 60);
});
