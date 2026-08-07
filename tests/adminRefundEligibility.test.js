const test = require('node:test');
const assert = require('node:assert/strict');

function isRefundEligibleOrder(order) {
  if (!order) return false;
  const provider = String(order.payment_provider || '').toLowerCase();
  const paymentStatus = String(order.payment_status || '').toLowerCase();
  const refundStatus = String(order.refund_status || '').toLowerCase();
  const hasPaymentId = !!String(order.payment_gateway_payment_id || '').trim();
  const isPaid = ['paid', 'captured', 'authorized'].includes(paymentStatus);
  return provider === 'razorpay' && hasPaymentId && isPaid && !['refunded', 'refund_pending', 'refund_failed'].includes(refundStatus);
}

test('marks paid Razorpay orders with payment IDs as refund eligible', () => {
  const order = {
    payment_provider: 'razorpay',
    payment_status: 'paid',
    refund_status: 'none',
    payment_gateway_payment_id: 'pay_123'
  };
  assert.equal(isRefundEligibleOrder(order), true);
});

test('rejects orders without a Razorpay payment ID', () => {
  const order = {
    payment_provider: 'razorpay',
    payment_status: 'paid',
    refund_status: 'none',
    payment_gateway_payment_id: ''
  };
  assert.equal(isRefundEligibleOrder(order), false);
});

test('rejects already refunded orders', () => {
  const order = {
    payment_provider: 'razorpay',
    payment_status: 'paid',
    refund_status: 'refunded',
    payment_gateway_payment_id: 'pay_123'
  };
  assert.equal(isRefundEligibleOrder(order), false);
});
