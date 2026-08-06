require('dotenv').config();
const db = require('../config/database');
(async () => {
  const client = await db.pool.connect();
  try {
    console.log('Altering users role constraint to include crafter...');
    await client.query(`ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check`);
    await client.query(`ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('customer','wholesale','admin','super_admin','crafter'))`);
    console.log('Constraint updated.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to update constraint:', err && err.message ? err.message : err);
    process.exit(2);
  } finally {
    client.release();
  }
})();
