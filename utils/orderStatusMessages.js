function getDeliveryStatusMessage(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'out_for_delivery') {
    return 'Delivery within 4 hours';
  }

  return '';
}

module.exports = {
  getDeliveryStatusMessage
};
