const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRelatedProducts } = require('../controllers/productController');

test('buildRelatedProducts keeps the current product out and limits suggestions', () => {
  const current = { id: 7, category_id: 3 };
  const products = [
    { id: 7, name: 'Current', category_id: 3 },
    { id: 8, name: 'One', category_id: 3 },
    { id: 9, name: 'Two', category_id: 3 },
    { id: 10, name: 'Three', category_id: 3 },
    { id: 11, name: 'Four', category_id: 3 },
    { id: 12, name: 'Five', category_id: 3 },
    { id: 13, name: 'Six', category_id: 3 },
  ];

  const related = buildRelatedProducts(products, current, 5);

  assert.equal(related.length, 5);
  assert.ok(related.every(product => product.id !== current.id));
  assert.equal(related[0].id, 8);
});

test('buildRelatedProducts falls back to recent products when the category is missing', () => {
  const current = { id: 22, category_id: null };
  const products = [
    { id: 22, name: 'Current', category_id: null },
    { id: 23, name: 'Fresh item', category_id: 1 },
  ];

  const related = buildRelatedProducts(products, current, 4);

  assert.equal(related.length, 1);
  assert.equal(related[0].id, 23);
});
