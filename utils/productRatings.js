function clampRating(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(5, Math.max(0, numericValue));
}

function formatAverageRating(value) {
  const numericValue = clampRating(value);
  return numericValue % 1 === 0 ? numericValue.toFixed(0) : numericValue.toFixed(1);
}

function getRatingSummaryText(averageRating, reviewCount) {
  const safeAverage = clampRating(averageRating);
  const safeCount = Number.isFinite(Number(reviewCount)) ? Math.max(0, Number(reviewCount)) : 0;

  if (safeCount === 0) {
    return 'No ratings yet';
  }

  return `${formatAverageRating(safeAverage)}/5 • ${safeCount} rating${safeCount === 1 ? '' : 's'}`;
}

function buildStarMarkup(averageRating, options = {}) {
  const safeAverage = clampRating(averageRating);
  const size = options.size || '1rem';
  const fullStars = Math.floor(safeAverage);
  const hasHalf = safeAverage - fullStars >= 0.5;
  const stars = [];

  for (let index = 0; index < 5; index += 1) {
    if (index < fullStars) {
      stars.push(`<span aria-hidden="true" style="color:#f59e0b;font-size:${size};">★</span>`);
      continue;
    }

    if (index === fullStars && hasHalf) {
      stars.push(`<span aria-hidden="true" style="color:#f59e0b;font-size:${size};">★</span>`);
      continue;
    }

    stars.push(`<span aria-hidden="true" style="color:#cbd5e1;font-size:${size};">☆</span>`);
  }

  return `${stars.join('')}<span style="font-size:${size}; color:var(--text-secondary,#64748b); margin-left:0.35rem;">${safeAverage.toFixed(1)} / 5</span>`;
}

module.exports = {
  clampRating,
  formatAverageRating,
  getRatingSummaryText,
  buildStarMarkup,
};
