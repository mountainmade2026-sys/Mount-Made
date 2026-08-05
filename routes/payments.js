const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const Razorpay = require('razorpay');
const db = require('../config/database');
const Order = require('../models/Order');
const { authenticateToken } = require('../middleware/auth');
const { blockAdminCommerce } = require('../middleware/commerceAccess');
const { sendOrderNotificationToAdmin } = require('../utils/emailService');
const { notifyOrderPlaced } = require('../utils/whatsappService');
const { getDeliveryChargeForSubtotal, parseProductGstOverrides, computeCartGst } = require('../utils/deliverySettings');

const router = express.Router();

// Expose an unauthenticated webhook handler for Razorpay.
// We export the handler so server.js can register it before global JSON body parsing.
const rawJson = express.raw({ type: 'application/json' });
async function razorpayWebhookHandler(req, res) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not configured');
      return res.status(501).send('Webhook not configured');
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) return res.status(400).send('Missing signature');

    const payload = req.body;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (expected !== signature) {
      console.warn('Invalid Razorpay webhook signature');
      return res.status(401).send('Invalid signature');
    }

    const event = JSON.parse(payload.toString());
    const evt = event.event;

    if (evt === 'payment.captured') {
      const payment = event.payload?.payment?.entity || {};
      const orderId = payment.order_id;
      const paymentId = payment.id;
      if (orderId) {
        await db.query(
          'UPDATE orders SET payment_status = $1, paid_at = NOW(), payment_gateway_payment_id = $2 WHERE payment_gateway_order_id = $3',
          ['paid', paymentId, orderId]
        );
        // Notify admin after marking paid (webhook path)
        try {
          const orderRes = await db.query('SELECT * FROM orders WHERE payment_gateway_order_id = $1', [orderId]);
          const order = orderRes.rows[0];
          if (order) {
            const [userResult, itemsResult] = await Promise.all([
              db.query('SELECT full_name, phone FROM users WHERE id = $1', [order.user_id]),
              db.query('SELECT product_name, quantity, price FROM order_items WHERE order_id = $1', [order.id])
            ]);
            const customer = userResult.rows[0] || {};
            const items = itemsResult.rows || [];
            await sendOrderNotificationToAdmin(order, customer, items);
            await notifyOrderPlaced(customer.phone, customer.full_name || 'Customer', order.order_number, order.total_amount);
          }
        } catch (notifyErr) {
          console.error('[EMAIL] Razorpay webhook notification failed:', notifyErr.message);
        }
      }
    } else if (evt === 'payment.failed') {
      const payment = event.payload?.payment?.entity || {};
      const orderId = payment.order_id;
      if (orderId) {
        await db.query(
          'UPDATE orders SET payment_status = $1 WHERE payment_gateway_order_id = $2',
          ['failed', orderId]
        );
      }
    } else if (evt === 'order.paid') {
      const orderEntity = event.payload?.order?.entity || {};
      const orderId = orderEntity.id;
      if (orderId) {
        await db.query(
          'UPDATE orders SET payment_status = $1, paid_at = NOW() WHERE payment_gateway_order_id = $2',
          ['paid', orderId]
        );
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Razorpay webhook error', err);
    return res.status(500).send('Error');
  }
}

// Route registration kept for completeness (works when raw body is available),
// but server.js will register the handler early to guarantee raw bytes.
router.post('/razorpay/webhook', rawJson, razorpayWebhookHandler);

router.use(authenticateToken);
router.use(blockAdminCommerce);

// IDFC Payment Gateway Configuration
const IDFC_CONFIG = {
  merchantId: process.env.IDFC_MERCHANT_ID || '',
  apiKey: process.env.IDFC_API_KEY || '',
  apiSecret: process.env.IDFC_API_SECRET || '',
  baseUrl: process.env.IDFC_BASE_URL || 'https://api.idfcbank.com/api/v1',
  redirectUrl: process.env.IDFC_REDIRECT_URL || 'http://localhost:3000/payment-callback',
  webhookUrl: process.env.IDFC_WEBHOOK_URL || 'http://localhost:3000/api/payments/idfc/webhook'
};
// Razorpay Payment Gateway Configuration
const RAZORPAY_CONFIG = {
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || ''
};

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    return null;
  }
  return String(value).trim();
}

async function getSiteSettings() {
  try {
    const result = await db.query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    for (const row of result.rows || []) {
      settings[row.setting_key] = row.setting_value;
    }
    return settings;
  } catch (_) {
    return {};
  }
}

function parseBool(value) {
  const raw = (value ?? '').toString().trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function parseNonNegativeNumber(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

async function fetchServerCart(userId, role) {
  const query = `
    SELECT c.id, c.quantity, c.product_id,
           p.name,
           p.price as original_price,
           COALESCE(p.discount_price, p.price) as retail_price,
           p.wholesale_price, p.image_url, p.stock_quantity,
           p.min_wholesale_qty,
           (CASE
             WHEN $2 = 'wholesale' AND c.quantity >= p.min_wholesale_qty
             THEN p.wholesale_price * c.quantity
             ELSE COALESCE(p.discount_price, p.price) * c.quantity
           END) as subtotal,
           (CASE
             WHEN $2 = 'wholesale' AND c.quantity >= p.min_wholesale_qty
             THEN p.wholesale_price
             ELSE COALESCE(p.discount_price, p.price)
           END) as price
    FROM cart c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = $1 AND p.is_active = true
    ORDER BY c.created_at DESC
  `;

  const result = await db.query(query, [userId, role]);
  const cartItems = result.rows || [];

  const total = cartItems.reduce((sum, item) => sum + Number.parseFloat(item.subtotal), 0);

  return {
    cartItems,
    total: Number.isFinite(total) ? total : 0
  };
}

function verifyIDFCSignature(data, signature, apiKey) {
  const body = JSON.stringify(data);
  const expected = crypto.createHmac('sha256', apiKey).update(body).digest('hex');
  return expected === signature;
}

const {
  normalizePincode,
  parseAvailablePincodes,
  isPincodeServiceable
} = require('../utils/pincodeAvailability');

// IDFC Payment Initiation Endpoint
router.post('/idfc/initiate', async (req, res) => {
  try {
    if (!IDFC_CONFIG.merchantId || !IDFC_CONFIG.apiKey || !IDFC_CONFIG.apiSecret) {
      return res.status(501).json({ error: 'IDFC payment gateway is not configured on server.' });
    }

    const {
      order,
      amount,
      paymentMethod,
      customerDetails
    } = req.body || {};

    if (!order || !amount || !customerDetails) {
      return res.status(400).json({ error: 'Missing required payment parameters.' });
    }

    const transactionId = `MM${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // IDFC Payment Request Data
    const paymentRequestData = {
      merchantId: IDFC_CONFIG.merchantId,
      transactionId: transactionId,
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      paymentMethod: paymentMethod === 'netbank' ? 'NB' : (paymentMethod === 'debit' ? 'DC' : 'CC'),
      orderId: order.id || order._id,
      orderNumber: order.order_number,
      customerName: customerDetails.name,
      customerEmail: customerDetails.email,
      customerPhone: customerDetails.phone,
      description: `Order #${order.order_number} - Mount Made`,
      redirectUrl: IDFC_CONFIG.redirectUrl,
      notifyUrl: IDFC_CONFIG.webhookUrl,
      udf1: order.order_number,
      udf2: paymentMethod,
      udf3: String(order.id || order._id)
    };

    // Generate IDFC request signature using the same amount value sent to IDFC
    const signatureString = `${transactionId}|${IDFC_CONFIG.merchantId}|${paymentRequestData.amount}|INR`;
    const signature = crypto.createHmac('sha256', IDFC_CONFIG.apiSecret)
      .update(signatureString)
      .digest('hex');

    paymentRequestData.signature = signature;

    // Call IDFC API to create payment session
    try {
      const idfcResponse = await axios.post(
        `${IDFC_CONFIG.baseUrl}/payments/initiate`,
        paymentRequestData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${IDFC_CONFIG.apiKey}`,
            'X-Merchant-Id': IDFC_CONFIG.merchantId
          },
          timeout: 10000
        }
      );

      if (!idfcResponse.data || !idfcResponse.data.sessionId) {
        throw new Error('Invalid IDFC response');
      }

      // Store payment session in database for verification later
      await db.query(
        `INSERT INTO payment_sessions 
         (order_id, payment_method, session_id, transaction_id, amount, merchant_id, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW() + INTERVAL '1 hour')
         ON CONFLICT (transaction_id) DO UPDATE SET session_id = $3`,
        [order.id || order._id, paymentMethod, idfcResponse.data.sessionId, transactionId, amount, IDFC_CONFIG.merchantId]
      );

      return res.json({
        success: true,
        sessionId: idfcResponse.data.sessionId,
        merchantId: IDFC_CONFIG.merchantId,
        transactionId: transactionId,
        paymentUrl: idfcResponse.data.paymentUrl || null,
        amount: amount,
        currency: 'INR'
      });
    } catch (idfcError) {
      const status = idfcError?.response?.status;
      const responseData = idfcError?.response?.data;
      console.error('IDFC API error:', idfcError.message, 'status:', status, 'data:', responseData);
      return res.status(502).json({
        error: 'Failed to connect with payment gateway',
        details: responseData || idfcError.message
      });
    }
  } catch (error) {
    console.error('IDFC initiate payment error:', error);
    return res.status(500).json({ error: 'Failed to initiate payment.' });
  }
});

// Razorpay Payment Initiation Endpoint - Using Payment Links for method-specific control
router.post('/razorpay/initiate', async (req, res) => {
  try {
    if (!RAZORPAY_CONFIG.keyId || !RAZORPAY_CONFIG.keySecret) {
      return res.status(501).json({ error: 'Razorpay is not configured on server.' });
    }

    const {
      order,
      amount,
      paymentMethod,
      customerDetails
    } = req.body || {};

    if (!order || !amount || !customerDetails) {
      return res.status(400).json({ error: 'Missing required payment parameters.' });
    }

    const paymentAmount = Math.round(amount * 100);
    const razorpay = new Razorpay({ key_id: RAZORPAY_CONFIG.keyId, key_secret: RAZORPAY_CONFIG.keySecret });

    // Create Payment Link - Payment Links API has basic parameters only
    const baseUrl = process.env.BASE_URL || 'https://mountmade.in';
    
    const paymentLinkBody = {
      amount: paymentAmount,
      currency: 'INR',
      accept_partial: false,
      description: `Order #${order.order_number}`,
      customer_notify: false,
      notify: {
        sms: false,
        email: false
      },
      reminder_enable: false,
      notes: {
        merchant_order_id: String(order.id || order._id),
        payment_method: paymentMethod,
        order_number: order.order_number
      },
      callback_url: `${baseUrl}/api/payments/razorpay/callback`,
      callback_method: 'get'
    };

    // Create the payment link
    console.log('Creating Razorpay payment link with body:', JSON.stringify(paymentLinkBody, null, 2));
    const paymentLink = await razorpay.paymentLink.create(paymentLinkBody);
    console.log('Razorpay payment link created:', paymentLink);

    if (!paymentLink || !paymentLink.id || !paymentLink.short_url) {
      console.error('Invalid payment link response:', paymentLink);
      throw new Error('Failed to create Razorpay payment link');
    }

    // Store payment link reference in database for tracking
    await db.query(
      `UPDATE orders SET payment_gateway_order_id = $1, payment_provider = 'razorpay'
       WHERE id = $2`,
      [paymentLink.id, order.id || order._id]
    );

    return res.json({
      success: true,
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.short_url,
      paymentLinkStatus: paymentLink.status,
      amount: paymentAmount,
      currency: 'INR',
      description: `Order #${order.order_number}`,
      paymentMethod: paymentMethod
    });
  } catch (error) {
    console.error('Razorpay initiate error:', error.message || error);
    if (error.response?.data) {
      console.error('Razorpay API response:', error.response.data);
    }
    return res.status(502).json({
      error: 'Failed to create Razorpay payment session',
      details: error.message
    });
  }
});

// Razorpay Payment Verification Endpoint
router.post('/razorpay/verify', async (req, res) => {
  try {
    if (!RAZORPAY_CONFIG.keyId || !RAZORPAY_CONFIG.keySecret) {
      return res.status(501).json({ error: 'Razorpay is not configured on server.' });
    }

    const {
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};

    // Support both payment link callbacks and order-based callbacks
    if (razorpay_payment_link_id && razorpay_payment_id) {
      // Payment Link flow
      const razorpay = new Razorpay({ key_id: RAZORPAY_CONFIG.keyId, key_secret: RAZORPAY_CONFIG.keySecret });

      // Fetch payment link details
      const paymentLink = await razorpay.paymentLink.fetch(razorpay_payment_link_id);

      if (!paymentLink) {
        return res.status(404).json({ error: 'Payment link not found.' });
      }

      // Verify payment link is paid
      if (paymentLink.status !== 'paid') {
        return res.status(400).json({ error: 'Payment link status is not paid.' });
      }

      // Find order by payment link ID
      const orderResult = await db.query(
        'SELECT * FROM orders WHERE payment_gateway_order_id = $1',
        [razorpay_payment_link_id]
      );

      if (!orderResult.rows || !orderResult.rows[0]) {
        return res.status(404).json({ error: 'Order not found for this payment link.' });
      }

      const order = orderResult.rows[0];

      // Update order with payment details
      await db.query(
        `UPDATE orders
         SET payment_status = 'paid', paid_at = NOW(), payment_gateway_payment_id = $1
         WHERE id = $2`,
        [razorpay_payment_id, order.id]
      );

      // Fire-and-forget admin notification
      const capturedUserId = order.user_id;
      const capturedOrderId = order.id;
      Promise.resolve().then(async () => {
        try {
          const [userResult, itemsResult] = await Promise.all([
            db.query('SELECT full_name, phone FROM users WHERE id = $1', [capturedUserId]),
            db.query('SELECT product_name, quantity, price FROM order_items WHERE order_id = $1', [capturedOrderId])
          ]);
          const customer = userResult.rows[0] || {};
          const items = itemsResult.rows || [];
          await sendOrderNotificationToAdmin(order, customer, items);
          await notifyOrderPlaced(customer.phone, customer.full_name || 'Customer', order.order_number, order.total_amount);
        } catch (notifErr) {
          console.error('[EMAIL] Razorpay order notification failed:', notifErr.message);
        }
      }).catch(err => console.error('[EMAIL] Unhandled Razorpay notification error:', err.message));

      return res.json({ success: true, message: 'Payment verified successfully via payment link.' });
    } else if (req.body.razorpay_order_id && req.body.razorpay_payment_id && req.body.razorpay_signature) {
      // Fallback to order-based verification for backward compatibility
      const expectedSignature = crypto.createHmac('sha256', RAZORPAY_CONFIG.keySecret)
        .update(`${req.body.razorpay_order_id}|${req.body.razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== req.body.razorpay_signature) {
        return res.status(400).json({ error: 'Invalid Razorpay signature.' });
      }

      const result = await db.query(
        'SELECT * FROM orders WHERE payment_gateway_order_id = $1',
        [req.body.razorpay_order_id]
      );

      if (!result.rows || !result.rows[0]) {
        return res.status(404).json({ error: 'Order not found for this Razorpay order ID.' });
      }

      const order = result.rows[0];

      await db.query(
        `UPDATE orders
         SET payment_status = 'paid', paid_at = NOW(), payment_gateway_payment_id = $1, payment_gateway_signature = $2
         WHERE id = $3`,
        [req.body.razorpay_payment_id, req.body.razorpay_signature, order.id]
      );

      // Fire-and-forget admin notification
      const capturedUserId = order.user_id;
      const capturedOrderId = order.id;
      Promise.resolve().then(async () => {
        try {
          const [userResult, itemsResult] = await Promise.all([
            db.query('SELECT full_name, phone FROM users WHERE id = $1', [capturedUserId]),
            db.query('SELECT product_name, quantity, price FROM order_items WHERE order_id = $1', [capturedOrderId])
          ]);
          const customer = userResult.rows[0] || {};
          const items = itemsResult.rows || [];
          await sendOrderNotificationToAdmin(order, customer, items);
          await notifyOrderPlaced(customer.phone, customer.full_name || 'Customer', order.order_number, order.total_amount);
        } catch (notifErr) {
          console.error('[EMAIL] Razorpay order notification failed:', notifErr.message);
        }
      }).catch(err => console.error('[EMAIL] Unhandled Razorpay notification error:', err.message));

      return res.json({ success: true, message: 'Payment verified successfully.' });
    } else {
      return res.status(400).json({ error: 'Missing payment verification parameters.' });
    }
  } catch (error) {
    console.error('Razorpay verify error:', error);
    return res.status(500).json({ error: 'Failed to verify Razorpay payment.' });
  }
});

// Razorpay Payment Link Callback Handler
router.get('/razorpay/callback', async (req, res) => {
  try {
    const {
      razorpay_payment_link_id,
      razorpay_payment_id,
      razorpay_payment_link_status,
      razorpay_payment_link_reference_id
    } = req.query || {};

    console.log('Razorpay Payment Link Callback:', {
      payment_link_id: razorpay_payment_link_id,
      payment_id: razorpay_payment_id,
      status: razorpay_payment_link_status
    });

    // Check if payment was successful
    if (razorpay_payment_link_status !== 'paid') {
      // Payment failed or was cancelled
      return res.redirect(`/checkout?error=Payment+was+${razorpay_payment_link_status || 'cancelled'}`);
    }

    // Verify payment with Razorpay API
    if (!RAZORPAY_CONFIG.keyId || !RAZORPAY_CONFIG.keySecret) {
      return res.redirect('/checkout?error=Payment+verification+failed');
    }

    try {
      const razorpay = new Razorpay({ key_id: RAZORPAY_CONFIG.keyId, key_secret: RAZORPAY_CONFIG.keySecret });
      const paymentLink = await razorpay.paymentLink.fetch(razorpay_payment_link_id);

      if (!paymentLink || paymentLink.status !== 'paid') {
        return res.redirect('/checkout?error=Payment+verification+failed');
      }

      // Find and update order
      const orderResult = await db.query(
        'SELECT * FROM orders WHERE payment_gateway_order_id = $1',
        [razorpay_payment_link_id]
      );

      if (!orderResult.rows || !orderResult.rows[0]) {
        return res.redirect('/checkout?error=Order+not+found');
      }

      const order = orderResult.rows[0];

      // Update order with payment details
      await db.query(
        `UPDATE orders
         SET payment_status = 'paid', paid_at = NOW(), payment_gateway_payment_id = $1
         WHERE id = $2`,
        [razorpay_payment_id, order.id]
      );

      // Fire-and-forget admin notification
      const capturedUserId = order.user_id;
      const capturedOrderId = order.id;
      Promise.resolve().then(async () => {
        try {
          const [userResult, itemsResult] = await Promise.all([
            db.query('SELECT full_name, phone FROM users WHERE id = $1', [capturedUserId]),
            db.query('SELECT product_name, quantity, price FROM order_items WHERE order_id = $1', [capturedOrderId])
          ]);
          const customer = userResult.rows[0] || {};
          const items = itemsResult.rows || [];
          await sendOrderNotificationToAdmin(order, customer, items);
          await notifyOrderPlaced(customer.phone, customer.full_name || 'Customer', order.order_number, order.total_amount);
        } catch (notifErr) {
          console.error('[EMAIL] Razorpay callback notification failed:', notifErr.message);
        }
      }).catch(err => console.error('[EMAIL] Unhandled Razorpay callback error:', err.message));

      // Redirect to success page
      return res.redirect(`/delivery-confirm.html?order=${order.id}`);
    } catch (error) {
      console.error('Razorpay callback verification error:', error);
      return res.redirect('/checkout?error=Verification+error');
    }
  } catch (error) {
    console.error('Razorpay callback error:', error);
    return res.redirect('/checkout?error=Callback+error');
  }
});

router.post('/idfc/verify', async (req, res) => {
  try {
    if (!IDFC_CONFIG.merchantId || !IDFC_CONFIG.apiKey) {
      return res.status(501).json({ error: 'IDFC payment gateway is not configured on server.' });
    }

    const {
      sessionId,
      transactionId,
      responseCode,
      responseMessage,
      amount,
      shipping_address,
      delivery_charge = 0
    } = req.body || {};

    if (!sessionId || !transactionId) {
      return res.status(400).json({ error: 'Missing payment verification parameters.' });
    }

    // Verify PIN code
    const shippingPostalCode = normalizePincode(
      shipping_address?.postal_code || shipping_address?.zip || shipping_address?.pincode
    );
    if (shippingPostalCode.length !== 6) {
      return res.status(400).json({ error: 'A valid 6-digit delivery PIN code is required.' });
    }

    const siteSettings = await getSiteSettings();
    if (!isPincodeServiceable(shippingPostalCode, String(siteSettings.cod_available_pincodes || ''))) {
      return res.status(400).json({ error: 'Delivery is not available at the provided PIN code.' });
    }

    // Verify response code (0 = success)
    if (responseCode !== '0' && responseCode !== 0) {
      return res.status(400).json({
        error: 'Payment failed',
        message: responseMessage || 'The payment could not be processed'
      });
    }

    // Retrieve session from database for verification
    const sessionResult = await db.query(
      'SELECT * FROM payment_sessions WHERE session_id = $1 AND transaction_id = $2',
      [sessionId, transactionId]
    );

    if (!sessionResult.rows || !sessionResult.rows[0]) {
      return res.status(400).json({ error: 'Payment session not found.' });
    }

    const paymentSession = sessionResult.rows[0];
    const orderId = paymentSession.order_id;

    // Get server cart to verify amount
    const { cartItems, total } = await fetchServerCart(req.user.id, req.user.role);
    if (!cartItems.length) {
      return res.status(400).json({
        error: 'Your cart is empty. Please contact support with your transaction ID.'
      });
    }

    const gstOverrides = parseProductGstOverrides(siteSettings);
    const gst = computeCartGst(cartItems, gstOverrides);
    const serverDeliveryCharge = getDeliveryChargeForSubtotal(total, siteSettings, gst);
    const serverTotalAmount = (Number(total) || 0) + serverDeliveryCharge + gst;

    // Verify amount matches
    if (Math.round(Number(amount) || 0) !== Math.round(serverTotalAmount)) {
      return res.status(409).json({
        error: 'Payment amount mismatch. Cart total may have changed.',
        server_amount: serverTotalAmount,
        paid_amount: amount
      });
    }

    // Create order in database
    const items = cartItems.map(item => ({
      product_id: item.product_id,
      product_name: item.name,
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Number(item.price) || 0,
      subtotal: Number(item.subtotal) || 0
    }));

    const orderData = {
      user_id: req.user.id,
      total_amount: serverTotalAmount,
      gst: gst,
      shipping_address: shipping_address || {},
      payment_method: paymentSession.payment_method,
      payment_provider: 'idfc',
      payment_status: 'paid',
      payment_currency: 'INR',
      payment_amount: serverTotalAmount,
      payment_gateway_order_id: orderId,
      payment_gateway_transaction_id: transactionId,
      payment_gateway_session_id: sessionId,
      paid_at: new Date(),
      notes: `IDFC Payment | Transaction: ${transactionId}`,
      delivery_speed: 'standard',
      delivery_charge: serverDeliveryCharge,
      items
    };

    const order = await Order.create(orderData);

    // Mark session as verified
    await db.query(
      'UPDATE payment_sessions SET verified_at = NOW() WHERE session_id = $1',
      [sessionId]
    );

    // Fire-and-forget admin notification — does NOT block the payment response
    const capturedUserId = req.user.id;
    const capturedOrderId = order.id;
    Promise.resolve().then(async () => {
      try {
        const [userResult, itemsResult] = await Promise.all([
          db.query('SELECT full_name, phone FROM users WHERE id = $1', [capturedUserId]),
          db.query('SELECT product_name, quantity, price FROM order_items WHERE order_id = $1', [capturedOrderId])
        ]);
        const customer = userResult.rows[0] || {};
        const notifItems = itemsResult.rows || [];
        await sendOrderNotificationToAdmin(order, customer, notifItems);
        await notifyOrderPlaced(customer.phone, customer.full_name || 'Customer', order.order_number, order.total_amount);
      } catch (notifErr) {
        console.error('[EMAIL] IDFC order notification failed:', notifErr.message);
      }
    }).catch(err => console.error('[EMAIL] Unhandled IDFC notification error:', err.message));

    return res.status(201).json({
      message: 'Payment verified and order placed successfully.',
      order
    });
  } catch (error) {
    console.error('IDFC verify error:', error);
    return res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

// IDFC Webhook Handler - for async payment verification
router.post('/idfc/webhook', async (req, res) => {
  try {
    const {
      transactionId,
      sessionId,
      orderId,
      amount,
      responseCode,
      responseMessage,
      signature
    } = req.body || {};

    // Verify webhook signature
    const webhookData = {
      transactionId,
      sessionId,
      orderId,
      amount,
      responseCode,
      responseMessage
    };

    const signatureString = JSON.stringify(webhookData);
    const expectedSignature = crypto.createHmac('sha256', IDFC_CONFIG.apiSecret)
      .update(signatureString)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('IDFC webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Update payment session with webhook response
    await db.query(
      `UPDATE payment_sessions 
       SET webhook_response_code = $1, webhook_response_message = $2, webhook_received_at = NOW()
       WHERE transaction_id = $3`,
      [responseCode, responseMessage, transactionId]
    );

    // If payment successful (responseCode = 0), mark order as paid
    if (responseCode === '0' || responseCode === 0) {
      await db.query(
        `UPDATE orders 
         SET payment_status = 'paid', paid_at = NOW()
         WHERE payment_gateway_transaction_id = $1`,
        [transactionId]
      );
    }

    return res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('IDFC webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Payment Status Check - to verify payment was successful
router.get('/idfc/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const result = await db.query(
      'SELECT * FROM payment_sessions WHERE transaction_id = $1',
      [transactionId]
    );

    if (!result.rows || !result.rows[0]) {
      return res.status(404).json({ error: 'Payment session not found' });
    }

    const session = result.rows[0];

    return res.json({
      transactionId: session.transaction_id,
      sessionId: session.session_id,
      orderId: session.order_id,
      status: session.verified_at ? 'verified' : 'pending',
      responseCode: session.webhook_response_code,
      responseMessage: session.webhook_response_message,
      createdAt: session.created_at,
      verifiedAt: session.verified_at,
      webhookReceivedAt: session.webhook_received_at
    });
  } catch (error) {
    console.error('IDFC status check error:', error);
    return res.status(500).json({ error: 'Failed to check payment status' });
  }
});

module.exports = router;
