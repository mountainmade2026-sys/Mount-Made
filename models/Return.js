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

      // Table doesn't exist, create it (legacy-safe). The main schema is managed
      // in config/database.js; this is a defensive creation to avoid startup errors
      await db.query(`
        CREATE TABLE IF NOT EXISTS returns (
          id SERIAL PRIMARY KEY,
          order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          admin_notes TEXT,
          quantity INT DEFAULT 1,
          status VARCHAR(50) DEFAULT 'requested',
          refund_amount DECIMAL(10, 2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        `CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);`
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
      // The DB schema uses `reason` and `status`. Some deployments may not have
      // `quantity` or `return_description` columns; to be robust we write the
      // provided `description` and `quantity` into `admin_notes` when those
      // columns are missing. The primary stored fields will be `reason`, `user_id`,
      // `order_id`, `quantity` (if available) and `admin_notes`.

      // Build a safe admin_notes payload containing the customer's description
      // and requested quantity so admins can see the details.
      const notesParts = [];
      if (description && String(description).trim() !== '') notesParts.push(`customer_description: ${description}`);
      if (quantity && Number(quantity) > 0) notesParts.push(`quantity: ${Number(quantity)}`);
      const notes = notesParts.join('\n') || null;

      // Insert into the core columns available across deployments: reason and admin_notes.
      const result = await db.query(
        `INSERT INTO returns (user_id, order_id, reason, admin_notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, orderId, reason, notes]
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
        // Support both 'pending' and 'requested' naming
        if (filter.status === 'pending') {
          query += ` AND (r.status = 'requested' OR r.status = 'pending')`;
        } else {
          query += ` AND r.status = $${paramIndex}`;
          params.push(filter.status);
          paramIndex++;
        }
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
         SET status = 'approved',
             refund_amount = $2,
             admin_notes = CASE WHEN admin_notes IS NULL OR admin_notes = '' THEN $3 ELSE admin_notes || E'\n---\n' || $3 END,
             processed_at = CURRENT_TIMESTAMP,
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
         SET status = 'rejected',
             admin_notes = CASE WHEN admin_notes IS NULL OR admin_notes = '' THEN $2 ELSE admin_notes || E'\n---\n' || $2 END,
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
         SET status = 'shipped',
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
         SET status = 'completed',
             admin_notes = CASE 
               WHEN admin_notes IS NULL OR admin_notes = '' THEN $2 ELSE admin_notes || E'\n---\n' || $2 END,
             processed_at = CURRENT_TIMESTAMP,
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
        `SELECT status, COUNT(*) as count
         FROM returns
         GROUP BY status`
      );

      // Normalize DB status names into the application statuses
      const counts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        shipped: 0,
        completed: 0
      };

      result.rows.forEach(row => {
        const status = row.status === 'requested' ? 'pending' : row.status;
        if (status in counts) counts[status] = parseInt(row.count, 10);
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
