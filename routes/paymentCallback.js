const express = require('express');
const db = require('../config/database');

const router = express.Router();

/**
 * Payment Callback Route
 * This route is called by IDFC payment gateway after payment is completed
 * It handles both successful and failed payment scenarios
 * 
 * Query params:
 * - transactionId: Internal transaction ID
 * - sessionId: IDFC session ID
 * - responseCode: Payment response code (0 = success)
 * - responseMessage: Payment response message
 * - orderId: Mount Made order ID
 */
router.get('/payment-callback', async (req, res) => {
  try {
    const {
      transactionId,
      sessionId,
      responseCode,
      responseMessage,
      orderId
    } = req.query || {};

    // Log callback for debugging
    console.log('Payment callback received:', {
      transactionId,
      sessionId,
      responseCode,
      responseMessage,
      orderId
    });

    if (!transactionId || !sessionId) {
      return res.status(400).render('payment-error', {
        title: 'Payment Failed',
        message: 'Missing payment verification parameters. Please contact support.',
        transactionId: transactionId || 'N/A'
      });
    }

    // Verify payment session exists
    const sessionResult = await db.query(
      'SELECT * FROM payment_sessions WHERE transaction_id = $1 AND session_id = $2',
      [transactionId, sessionId]
    );

    if (!sessionResult.rows || !sessionResult.rows[0]) {
      return res.status(404).render('payment-error', {
        title: 'Payment Session Not Found',
        message: 'The payment session could not be found. Please contact support.',
        transactionId: transactionId
      });
    }

    const paymentSession = sessionResult.rows[0];

    // Check if payment was successful
    if (responseCode !== '0' && responseCode !== 0) {
      // Payment failed
      await db.query(
        `UPDATE payment_sessions 
         SET response_code = $1, response_message = $2
         WHERE transaction_id = $3`,
        [responseCode, responseMessage, transactionId]
      );

      return res.status(200).render('payment-error', {
        title: 'Payment Failed',
        message: responseMessage || 'Your payment could not be processed. Please try again.',
        transactionId: transactionId,
        responseCode: responseCode
      });
    }

    // Payment successful
    await db.query(
      `UPDATE payment_sessions 
       SET verified_at = NOW(), response_code = $1, response_message = $2
       WHERE transaction_id = $3`,
      [responseCode, responseMessage, transactionId]
    );

    // Fetch the order details
    const orderResult = await db.query(
      'SELECT * FROM orders WHERE payment_gateway_transaction_id = $1',
      [transactionId]
    );

    if (!orderResult.rows || !orderResult.rows[0]) {
      // Order might not be created yet if verification endpoint wasn't called
      // This is okay - the payment is still verified
      return res.render('payment-success', {
        title: 'Payment Successful',
        message: 'Your payment has been successfully processed.',
        transactionId: transactionId,
        orderNumber: paymentSession.udf1 || 'Pending'
      });
    }

    const order = orderResult.rows[0];

    // Render success page
    return res.render('payment-success', {
      title: 'Payment Successful',
      message: 'Your payment has been successfully processed. Your order is being prepared.',
      transactionId: transactionId,
      orderNumber: order.order_number,
      orderAmount: order.total_amount,
      orderId: order.id
    });
  } catch (error) {
    console.error('Payment callback error:', error);
    return res.status(500).render('payment-error', {
      title: 'Payment Processing Error',
      message: 'An error occurred while processing your payment. Please contact support.',
      error: error.message
    });
  }
});

/**
 * Payment Status Check Route (Public)
 * This route allows checking payment status by transaction ID
 */
router.get('/payment-status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const result = await db.query(
      'SELECT * FROM payment_sessions WHERE transaction_id = $1',
      [transactionId]
    );

    if (!result.rows || !result.rows[0]) {
      return res.status(404).json({
        error: 'Payment session not found',
        transactionId: transactionId
      });
    }

    const session = result.rows[0];

    // Fetch associated order
    const orderResult = await db.query(
      'SELECT id, order_number, total_amount, payment_status FROM orders WHERE payment_gateway_transaction_id = $1',
      [transactionId]
    );

    const order = orderResult.rows ? orderResult.rows[0] : null;

    return res.json({
      success: true,
      transactionId: session.transaction_id,
      sessionId: session.session_id,
      status: session.verified_at ? 'verified' : (session.response_code === '0' ? 'successful' : 'failed'),
      responseCode: session.response_code,
      responseMessage: session.response_message,
      webhookReceived: !!session.webhook_received_at,
      createdAt: session.created_at,
      verifiedAt: session.verified_at,
      webhookReceivedAt: session.webhook_received_at,
      order: order ? {
        id: order.id,
        orderNumber: order.order_number,
        totalAmount: order.total_amount,
        paymentStatus: order.payment_status
      } : null
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    return res.status(500).json({
      error: 'Failed to check payment status',
      message: error.message
    });
  }
});

module.exports = router;
