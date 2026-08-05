const { Pool } = require('pg');
(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return console.error('DATABASE_URL not set');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'orders'::regclass AND conname = 'orders_status_check'");
    console.log(res.rows);
  } catch (err) {
    console.error('ERROR', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
