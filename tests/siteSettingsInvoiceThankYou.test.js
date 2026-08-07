const test = require('node:test');
const assert = require('node:assert/strict');
const { collectInvoiceThankYouUpdates } = require('../utils/siteSettingsUtils');

test('collectInvoiceThankYouUpdates saves the new message to both invoice thank-you keys', () => {
  const updates = collectInvoiceThankYouUpdates({
    invoice_thank_you_message: 'Thank you for shopping with Mount Made!'
  });

  assert.deepEqual(updates, [
    { key: 'invoice_thank_you_message', value: 'Thank you for shopping with Mount Made!' },
    { key: 'invoice_thank_you', value: 'Thank you for shopping with Mount Made!' }
  ]);
});

test('collectInvoiceThankYouUpdates trims empty legacy values and keeps the keys in sync', () => {
  const updates = collectInvoiceThankYouUpdates({ invoice_thank_you: '   ' });

  assert.deepEqual(updates, [
    { key: 'invoice_thank_you_message', value: '' },
    { key: 'invoice_thank_you', value: '' }
  ]);
});
