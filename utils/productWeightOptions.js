function normalizeWeightOptionText(value, defaultUnit = 'g') {
  const text = String(value || '').trim();
  if (!text) return null;

  const cleanText = text.replace(/\s+/g, ' ').trim();
  const unitMatch = cleanText.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);

  if (unitMatch) {
    const amount = unitMatch[1];
    const unit = (unitMatch[2] || defaultUnit).toLowerCase();

    if (unit === 'kg' || unit === 'g') {
      return `${amount} ${unit}`;
    }

    return `${amount} ${defaultUnit}`;
  }

  return cleanText;
}

function normalizeWeightOptions(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

  return rawValues
    .map((entry) => {
      const normalized = normalizeWeightOptionText(entry, 'g');
      if (!normalized) return null;
      return {
        label: normalized,
        value: normalized
      };
    })
    .filter(Boolean);
}

function normalizeWeightProductData(productData = {}) {
  const isWeightBased = productData.is_weight_based === true || productData.is_weight_based === 'true' || productData.is_weight_based === 1;
  const weightUnit = String(productData.weight_unit || 'g').trim().toLowerCase() || 'g';

  return {
    ...productData,
    is_weight_based: Boolean(isWeightBased),
    weight_unit: weightUnit,
    weight_options: normalizeWeightOptions(productData.weight_options)
  };
}

module.exports = {
  normalizeWeightOptionText,
  normalizeWeightOptions,
  normalizeWeightProductData
};
