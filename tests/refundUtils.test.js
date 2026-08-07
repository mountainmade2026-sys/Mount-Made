const test = require('node:test');
const assert = require('node:assert/strict');
const { getRefundAmount, shouldRestoreStockOnRefund, normalizeRazorpayRefundStatus } = require('../utils/refundUtils');

test('uses payment amount when present for a refund', () => {
  const order = { payment_amount: 349.99, total_amount: 400 };
  assert.equal(getRefundAmount(order), 349.99);
});

test('falls back to total amount for a refund', () => {
  const order = { total_amount: 400 };
  assert.equal(getRefundAmount(order), 400);
});

test('restores stock for a non-cancelled paid order', () => {
  const order = { status: 'delivered', payment_status: 'paid', refund_status: 'none' };
  assert.equal(shouldRestoreStockOnRefund(order), true);
});

test('does not restore stock again for already refunded orders', () => {
  const order = { status: 'cancelled', payment_status: 'refunded', refund_status: 'refunded' };
  assert.equal(shouldRestoreStockOnRefund(order), false);
});

test('maps Razorpay refund states to the app refund status', () => {
  assert.equal(normalizeRazorpayRefundStatus({ status: 'processed' }), 'refunded');
  assert.equal(normalizeRazorpayRefundStatus({ status: 'created' }), 'refund_pending');
  assert.equal(normalizeRazorpayRefundStatus({ status: 'failed' }), 'refund_failed');
});
