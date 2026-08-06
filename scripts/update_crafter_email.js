require('dotenv').config();
(async () => {
  try {
    const db = require('../config/database');
    const oldEmail = process.env.OLD_CRAFTER_EMAIL || 'craft@345';
    const newEmail = process.env.NEW_CRAFTER_EMAIL || 'craft@local.test';
    console.log('Updating crafter email:', oldEmail, '->', newEmail);
    const result = await db.query('UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = LOWER($2) RETURNING id, email', [newEmail, oldEmail]);
    if (result.rows.length === 0) {
      console.error('No user updated. No matching user found for', oldEmail);
      process.exit(2);
    }
    console.log('Updated user:', result.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Failed to update crafter email:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
