const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { adminCheck } = require('../middleware/adminCheck');
const { sendWhatsAppMessage, getWhatsAppLink, formatPhone } = require('../utils/whatsappService');

// All routes require admin auth
router.use(authenticateToken);
router.use(adminCheck);

/**
 * POST /api/whatsapp/send
 * Admin sends a custom WhatsApp message to a customer.
 * Body: { phone, message }
 * Returns: { sent: true } or { sent: false, waLink } if API not configured
 */
router.post('/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message || !String(message).trim()) {
    return res.status(400).json({ error: 'phone and message are required.' });
  }

  const to = formatPhone(phone);
  if (!to) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  const configured = !!(
    (process.env.TWILIO_ACCOUNT_SID   || '').trim() &&
    (process.env.TWILIO_AUTH_TOKEN    || '').trim() &&
    (process.env.TWILIO_WHATSAPP_FROM || '').trim()
  );

  if (!configured) {
    const waLink = getWhatsAppLink(phone, message);
    return res.json({ sent: false, waLink, reason: 'WhatsApp API not configured. Use the link to send manually.' });
  }

  try {
    await sendWhatsAppMessage(phone, String(message).trim());
    return res.json({ sent: true });
  } catch (err) {
    console.error('[WHATSAPP] Manual send error:', err.message);
    const waLink = getWhatsAppLink(phone, message);
    return res.status(500).json({ sent: false, waLink, error: err.message });
  }
});

/**
 * GET /api/whatsapp/status
 * Returns whether Twilio WhatsApp credentials are configured.
 */
router.get('/status', (req, res) => {
  const configured = !!(
    (process.env.TWILIO_ACCOUNT_SID   || '').trim() &&
    (process.env.TWILIO_AUTH_TOKEN    || '').trim() &&
    (process.env.TWILIO_WHATSAPP_FROM || '').trim()
  );
  res.json({ configured });
});

module.exports = router;
