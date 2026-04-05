require('dotenv').config();
const db = require('../config/database');

(async () => {
  try {
    await db.query("SELECT setval('uploads_id_seq', 1000000)");
    const r = await db.query("SELECT last_value FROM uploads_id_seq");
    console.log('uploads_id_seq reset to:', r.rows[0].last_value);
    console.log('New uploads will start at ID 1000001 — never cached by any browser.');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
