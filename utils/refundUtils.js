function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRefundAmount(order = {}) {
  const paymentAmount = toNumber(order?.payment_amount);
  if (paymentAmount > 0) {
    return paymentAmount;
  }

  const totalAmount = toNumber(order?.total_amount);
  return totalAmount > 0 ? totalAmount : 0;
}

function shouldRestoreStockOnRefund(order = {}) {
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  const refundStatus = String(order?.refund_status || '').toLowerCase();
  const orderStatus = String(order?.status || '').toLowerCase();

  if (refundStatus === 'refunded' || paymentStatus === 'refunded') {
    return false;
  }

  if (paymentStatus !== 'paid') {
    return false;
  }

  if (['cancelled', 'pending', 'payment_pending'].includes(orderStatus)) {
    return false;
  }

  return true;
}

function normalizeRazorpayRefundStatus(refundResponse = {}) {
  const status = String(refundResponse?.status || '').toLowerCase();
  if (status === 'processed') {
    return 'refunded';
  }
  if (status === 'failed') {
    return 'refund_failed';
  }
  return 'refund_pending';
}

module.exports = {
  toNumber,
  getRefundAmount,
  shouldRestoreStockOnRefund,
  normalizeRazorpayRefundStatus
};
