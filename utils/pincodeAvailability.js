function normalizePincode(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

function parseAvailablePincodes(rawValue) {
  return String(rawValue || '')
    .split(/[\n,]+/)
    .map(pin => normalizePincode(pin))
    .filter(Boolean);
}

function isPincodeServiceable(pin, codAvailablePincodes) {
  const normalized = normalizePincode(pin);
  if (normalized.length !== 6) return false;

  const pincodes = parseAvailablePincodes(codAvailablePincodes);
  if (!pincodes.length) return true;

  return pincodes.includes(normalized);
}

module.exports = {
  normalizePincode,
  parseAvailablePincodes,
  isPincodeServiceable
};
