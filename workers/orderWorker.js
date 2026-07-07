const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const Order = require('../models/Order');
const db = require('../config/database');
const { sendOrderNotificationToAdmin } = require('../utils/emailService');
const { notifyOrderPlaced } = require('../utils/whatsappService');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl);

const concurrency = parseInt(process.env.ORDER_WORKER_CONCURRENCY || '5', 10);

const worker = new Worker('orders', async (job) => {
  const { orderData } = job.data || {};
  if (!orderData) throw new Error('Missing order data');

  // Create order using existing logic in Order.create
  const order = await Order.create(orderData);

  // Send notifications (email + whatsapp)
  try {
    const [userResult, itemsResult] = await Promise.all([
      db.query('SELECT full_name, phone FROM users WHERE id = $1', [order.user_id]),
      db.query('SELECT product_name, quantity, price FROM order_items WHERE order_id = $1', [order.id])
    ]);
    const customer = userResult.rows[0] || {};
    const items = itemsResult.rows || [];
    await sendOrderNotificationToAdmin(order, customer, items);
    await notifyOrderPlaced(customer.phone, customer.full_name || 'Customer', order.order_number, order.total_amount);
  } catch (notifyErr) {
    console.error('Order notification failed for order', order.id, notifyErr);
  }

  return { success: true, orderId: order.id };
}, { connection, concurrency });

worker.on('completed', (job) => {
  console.log(`Order job completed: ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Order job failed: ${job?.id}`, err && (err.stack || err.message || err));
});

worker.on('error', (err) => {
  console.error('Order worker error:', err && (err.stack || err.message || err));
});

console.log('Order worker started with concurrency=', concurrency);

process.on('SIGINT', async () => { console.log('Shutting down worker...'); await worker.close(); process.exit(0); });
process.on('SIGTERM', async () => { console.log('Shutting down worker...'); await worker.close(); process.exit(0); });
