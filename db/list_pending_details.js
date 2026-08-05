const { Pool } = require('pg');

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return console.error('DATABASE_URL not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT id, order_number, status, payment_method, payment_provider, payment_status, paid_at, created_at FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50;");
    console.log('PENDING ROWS:');
    console.table(res.rows);
  } catch (err) {
    console.error('ERROR', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
