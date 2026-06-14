const test = require('node:test');
const assert = require('node:assert/strict');

const { getRatingSummaryText, buildStarMarkup } = require('../utils/productRatings');

test('getRatingSummaryText returns a usable label for average and count', () => {
  assert.equal(getRatingSummaryText(4.5, 12), '4.5/5 • 12 ratings');
  assert.equal(getRatingSummaryText(0, 0), 'No ratings yet');
});

test('buildStarMarkup renders filled and empty stars for a given average', () => {
  const markup = buildStarMarkup(4, { size: '1rem' });
  assert.match(markup, /★/);
  assert.match(markup, /☆/);
  assert.match(markup, /4\.0/);
});
