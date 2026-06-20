function generateProductBarcode(productId) {
  const numericId = Number(productId);

  if (!Number.isInteger(numericId) || numericId < 1) {
    throw new Error('A positive integer product ID is required to generate a barcode.');
  }

  const paddedId = String(numericId).padStart(6, '0');
  return `MM-${paddedId}`;
}

function normalizeProductBarcode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';

  if (/^MM-\d{6}$/.test(raw)) {
    return raw;
  }

  const digitsOnly = raw.replace(/[^0-9]/g, '');
  if (/^\d{1,6}$/.test(digitsOnly)) {
    return `MM-${String(digitsOnly).padStart(6, '0')}`;
  }

  return raw;
}

function isValidProductBarcode(value) {
  return /^MM-\d{6}$/.test(normalizeProductBarcode(value));
}

function formatBarcodeDisplay(value) {
  const normalized = normalizeProductBarcode(value);

  if (!normalized) {
    return '—';
  }

  return normalized;
}

module.exports = {
  generateProductBarcode,
  isValidProductBarcode,
  formatBarcodeDisplay
};
