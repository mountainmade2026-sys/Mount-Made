const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Public endpoint — courier submits OTP to confirm delivery (no auth required)
router.post('/confirm-otp', adminController.confirmDeliveryOtp);

module.exports = router;
