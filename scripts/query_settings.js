(async () => {
  try {
    const db = require('../config/database');
    const res = await db.query("SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('privacy_policy_title','privacy_policy_body')");
    console.log(JSON.stringify(res.rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
    process.exit(2);
  }
})();
