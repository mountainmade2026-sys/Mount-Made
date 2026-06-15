const Product = require('../models/Product');
const db = require('../config/database');

function buildRelatedProducts(products, currentProduct, limit = 6) {
  const items = Array.isArray(products) ? products.filter(Boolean) : [];
  const currentId = currentProduct?.id != null ? Number(currentProduct.id) : null;

  const activeItems = items.filter((item) => {
    if (!item || item.id == null) return false;
    if (currentId != null && Number(item.id) === currentId) return false;
    return item.is_active !== false;
  });

  const sameCategory = currentProduct?.category_id != null
    ? activeItems.filter((item) => Number(item.category_id) === Number(currentProduct.category_id))
    : [];

  const fallback = sameCategory.length >= limit
    ? sameCategory.slice(0, limit)
    : sameCategory.concat(activeItems.filter((item) => !sameCategory.includes(item))).slice(0, limit);

  if (fallback.length >= limit) {
    return fallback.slice(0, limit);
  }

  return activeItems.slice(0, limit);
}

exports.buildRelatedProducts = buildRelatedProducts;

exports.getAllProducts = async (req, res) => {
  try {
    const { category_id, search, min_price, max_price, limit, offset } = req.query;

    // Base filters (without price range) to compute dynamic price bounds
    const baseFilters = {
      category_id,
      search,
      limit: null,
      offset: null
    };

    const allForRange = await Product.findAll(baseFilters);
    let priceRange = null;

    if (allForRange.length > 0) {
      const prices = allForRange
        .map(p => (p.price != null ? parseFloat(p.price) : null))
        .filter(v => Number.isFinite(v));

      if (prices.length > 0) {
        priceRange = {
          min: Math.min(...prices),
          max: Math.max(...prices)
        };
      }
    }

    const minPriceNum = min_price !== undefined ? parseFloat(min_price) : null;
    const maxPriceNum = max_price !== undefined ? parseFloat(max_price) : null;

    const filters = {
      category_id,
      search,
      min_price: Number.isFinite(minPriceNum) ? minPriceNum : null,
      max_price: Number.isFinite(maxPriceNum) ? maxPriceNum : null,
      limit: limit ? parseInt(limit) : null,
      offset: offset ? parseInt(offset) : null
    };

    const products = await Product.findAll(filters);
    res.json({ products, priceRange });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

exports.getCarouselProducts = async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 16) : 8;

    const query = `
      SELECT
        id,
        name,
        price,
        discount_price,
        wholesale_price,
        stock_quantity,
        image_url,
        created_at
      FROM products
      WHERE COALESCE(is_active, true) = true
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await db.query(query, [limit]);
    return res.json({ products: result.rows || [] });
  } catch (error) {
    console.error('Get carousel products error:', error);
    return res.status(500).json({ error: 'Failed to fetch carousel products.' });
  }
};

// Search suggestions for homepage search bar (products + categories)
exports.getSearchSuggestions = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    if (!q) {
      return res.json({ suggestions: [] });
    }

    const term = `%${q}%`;

    const [productResult, categoryResult] = await Promise.all([
      db.query(
        `SELECT id, name, image_url, price, discount_price
         FROM products
         WHERE COALESCE(is_active, true) = true AND name ILIKE $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [term]
      ),
      db.query(
        `SELECT id, name, image_url
         FROM categories
         WHERE name ILIKE $1
         ORDER BY name ASC
         LIMIT 5`,
        [term]
      )
    ]);

    const suggestions = [
      ...productResult.rows.map(p => ({
        type: 'product',
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        price: p.price,
        discount_price: p.discount_price
      })),
      ...categoryResult.rows.map(c => ({
        type: 'category',
        id: c.id,
        name: c.name,
        image_url: c.image_url
      }))
    ];

    res.json({ suggestions });
  } catch (error) {
    console.error('Get search suggestions error:', error);
    res.status(500).json({ error: 'Failed to fetch search suggestions.' });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
};

exports.getRelatedProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Number.parseInt(req.query.limit, 10) || 6;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const candidates = await Product.findAll({ limit: Math.max(24, limit + 8) });
    const relatedProducts = buildRelatedProducts(candidates, product, limit);

    res.json({
      product_id: Number(id),
      related_products: relatedProducts
    });
  } catch (error) {
    console.error('Get related products error:', error);
    res.status(500).json({ error: 'Failed to fetch related products.' });
  }
};

exports.getProductRatings = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const result = await db.query(`
      SELECT
        pr.id,
        pr.rating,
        pr.review,
        pr.created_at,
        u.id AS user_id,
        u.full_name AS user_name
      FROM product_ratings pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.product_id = $1
      ORDER BY pr.created_at DESC
      LIMIT 20
    `, [id]);

    res.json({
      product_id: Number(id),
      summary: {
        average_rating: Number(product.average_rating || 0),
        rating_count: Number(product.rating_count || 0)
      },
      ratings: result.rows || []
    });
  } catch (error) {
    console.error('Get product ratings error:', error);
    res.status(500).json({ error: 'Failed to fetch ratings.' });
  }
};

exports.submitProductRating = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const rawRating = Number(req.body?.rating);
    const review = typeof req.body?.review === 'string' ? req.body.review.trim().slice(0, 500) : null;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to rate products.' });
    }

    if (!Number.isFinite(rawRating) || rawRating < 1 || rawRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const normalizedRating = Math.round(rawRating);

    await db.query(`
      INSERT INTO product_ratings (product_id, user_id, rating, review, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id, user_id)
      DO UPDATE SET rating = EXCLUDED.rating,
                    review = EXCLUDED.review,
                    updated_at = CURRENT_TIMESTAMP
    `, [id, userId, normalizedRating, review || null]);

    const summaryResult = await db.query(`
      SELECT
        COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS average_rating,
        COUNT(*)::int AS rating_count
      FROM product_ratings
      WHERE product_id = $1
    `, [id]);

    const summary = summaryResult.rows[0] || {};

    res.json({
      success: true,
      product_id: Number(id),
      rating: normalizedRating,
      review: review || null,
      average_rating: Number(summary.average_rating || 0),
      rating_count: Number(summary.rating_count || 0)
    });
  } catch (error) {
    console.error('Submit product rating error:', error);
    res.status(500).json({ error: 'Failed to save rating.' });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Product.getAllCategories();
    res.json({ categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories.' });
  }
};

exports.getProductsByCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const products = await Product.findAll({ category_id: id });
    const category = await Product.getCategoryById(id);

    res.json({ 
      category,
      products 
    });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

exports.getHomepageSections = async (req, res) => {
  try {
    const query = `
      SELECT 
        hs.id,
        hs.name,
        hs.description,
        hs.heading_image_url,
        hs.sort_order,
        json_agg(
          json_build_object(
            'id', p.id,
            'name', p.name,
            'description', p.description,
              'price', p.price,
              'discount_price', p.discount_price,
              'discount_percentage', p.discount_percentage,
              'wholesale_price', p.wholesale_price,
            'stock_quantity', p.stock_quantity,
            'image_url', p.image_url,
            'images', p.images,
            'unit', p.unit,
            'category_id', p.category_id,
            'min_wholesale_qty', p.min_wholesale_qty
          ) ORDER BY p.created_at DESC
        ) FILTER (WHERE p.id IS NOT NULL) as products
      FROM homepage_sections hs
      LEFT JOIN products p ON hs.id = p.homepage_section_id AND COALESCE(p.is_active, true) = true
      WHERE hs.is_active = true
      GROUP BY hs.id, hs.name, hs.description, hs.heading_image_url, hs.sort_order
      ORDER BY hs.sort_order ASC, hs.created_at ASC
    `;
    
    const result = await db.query(query);
    res.json({ sections: result.rows });
  } catch (error) {
    console.error('Get homepage sections error:', error);
    res.status(500).json({ error: 'Failed to fetch homepage sections.' });
  }
};

exports.getSiteSettings = async (req, res) => {
  try {
    const result = await db.query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json({ settings });
  } catch (error) {
    console.error('Get site settings error:', error);
    res.json({ settings: {} }); // Return empty settings on error
  }
};
