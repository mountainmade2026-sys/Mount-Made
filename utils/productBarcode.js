function generateProductBarcode(productId) {
  const numericId = Number(productId);

  if (!Number.isInteger(numericId) || numericId < 1) {
    throw new Error('A positive integer product ID is required to generate a barcode.');
  }

  const paddedId = String(numericId).padStart(6, '0');
  return `MM-${paddedId}`;
}

function isValidProductBarcode(value) {
  return /^MM-\d{6}$/.test(String(value || '').trim());
}

function formatBarcodeDisplay(value) {
  const normalized = String(value || '').trim().toUpperCase();

  if (!normalized) {
    return '—';
  }

  return isValidProductBarcode(normalized) ? normalized : normalized;
}

module.exports = {
  generateProductBarcode,
  isValidProductBarcode,
  formatBarcodeDisplay
};
