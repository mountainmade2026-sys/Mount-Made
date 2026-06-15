const test = require('node:test');
const assert = require('node:assert/strict');

const { getDeliveryStatusMessage } = require('../utils/orderStatusMessages');

test('returns the 4-hour delivery message for out-for-delivery orders', () => {
  assert.equal(getDeliveryStatusMessage('out_for_delivery'), 'Delivery within 4 hours');
});

test('returns no extra delivery message for other order statuses', () => {
  assert.equal(getDeliveryStatusMessage('delivered'), '');
  assert.equal(getDeliveryStatusMessage('processing'), '');
});
