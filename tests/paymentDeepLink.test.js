const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProviderDeepLink, buildAndroidIntentUrl } = require('../public/js/paymentDeepLinks');

test('buildProviderDeepLink creates a UPI link for provider-specific checkout payloads', () => {
  const payload = {
    upiId: 'mountmade@oksbi',
    payeeName: 'Mount Made',
    orderNumber: '1001',
    amount: '125.5'
  };

  const link = buildProviderDeepLink(payload, 'paytm');
  assert.match(link, /^upi:\/\/pay\?/);
  assert.match(link, /pa=mountmade@oksbi/);
  assert.match(link, /pn=Mount%20Made/);
  assert.match(link, /tn=Order%201001/);
  assert.match(link, /am=125.50/);
  assert.match(link, /cu=INR/);
});

test('buildAndroidIntentUrl uses the provider package for Android app launch', () => {
  const link = 'upi://pay?pa=mountmade%40oksbi&pn=Mount%20Made&cu=INR';
  const intentUrl = buildAndroidIntentUrl(link, 'phonepe');
  assert.equal(intentUrl, 'intent://pay?pa=mountmade%40oksbi&pn=Mount%20Made&cu=INR#Intent;scheme=upi;package=com.phonepe.app;end');
});
