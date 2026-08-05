const { Pool } = require('pg');

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return console.error('DATABASE_URL not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC;");
    console.log('ORDER STATUSES:');
    for (const row of res.rows) {
      console.log(`${row.status} - ${row.count}`);
    }
  } catch (err) {
    console.error('ERROR', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
