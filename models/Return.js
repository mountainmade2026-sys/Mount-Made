const db = require('../config/database');

class Return {
  // Initialize returns table
  static async initializeSchema() {
    try {
      // Check if table exists first
      const checkTableResult = await db.query(
        `SELECT to_regclass('public.returns');`
      );

      if (checkTableResult.rows[0].to_regclass !== null) {
        console.log('✓ Returns table already exists');
        return;
      }

      // Table doesn't exist, create it
      await db.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id SERIAL PRIMARY KEY,
          order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          return_reason VARCHAR(255) NOT NULL,
          return_description TEXT,
          quantity INT NOT NULL DEFAULT 1,
          return_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (return_status IN ('pending', 'approved', 'rejected', 'shipped', 'completed')),
          refund_amount DECIMAL(10, 2),
          admin_notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          approved_at TIMESTAMP,
          completed_at TIMESTAMP
        );
      `);

      // Create indexes
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_returns_user_id ON returns(user_id);`
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(return_status);`
      );

      console.log('✓ Returns table created successfully');
    } catch (error) {
      if (error.message && error.message.includes('already exists')) {
        console.log('✓ Returns table already exists');
      } else {
        console.error('Warning: Returns table initialization issue:', error.message);
      }
    }
  }

  // Create a return request
  static async create(userId, orderId, reason, description, quantity = 1) {
    try {
      const result = await db.query(
        `INSERT INTO returns (user_id, order_id, return_reason, return_description, quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, orderId, reason, description, quantity]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating return:', error);
      throw error;
    }
  }

  // Get returns by user
  static async getByUserId(userId) {
    try {
      const result = await db.query(
        `SELECT r.*, o.order_number, o.total_amount, o.items
         FROM returns r
         JOIN orders o ON r.order_id = o.id
         WHERE r.user_id = $1
         ORDER BY r.created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching user returns:', error);
      throw error;
    }
  }

  // Get all returns (admin)
  static async getAll(filter = {}) {
    try {
      let query = `
        SELECT r.*, o.order_number, o.total_amount, 
               u.email, u.phone, u.full_name
        FROM returns r
        LEFT JOIN orders o ON r.order_id = o.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (filter.status) {
        query += ` AND r.return_status = $${paramIndex}`;
        params.push(filter.status);
        paramIndex++;
      }

      if (filter.orderId) {
        query += ` AND r.order_id = $${paramIndex}`;
        params.push(filter.orderId);
        paramIndex++;
      }

      query += ` ORDER BY r.created_at DESC`;

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching all returns:', error);
      throw error;
    }
  }

  // Get single return
  static async getById(returnId) {
    try {
      const result = await db.query(
        `SELECT r.*, o.order_number, o.total_amount, o.items, u.email, u.phone, u.full_name
         FROM returns r
         LEFT JOIN orders o ON r.order_id = o.id
         LEFT JOIN users u ON r.user_id = u.id
         WHERE r.id = $1`,
        [returnId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error fetching return:', error);
      throw error;
    }
  }

  // Approve return
  static async approve(returnId, refundAmount, adminNotes = '') {
    try {
      const result = await db.query(
        `UPDATE returns
         SET return_status = 'approved',
             refund_amount = $2,
             admin_notes = $3,
             approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [returnId, refundAmount, adminNotes]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error approving return:', error);
      throw error;
    }
  }

  // Reject return
  static async reject(returnId, adminNotes = '') {
    try {
      const result = await db.query(
        `UPDATE returns
         SET return_status = 'rejected',
             admin_notes = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [returnId, adminNotes]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error rejecting return:', error);
      throw error;
    }
  }

  // Mark as shipped
  static async markShipped(returnId, adminNotes = '') {
    try {
      const notesText = adminNotes ? (adminNotes + '\n' + new Date().toLocaleString()) : '';
      const result = await db.query(
        `UPDATE returns
         SET return_status = 'shipped',
             admin_notes = CASE 
               WHEN admin_notes IS NULL OR admin_notes = '' THEN $2
               ELSE admin_notes || E'\n---\n' || $2
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [returnId, notesText]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error marking return shipped:', error);
      throw error;
    }
  }

  // Complete return
  static async complete(returnId, adminNotes = '') {
    try {
      const notesText = adminNotes ? (adminNotes + '\n' + new Date().toLocaleString()) : '';
      const result = await db.query(
        `UPDATE returns
         SET return_status = 'completed',
             admin_notes = CASE 
               WHEN admin_notes IS NULL OR admin_notes = '' THEN $2
               ELSE admin_notes || E'\n---\n' || $2
             END,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [returnId, notesText]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error completing return:', error);
      throw error;
    }
  }

  // Delete return (admin only)
  static async delete(returnId) {
    try {
      await db.query(
        `DELETE FROM returns WHERE id = $1`,
        [returnId]
      );
      return true;
    } catch (error) {
      console.error('Error deleting return:', error);
      throw error;
    }
  }

  // Count returns by status
  static async countByStatus() {
    try {
      const result = await db.query(
        `SELECT return_status, COUNT(*) as count
         FROM returns
         GROUP BY return_status
         ORDER BY return_status`
      );
      const counts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        shipped: 0,
        completed: 0
      };
      result.rows.forEach(row => {
        if (row.return_status in counts) {
          counts[row.return_status] = parseInt(row.count, 10);
        }
      });
      return counts;
    } catch (error) {
      console.error('Error counting returns:', error);
      // Return empty counts instead of failing
      return {
        pending: 0,
        approved: 0,
        rejected: 0,
        shipped: 0,
        completed: 0
      };
    }
  }
}

module.exports = Return;
