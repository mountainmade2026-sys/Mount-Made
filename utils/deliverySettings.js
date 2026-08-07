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

function parseProductGstOverrides(settings = {}) {
  let raw = settings?.product_gst_overrides;
  if (raw === undefined || raw === null || raw === '') {
    return {};
  }

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || '{}');
    } catch (error) {
      return {};
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }

  const overrides = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = String(key || '').trim();
    const percent = Number(value);
    if (id && Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      overrides[id] = Number(percent.toFixed(2));
    }
  }
  return overrides;
}

function resolveItemSubtotal(item) {
  if (!item || typeof item !== 'object') {
    return 0;
  }

  const subtotalCandidates = [
    item.subtotal,
    item.line_total,
    item.lineTotal,
    item.total,
    item.amount
  ];

  for (const candidate of subtotalCandidates) {
    const parsedSubtotal = parseNonNegativeNumber(candidate);
    if (parsedSubtotal > 0) {
      return parsedSubtotal;
    }
  }

  const quantity = Number(item.quantity || item.qty || 1);
  const price = Number(item.price || item.unit_price || item.retail_price || item.sale_price || 0);
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0) {
    return 0;
  }

  return quantity * price;
}

function getProductGstPercent(item, overrides = {}) {
  if (!item || typeof item !== 'object') {
    return 5;
  }

  const productId = String(item.product_id || item.productId || item.id || '').trim();
  if (productId && Number.isFinite(Number(overrides[productId])) && overrides[productId] >= 0 && overrides[productId] <= 100) {
    return Number(overrides[productId]);
  }

  return 5;
}

function getItemGstAmount(item, overrides = {}) {
  const subtotal = resolveItemSubtotal(item);
  const percent = getProductGstPercent(item, overrides);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return 0;
  }

  return Math.round((subtotal * percent / 100) * 100) / 100;
}

function computeCartGst(cartItems, overrides = {}) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return 0;
  }

  return cartItems.reduce((sum, item) => sum + getItemGstAmount(item, overrides), 0);
}

function getDeliveryChargeForSubtotal(subtotal, settings = {}, gstAmount = null) {
  const base = Number(subtotal) || 0;
  if (!Number.isFinite(base) || base < 0) {
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

  const effectiveGst = Number.isFinite(Number(gstAmount))
    ? Number(gstAmount)
    : Math.round((base * 0.05) * 100) / 100;
  const amountWithGst = base + effectiveGst;

  if (amountWithGst >= freeAbove) {
    return 0;
  }

  const charge = parseNonNegativeNumber(
    settings?.standard_delivery_charge ?? settings?.fast_delivery_charge ?? 0
  );

  return charge;
}

module.exports = {
  parseNonNegativeNumber,
  parseProductGstOverrides,
  getProductGstPercent,
  getItemGstAmount,
  computeCartGst,
  getDeliveryChargeForSubtotal
};
