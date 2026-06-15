const db = require('../config/database');
const Product = require('../models/Product');
const { getWeightMultiplier } = require('../utils/weightPricing');

async function buildCartSummary(userId, role) {
  const query = `
    SELECT c.id, c.quantity, c.product_id, c.weight_label, c.weight_value, c.weight_unit,
           p.name,
           p.price,
           p.discount_price,
           p.wholesale_price,
           p.image_url,
           p.stock_quantity,
           p.min_wholesale_qty,
           p.weight,
           p.weight_unit,
           p.unit
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = $1 AND p.is_active = true
    ORDER BY c.created_at DESC
  `;

  const result = await db.query(query, [userId]);
  const cartItems = result.rows.map((item) => {
    const basePrice = Number.parseFloat(item.price || 0);
    const discountPrice = item.discount_price != null ? Number.parseFloat(item.discount_price) : null;
    const retailPrice = discountPrice != null && discountPrice < basePrice ? discountPrice : basePrice;
    const isWholesale = String(role || '').toLowerCase() === 'wholesale' && Number(item.quantity) >= Number(item.min_wholesale_qty || 0);
    const unitPrice = isWholesale && item.wholesale_price != null
      ? Number.parseFloat(item.wholesale_price)
      : retailPrice;

    const multiplier = getWeightMultiplier(item, item);
    const price = unitPrice * multiplier;
    const subtotal = price * Number(item.quantity || 1);

    return {
      ...item,
      original_price: basePrice,
      retail_price: retailPrice,
      price,
      subtotal,
      weight_multiplier: multiplier,
      is_weight_based: Number(item.weight || 0) > 0 || item.weight_value != null
    };
  });

  const total = cartItems.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);

  return {
    cartItems,
    total: Math.round(total * 100) / 100,
    itemCount: cartItems.length
  };
}

async function ensureCartIndexes() {
  await db.query('CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart (user_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_cart_user_product ON cart (user_id, product_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_cart_id_user_id ON cart (id, user_id)');
}

exports.getCart = async (req, res) => {
  try {
    await ensureCartIndexes();

    const summary = await buildCartSummary(req.user.id, req.user.role);

    res.json(summary);
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'Failed to fetch cart.' });
  }
};

exports.addToCart = async (req, res) => {
  try {
    await ensureCartIndexes();

    const product_id = parseInt(req.body.product_id, 10);
    const quantity = parseInt(req.body.quantity, 10);
    const weightLabel = String(req.body.weight_label || req.body.selected_weight_label || req.body.variant_label || '').trim() || null;
    const weightValue = String(req.body.weight_value || req.body.selected_weight || '').trim() || null;
    const weightUnit = String(req.body.weight_unit || '').trim() || null;

    if (!product_id || isNaN(product_id) || isNaN(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Valid product ID and quantity are required.' });
    }

    // Check if product exists and has stock
    const product = await Product.findById(product_id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    if ((product.stock_quantity || 0) <= 0) {
      return res.status(400).json({ error: 'This product is out of stock.' });
    }
    if (product.stock_quantity < quantity) {
      return res.status(400).json({ error: `Only ${product.stock_quantity} item(s) available in stock.` });
    }

    // Check if item already in cart
    const existingItem = await db.query(
      'SELECT * FROM cart WHERE user_id = $1 AND product_id = $2',
      [req.user.id, product_id]
    );

    if (existingItem.rows.length > 0) {
      // Update quantity — use Number() to ensure numeric addition, not string concatenation
      const newQuantity = Number(existingItem.rows[0].quantity) + quantity;
      
      if (product.stock_quantity < newQuantity) {
        return res.status(400).json({ error: `Only ${product.stock_quantity} item(s) available in stock.` });
      }

      await db.query(
        'UPDATE cart SET quantity = $1, weight_label = COALESCE($4, weight_label), weight_value = COALESCE($5, weight_value), weight_unit = COALESCE($6, weight_unit), updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND product_id = $3',
        [newQuantity, req.user.id, product_id, weightLabel, weightValue, weightUnit]
      );
    } else {
      // Add new item
      await db.query(
        'INSERT INTO cart (user_id, product_id, quantity, weight_label, weight_value, weight_unit) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.user.id, product_id, quantity, weightLabel, weightValue, weightUnit]
      );
    }

    res.json({ message: 'Product added to cart successfully.' });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Failed to add product to cart.' });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    await ensureCartIndexes();

    const { id } = req.params;
    const quantity = parseInt(req.body.quantity, 10);

    if (isNaN(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Valid quantity is required.' });
    }

    // Get cart item
    const cartItem = await db.query(
      'SELECT c.*, p.stock_quantity FROM cart c JOIN products p ON c.product_id = p.id WHERE c.id = $1 AND c.user_id = $2',
      [id, req.user.id]
    );

    if (cartItem.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    if (cartItem.rows[0].stock_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock available.' });
    }

    await db.query(
      'UPDATE cart SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, id]
    );

    const summary = await buildCartSummary(req.user.id, req.user.role);

    res.json({
      message: 'Cart updated successfully.',
      ...summary
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Failed to update cart.' });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    await ensureCartIndexes();

    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM cart WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    res.json({ message: 'Item removed from cart.' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Failed to remove item from cart.' });
  }
};

exports.clearCart = async (req, res) => {
  try {
    await ensureCartIndexes();

    await db.query('DELETE FROM cart WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Cart cleared successfully.' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Failed to clear cart.' });
  }
};
