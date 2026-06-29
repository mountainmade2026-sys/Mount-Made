function parseNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function getDeliveryChargeForSubtotal(subtotal, settings = {}) {
  const amount = Number(subtotal) || 0;
  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  const enabled = (() => {
    const raw = settings?.standard_delivery_enabled ?? settings?.fast_delivery_enabled;
    if (raw === undefined || raw === null || raw === '') {
      return true;
    }

    if (typeof raw === 'boolean') {
      return raw;
    }

    return String(raw).trim().toLowerCase() === 'true';
  })();

  if (!enabled) {
    return 0;
  }

  const freeAboveRaw = settings?.standard_delivery_free_above ?? settings?.fast_delivery_free_above;
  const freeAbove = freeAboveRaw === undefined || freeAboveRaw === null || freeAboveRaw === ''
    ? 1999
    : parseNonNegativeNumber(freeAboveRaw);

  if (amount >= freeAbove) {
    return 0;
  }

  const charge = parseNonNegativeNumber(
    settings?.standard_delivery_charge ?? settings?.fast_delivery_charge ?? 0
  );

  return charge;
}

module.exports = {
  parseNonNegativeNumber,
  getDeliveryChargeForSubtotal
};
