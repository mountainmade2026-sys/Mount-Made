# IDFC Payment Gateway Integration Guide

## Overview

This document provides complete setup and configuration instructions for integrating the IDFC Bank payment gateway into the Mount Made e-commerce platform. The integration supports three banking payment methods:
- **Debit Cards**
- **Credit Cards**  
- **Net Banking**

## Prerequisites

1. **IDFC Bank Merchant Account**
   - Active IDFC merchant account with payment gateway enabled
   - Merchant ID from IDFC
   - API Key and API Secret from IDFC

2. **Database**
   - PostgreSQL with payment_sessions table created
   - Updated orders table with IDFC payment fields

3. **Environment Setup**
   - Node.js with Express.js server running
   - axios package for API calls (already in package.json)

## Step 1: Environment Configuration

Add the following environment variables to your `.env` file:

```env
# IDFC Payment Gateway Configuration
IDFC_MERCHANT_ID=your_merchant_id_here
IDFC_API_KEY=your_api_key_here
IDFC_API_SECRET=your_api_secret_here
IDFC_BASE_URL=https://api.idfcbank.com/api/v1
IDFC_REDIRECT_URL=https://yourdomain.com/payment-callback
IDFC_WEBHOOK_URL=https://yourdomain.com/api/payments/idfc/webhook

# For Development (localhost)
# IDFC_REDIRECT_URL=http://localhost:3000/payment-callback
# IDFC_WEBHOOK_URL=http://localhost:3000/api/payments/idfc/webhook
```

### Environment Variables Explanation

| Variable | Description | Example |
|----------|-------------|---------|
| `IDFC_MERCHANT_ID` | Your merchant ID from IDFC | `MERCHANT001` |
| `IDFC_API_KEY` | API key for authentication | `sk_live_abc123xyz...` |
| `IDFC_API_SECRET` | API secret for signatures | `secret_xyz789...` |
| `IDFC_BASE_URL` | IDFC API endpoint | `https://api.idfcbank.com/api/v1` |
| `IDFC_REDIRECT_URL` | Callback URL after payment | `https://yourdomain.com/payment-callback` |
| `IDFC_WEBHOOK_URL` | Webhook URL for async notifications | `https://yourdomain.com/api/payments/idfc/webhook` |

## Step 2: Database Migration

Run the migration to create the `payment_sessions` table:

```bash
# Using psql
psql -U username -d database_name -f idfc_payment_sessions_migration.sql

# Or copy the SQL from idfc_payment_sessions_migration.sql and run in your database client
```

The migration creates:
- `payment_sessions` table to track payment sessions
- Indexes for performance
- Payment gateway fields in orders table

### Database Schema

```sql
payment_sessions table:
- id (Serial Primary Key)
- order_id (FK to orders)
- payment_method (debit/credit/netbank)
- session_id (IDFC session ID)
- transaction_id (Internal transaction ID)
- amount (Payment amount)
- merchant_id (IDFC merchant ID)
- response_code (Payment gateway response)
- verified_at (When payment was verified)
- webhook_received_at (When webhook was received)
- created_at, expires_at (Timestamps)
```

## Step 3: Backend API Endpoints

The IDFC payment gateway integration provides these API endpoints:

### 1. Initiate Payment
**POST** `/api/payments/idfc/initiate`

Initiates an IDFC payment session.

**Request Body:**
```json
{
  "order": {
    "id": "order_123",
    "order_number": "MM001",
    "_id": "order_123"
  },
  "amount": 5000,
  "paymentMethod": "debit",
  "customerDetails": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+91-9999999999"
  }
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "sessionId": "session_xyz123",
  "merchantId": "MERCHANT001",
  "transactionId": "MM1704067200000abc123",
  "paymentUrl": "https://payment.idfcbank.com/...",
  "amount": 5000,
  "currency": "INR"
}
```

**Response (Error - 500):**
```json
{
  "error": "Failed to connect with payment gateway",
  "details": "error details"
}
```

### 2. Verify Payment
**POST** `/api/payments/idfc/verify`

Verifies payment after completion and creates order in database.

**Request Body:**
```json
{
  "sessionId": "session_xyz123",
  "transactionId": "MM1704067200000abc123",
  "responseCode": "0",
  "responseMessage": "Transaction successful",
  "amount": 5000,
  "shipping_address": {
    "full_name": "John Doe",
    "phone": "+91-9999999999",
    "address_line1": "123 Main St",
    "city": "Mumbai",
    "state": "MH",
    "postal_code": "400001",
    "country": "IN"
  },
  "delivery_charge": 100
}
```

**Response (Success - 201):**
```json
{
  "message": "Payment verified and order placed successfully.",
  "order": {
    "id": "order_123",
    "order_number": "MM001",
    "total_amount": 5100,
    "payment_status": "paid"
  }
}
```

### 3. IDFC Webhook Handler
**POST** `/api/payments/idfc/webhook`

Receives async payment confirmation from IDFC.

**Request Body (from IDFC):**
```json
{
  "transactionId": "MM1704067200000abc123",
  "sessionId": "session_xyz123",
  "orderId": "order_123",
  "amount": 5000,
  "responseCode": "0",
  "responseMessage": "Transaction successful",
  "signature": "hex_signature"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed"
}
```

### 4. Payment Status Check
**GET** `/api/payments/idfc/status/:transactionId`

Check payment status by transaction ID.

**Response (Success - 200):**
```json
{
  "transactionId": "MM1704067200000abc123",
  "sessionId": "session_xyz123",
  "orderId": "order_123",
  "status": "verified",
  "responseCode": "0",
  "responseMessage": "Transaction successful",
  "createdAt": "2024-01-01T12:00:00Z",
  "verifiedAt": "2024-01-01T12:05:00Z",
  "webhookReceivedAt": "2024-01-01T12:05:30Z"
}
```

## Step 4: Frontend Integration

### Payment Initiation (checkout.html)

The frontend automatically initiates IDFC payment when a user selects a banking method:

```javascript
// When user clicks "Confirm Order" with banking method selected
if (['debit', 'credit', 'netbank'].includes(paymentMethod)) {
  // 1. Create order on server
  const serverOrder = await api.post('/orders', orderData);
  
  // 2. Initiate IDFC payment session
  const paymentSession = await api.post('/payments/idfc/initiate', {
    order: serverOrder.order,
    amount: totalAmount,
    paymentMethod: paymentMethod,
    customerDetails: {...}
  });
  
  // 3. Redirect to IDFC payment gateway
  window.IDFCBANK.redirectToPaymentGateway({
    sessionId: paymentSession.sessionId,
    merchantId: paymentSession.merchantId,
    onSuccess: function(response) { /* success */ },
    onFailure: function(error) { /* failure */ },
    onCancel: function() { /* cancelled */ }
  });
}
```

### IDFC SDK Integration

The IDFC JavaScript SDK is loaded in checkout.html:

```html
<script src="https://sdk.idfcbank.com/idealweb/production/js/IDFCBANK_SDK.js"></script>
```

## Step 5: Payment Callback

The payment callback route handles return from IDFC:

### Payment Success
**URL:** `GET /payment-callback?transactionId=...&sessionId=...&responseCode=0`

Shows success page and allows user to:
- View order confirmation
- Check order status
- Download invoice

### Payment Failure
**URL:** `GET /payment-callback?transactionId=...&responseCode=1&responseMessage=...`

Shows error page and allows user to:
- Retry payment
- Contact support
- View error details

## Step 6: Testing

### Test Configuration

1. **Get IDFC Test Credentials**
   - Contact IDFC support for test merchant ID and API credentials
   - Use sandbox URLs instead of production URLs

2. **Use IDFC Test Cards**
   - Debit Card: 4111111111111111
   - Credit Card: 5555555555554444
   - Use any future expiry date and any CVV

### Test Payment Flow

1. **Add item to cart** and proceed to checkout
2. **Select Banking Payment** (Debit/Credit/Net Banking)
3. **Complete order form** with shipping address
4. **Click "Proceed to Payment"** button
5. **IDFC payment gateway** opens in modal/redirect
6. **Enter test card details** (see above)
7. **Verify payment** successfully processes
8. **Confirm order** created in database

### Debugging

Enable debug logging in checkout.html:

```javascript
// Already included in checkout.html:
console.log('checkout: handling banking payment via IDFC');
console.log('checkout: server order created for banking', serverOrder);
console.log('IDFC Payment successful:', response);
```

Check server logs:

```bash
# View server logs
tail -f logs/server.log | grep IDFC

# Check database payment_sessions
SELECT * FROM payment_sessions ORDER BY created_at DESC LIMIT 10;

# Check orders created from IDFC payments
SELECT * FROM orders WHERE payment_provider = 'idfc' ORDER BY created_at DESC;
```

## Step 7: Production Deployment

### Pre-Deployment Checklist

- [ ] IDFC merchant account approved and active
- [ ] Production API credentials obtained from IDFC
- [ ] SSL certificate installed on server (HTTPS required)
- [ ] Payment callback URLs updated in IDFC dashboard
- [ ] Webhook URL whitelisted in IDFC settings
- [ ] Database migration completed
- [ ] Environment variables configured in production
- [ ] Payment flow tested end-to-end
- [ ] Error handling tested (failed payments, network issues)
- [ ] Admin notification emails configured
- [ ] Customer payment confirmation emails working

### Production Configuration

1. **Update .env with production credentials:**
```env
IDFC_MERCHANT_ID=prod_merchant_id
IDFC_API_KEY=prod_api_key
IDFC_API_SECRET=prod_api_secret
IDFC_BASE_URL=https://api.idfcbank.com/api/v1
IDFC_REDIRECT_URL=https://mountainmade.com/payment-callback
IDFC_WEBHOOK_URL=https://mountainmade.com/api/payments/idfc/webhook
```

2. **Configure IDFC Dashboard:**
   - Set redirect URL to: `https://yourdomain.com/payment-callback`
   - Set webhook URL to: `https://yourdomain.com/api/payments/idfc/webhook`
   - Enable test mode: OFF
   - Enable production: ON

3. **Monitor Payments:**
   - Check payment_sessions table for failed transactions
   - Monitor webhook delivery status
   - Alert on payment failures

## Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Customer selects Banking Method (Debit/Credit/Net Banking)  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend: POST /api/payments/idfc/initiate                 │
│ - Create IDFC session                                       │
│ - Return sessionId to frontend                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend: Call window.IDFCBANK.redirectToPaymentGateway()  │
│ - User redirected to IDFC payment page                      │
│ - User enters card details                                  │
│ - IDFC processes payment                                    │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    SUCCESS           FAILURE
        │                 │
        ▼                 ▼
┌───────────────────┐  ┌──────────────────────┐
│ IDFC redirects to │  │ IDFC redirects to    │
│ /payment-callback │  │ /payment-callback    │
│ responseCode=0    │  │ responseCode!=0      │
└────────┬──────────┘  └──────────┬───────────┘
         │                        │
         ▼                        ▼
    ┌─────────────────────────────────────┐
    │ Frontend: Verify payment status     │
    │ GET /api/payments/idfc/status/:txnId│
    └────────────────┬────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
    ┌─────────────┐      ┌──────────────┐
    │ Show Success│      │ Show Failure │
    │ Page with   │      │ Page with    │
    │ Order #     │      │ Error        │
    │ Redirect to │      │ Retry option │
    │ /orders     │      │              │
    └─────────────┘      └──────────────┘
```

## Troubleshooting

### Common Issues

#### 1. "IDFC payment gateway not available"
**Cause:** IDFC SDK not loaded or network issue
**Solution:**
- Check browser console for script loading errors
- Verify IDFC SDK URL is accessible: https://sdk.idfcbank.com/idealweb/production/js/IDFCBANK_SDK.js
- Check firewall/proxy settings

#### 2. "Payment session not found"
**Cause:** Payment initiation failed or session expired
**Solution:**
- Check payment_sessions table for record
- Verify sessionId matches transactionId
- Check if session expires_at timestamp

#### 3. "Payment amount mismatch"
**Cause:** Cart total changed between initiation and verification
**Solution:**
- Verify cart not modified during payment
- Check delivery charge calculation
- Compare server_amount vs paid_amount in error response

#### 4. "Webhook not received"
**Cause:** IDFC webhook failed to deliver
**Solution:**
- Verify webhook URL is publicly accessible
- Check firewall allows POST from IDFC IPs
- Check server logs for webhook errors
- Verify webhook URL configured in IDFC dashboard

#### 5. "Signature verification failed"
**Cause:** API key mismatch or invalid signature
**Solution:**
- Verify IDFC_API_KEY matches in .env and IDFC dashboard
- Ensure signature string format matches IDFC specification
- Check for special characters in API key

### Debug Mode

Enable debug logging in production (temporary):

```javascript
// In checkout.html
const DEBUG_IDFC = true; // Change to false after debugging

if (DEBUG_IDFC) {
  console.log('DEBUG: IDFC Payment Data', idfcPaymentData);
  console.log('DEBUG: Payment Session Response', paymentSession);
  console.log('DEBUG: IDFC Redirect Params', {
    sessionId, merchantId, onSuccess, onFailure, onCancel
  });
}
```

### Database Debug Queries

```sql
-- Check recent payment sessions
SELECT * FROM payment_sessions 
ORDER BY created_at DESC LIMIT 10;

-- Check payment sessions for specific order
SELECT ps.*, o.order_number, o.payment_status 
FROM payment_sessions ps
LEFT JOIN orders o ON ps.order_id = o.id
WHERE ps.order_id = 123;

-- Check failed payments
SELECT * FROM payment_sessions 
WHERE response_code != '0' AND response_code IS NOT NULL
ORDER BY created_at DESC;

-- Check unverified webhooks
SELECT * FROM payment_sessions 
WHERE webhook_received_at IS NOT NULL 
AND verified_at IS NULL
ORDER BY webhook_received_at DESC;
```

## Performance Optimization

### Database Indexes

The migration includes indexes for:
- `transaction_id` - Fast lookup by transaction ID
- `session_id` - Fast lookup by session ID
- `order_id` - Fast lookup by order ID
- `created_at` - For date-range queries

### API Response Caching

Payment status can be cached for 5 minutes:

```javascript
// In paymentCallback route
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
res.set('Cache-Control', 'public, max-age=300');
```

### Webhook Processing

Webhook processing is asynchronous to prevent timeout:

```javascript
// Non-blocking webhook processing
Promise.resolve().then(async () => {
  // Update payment status
  // Send notifications
  // etc
}).catch(err => console.error('Webhook processing error:', err));
```

## Security Considerations

1. **API Key Protection**
   - Store API keys in environment variables only
   - Never commit .env to git
   - Rotate keys periodically

2. **Signature Verification**
   - Always verify webhook signatures
   - Use HMAC-SHA256 for verification
   - Reject unsigned webhooks

3. **HTTPS Only**
   - All payment URLs must use HTTPS
   - Redirect HTTP to HTTPS

4. **PCI Compliance**
   - Never log card numbers
   - Never store raw card data
   - Use IDFC's secure redirect
   - Follow PCI DSS guidelines

5. **Amount Verification**
   - Always verify paid amount matches expected amount
   - Prevent payment amount manipulation
   - Use server-side cart total

## Support & Documentation

- **IDFC Developer Documentation:** https://developer.idfcbank.com
- **IDFC API Reference:** https://api-docs.idfcbank.com
- **Support:** contact support@mountainmade.com

## Changelog

### v1.0 (Initial Release)
- IDFC payment gateway integration
- Support for Debit/Credit/Net Banking
- Payment session tracking
- Webhook verification
- Payment callback handling
- Comprehensive error handling
