const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl);

const orderQueue = new Queue('orders', { connection });

module.exports = { orderQueue, connection };
