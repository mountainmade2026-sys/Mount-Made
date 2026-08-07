function collectInvoiceThankYouUpdates(payload = {}) {
  const hasInvoiceMessageSetting = Object.prototype.hasOwnProperty.call(payload, 'invoice_thank_you_message');
  const hasLegacyInvoiceSetting = Object.prototype.hasOwnProperty.call(payload, 'invoice_thank_you');

  if (!hasInvoiceMessageSetting && !hasLegacyInvoiceSetting) {
    return [];
  }

  const value = hasInvoiceMessageSetting
    ? String(payload.invoice_thank_you_message ?? '').trim()
    : String(payload.invoice_thank_you ?? '').trim();

  return [
    { key: 'invoice_thank_you_message', value },
    { key: 'invoice_thank_you', value }
  ];
}

module.exports = {
  collectInvoiceThankYouUpdates
};
