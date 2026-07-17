(async () => {
  try {
    const db = require('../config/database');
    const title = 'Privacy Policy (from direct DB insert)';
    const body = 'This is a test privacy policy body inserted directly into the database for verification purposes.\n\nPlease replace via admin panel.';

    await db.query(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ($1, $2)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
    `, ['privacy_policy_title', title]);

    await db.query(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ($1, $2)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
    `, ['privacy_policy_body', body]);

    console.log('Inserted/updated privacy_policy_title and privacy_policy_body');
    process.exit(0);
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
