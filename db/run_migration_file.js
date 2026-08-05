const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node db/run_migration_file.js <sql-file-path>');
    process.exit(2);
  }

  const filePath = path.resolve(args[0]);
  if (!fs.existsSync(filePath)) {
    console.error('SQL file not found:', filePath);
    process.exit(3);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL env var is not set');
    process.exit(4);
  }

  // If connecting to cloud providers (Render, Neon, etc.) enable SSL by default
  const poolConfig = { connectionString, max: 2 };
  if (/render\.com|neon\.sh|supabase\.co|postgres\.amazonaws\.com/i.test(connectionString) || process.env.MIGRATION_SSL === '1') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);
  const client = await pool.connect();
  try {
    console.log('Connected to DB, running migration:', filePath);
    const res = await client.query(sql);
    console.log('Migration executed successfully. Result:', res && res.command ? res.command : 'OK');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
