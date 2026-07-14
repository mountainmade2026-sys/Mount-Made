const express = require('express');
const router = express.Router();
const Return = require('../models/Return');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { adminCheck } = require('../middleware/adminCheck');

// Initialize returns table on startup
Return.initializeSchema();

// ─────────────────────────────────────────── ADMIN ROUTES (Must come first!) ─────────────────────────────────────────

// Admin: Get all returns with optional filtering
router.get('/admin/all', authenticateToken, adminCheck, async (req, res) => {
  try {
    const { status, orderId } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (orderId) filter.orderId = orderId;

    const returns = await Return.getAll(filter);
    const counts = await Return.countByStatus();

    res.json({
      success: true,
      returns,
      counts
    });
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Failed to fetch returns', details: error.message });
  }
});

// Admin: Get return statistics
router.get('/admin/stats', authenticateToken, adminCheck, async (req, res) => {
  try {
    const counts = await Return.countByStatus();
    const totalReturns = Object.values(counts).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      total: totalReturns,
      byStatus: counts
    });
  } catch (error) {
    console.error('Error fetching return stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Admin: Approve return
router.post('/:returnId/approve', authenticateToken, adminCheck, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { refundAmount, adminNotes } = req.body;

    if (!refundAmount) {
      return res.status(400).json({ error: 'Refund amount is required' });
    }

    const returnData = await Return.approve(returnId, refundAmount, adminNotes || '');

    if (!returnData) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({
      success: true,
      message: 'Return approved successfully',
      return: returnData
    });
  } catch (error) {
    console.error('Error approving return:', error);
    res.status(500).json({ error: 'Failed to approve return' });
  }
});

// Admin: Reject return
router.post('/:returnId/reject', authenticateToken, adminCheck, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { adminNotes } = req.body;

    const returnData = await Return.reject(returnId, adminNotes || '');

    if (!returnData) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({
      success: true,
      message: 'Return rejected',
      return: returnData
    });
  } catch (error) {
    console.error('Error rejecting return:', error);
    res.status(500).json({ error: 'Failed to reject return' });
  }
});

// Admin: Mark return as shipped
router.post('/:returnId/mark-shipped', authenticateToken, adminCheck, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { adminNotes } = req.body;

    const returnData = await Return.markShipped(returnId, adminNotes || '');

    if (!returnData) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({
      success: true,
      message: 'Return marked as shipped',
      return: returnData
    });
  } catch (error) {
    console.error('Error marking return shipped:', error);
    res.status(500).json({ error: 'Failed to update return' });
  }
});

// Admin: Complete return
router.post('/:returnId/complete', authenticateToken, adminCheck, async (req, res) => {
  try {
    const { returnId } = req.params;
    const { adminNotes } = req.body;

    const returnData = await Return.complete(returnId, adminNotes || '');

    if (!returnData) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({
      success: true,
      message: 'Return completed successfully',
      return: returnData
    });
  } catch (error) {
    console.error('Error completing return:', error);
    res.status(500).json({ error: 'Failed to complete return' });
  }
});

// Admin: Delete return
router.delete('/:returnId', authenticateToken, adminCheck, async (req, res) => {
  try {
    const { returnId } = req.params;

    await Return.delete(returnId);

    res.json({
      success: true,
      message: 'Return deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting return:', error);
    res.status(500).json({ error: 'Failed to delete return' });
  }
});

// ─────────────────────────────────────────── CUSTOMER ROUTES ─────────────────────────────────────────

// Customer: Create return request
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, reason, description, quantity } = req.body;

    if (!orderId || !reason) {
      return res.status(400).json({ error: 'Order ID and return reason are required' });
    }

    // Verify the order belongs to the user
    const orderResult = await db.query(
      'SELECT id FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(403).json({ error: 'Order not found' });
    }

    // Check if return already exists for this order
    const existingReturn = await db.query(
      'SELECT id FROM returns WHERE order_id = $1',
      [orderId]
    );

    if (existingReturn.rows.length > 0) {
      return res.status(400).json({ error: 'A return request already exists for this order' });
    }

    const returnRequest = await Return.create(
      userId,
      orderId,
      reason,
      description || '',
      quantity || 1
    );

    res.json({
      success: true,
      message: 'Return request created successfully',
      return: returnRequest
    });
  } catch (error) {
    console.error('Error creating return request:', error);
    res.status(500).json({ error: 'Failed to create return request' });
  }
});

// Customer: Get their returns
router.get('/my-returns', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const returns = await Return.getByUserId(userId);

    res.json({
      success: true,
      returns
    });
  } catch (error) {
    console.error('Error fetching user returns:', error);
    res.status(500).json({ error: 'Failed to fetch returns' });
  }
});

// Customer: Get single return
router.get('/:returnId', authenticateToken, async (req, res) => {
  try {
    const { returnId } = req.params;
    const userId = req.user.id;

    const returnData = await Return.getById(returnId);

    if (!returnData) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Verify ownership
    if (returnData.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      return: returnData
    });
  } catch (error) {
    console.error('Error fetching return:', error);
    res.status(500).json({ error: 'Failed to fetch return' });
  }
});

module.exports = router;
