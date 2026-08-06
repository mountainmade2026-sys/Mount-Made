require('dotenv').config();
(async () => {
  try {
    const User = require('../models/User');
    const email = process.env.CRAFTER_EMAIL || 'craft@345';
    const password = process.env.CRAFTER_PASSWORD || 'Balmond@345';
    console.log('Creating crafter user:', email);
    const user = await User.ensureUser({
      email,
      password,
      full_name: 'Site Crafter',
      phone: '0000000000',
      role: 'crafter',
      is_approved: true,
      is_blocked: false
    });
    console.log('Result:', user);
    process.exit(0);
  } catch (err) {
    console.error('Failed to create crafter user:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
