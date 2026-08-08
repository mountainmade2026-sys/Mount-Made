function slugifyText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
}

function createProductSlug(product) {
  const base = slugifyText(product?.name || product?.product_name || 'product');
  const seed = [
    product?.id != null ? String(product.id) : '',
    product?.name || product?.product_name || '',
    product?.created_at || product?.createdAt || '',
    product?.category_name || product?.category || '',
    product?.barcode || ''
  ].filter(Boolean).join('|');

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }

  const suffix = Math.abs(hash).toString(36);
  return suffix ? `${base}-${suffix}` : base;
}

module.exports = {
  slugifyText,
  createProductSlug
};
