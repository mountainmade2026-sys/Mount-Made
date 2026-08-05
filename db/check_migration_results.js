const { Pool } = require('pg');

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return console.error('DATABASE_URL not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    console.log('STATUS COUNTS:');
    const counts = await client.query("SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC;");
    console.table(counts.rows);

    console.log('\nSAMPLE ORDERS WITH status IN (\'pending\', \'payment_pending\')');
    const sample = await client.query("SELECT id, order_number, status, payment_status, paid_at, created_at FROM orders WHERE status IN ('pending','payment_pending') ORDER BY created_at DESC LIMIT 20;");
    console.table(sample.rows);
  } catch (err) {
    console.error('ERROR', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
