function normalizeWeightUnit(unit) {
  const normalized = String(unit || '').trim().toLowerCase();
  if (['g', 'grams', 'gm', 'gram'].includes(normalized)) return 'g';
  if (['kg', 'kilogram', 'kilograms', 'kilo', 'kilo gram'].includes(normalized)) return 'kg';
  return normalized || 'g';
}

function getWeightInGrams(value, unit) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const normalizedUnit = normalizeWeightUnit(unit);
  return normalizedUnit === 'kg' ? amount * 1000 : amount;
}

function getWeightMultiplier(product, selected) {
  const baseWeight = Number.parseFloat(product?.weight || 0);
  const baseWeightInGrams = getWeightInGrams(baseWeight, product?.weight_unit || product?.unit || 'g');
  if (baseWeightInGrams <= 0) return 1;

  const selectedValue = selected?.value ?? selected?.weight_value ?? product?.weight;
  const selectedUnit = selected?.unit || selected?.weight_unit || product?.weight_unit || product?.unit || 'g';
  const selectedWeightInGrams = getWeightInGrams(selectedValue, selectedUnit);

  if (selectedWeightInGrams <= 0) return 1;

  return selectedWeightInGrams / baseWeightInGrams;
}

module.exports = {
  normalizeWeightUnit,
  getWeightInGrams,
  getWeightMultiplier,
};
