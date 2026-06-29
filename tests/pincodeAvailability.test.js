const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePincode, parseAvailablePincodes, isPincodeServiceable } = require('../utils/pincodeAvailability');

test('normalizes and parses configured pincodes from admin input', () => {
  assert.equal(normalizePincode(' 560001 '), '560001');
  assert.deepEqual(parseAvailablePincodes('560001, 560002\n560003'), ['560001', '560002', '560003']);
});

test('only allows pincodes that are explicitly listed when a restricted list is configured', () => {
  assert.equal(isPincodeServiceable('560001', '560001, 560002'), true);
  assert.equal(isPincodeServiceable('560004', '560001, 560002'), false);
});

test('allows all pincodes when no restricted list is configured', () => {
  assert.equal(isPincodeServiceable('560001', ''), true);
  assert.equal(isPincodeServiceable('560004', null), true);
});
