import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import * as db from '../config/database';
import { authenticateToken } from './auth';

const router = express.Router();

// Type definitions
interface CODCollection {
  collection_id: string;
  order_id: string;
  amount_to_collect: number;
  collected_amount?: number;
  collection_status: 'pending' | 'collected' | 'cancelled';
  payment_method?: 'cash' | 'card_on_delivery';
  collected_at?: string;
  collected_by?: string;
  notes?: string;
  order_number: string;
  order_total: number;
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  order_status: string;
  order_created_at: string;
  customer_name: string;
  customer_phone: string;
  delivery_person_name?: string;
  delivery_person_phone?: string;
  order_items?: OrderItem[];
  collected_by_name?: string;
}

interface OrderItem {
  item_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface CODCollectionRequest {
  order_id: string;
  collected_amount: number;
  payment_method: 'cash' | 'card_on_delivery';
  notes?: string;
}

interface CODFilters {
  status?: string;
  page?: string;
  limit?: string;
  delivery_person_id?: string;
}

interface CODStats {
  pending_collections: number;
  completed_collections: number;
  cancelled_collections: number;
  pending_amount: number;
  collected_amount: number;
  avg_collection_amount: number;
  cash_payments: number;
  card_payments: number;
}

interface DailyTrend {
  collection_date: string;
  collections_count: number;
  daily_total: number;
}

interface TopCollector {
  user_id: string;
  name: string;
  collections_count: number;
  total_collected: number;
}

interface StatsFilters {
  start_date?: string;
  end_date?: string;
  delivery_person_id?: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface UserCODOrder {
  collection_id: string;
  amount_to_collect: number;
  collected_amount?: number;
  collection_status: 'pending' | 'collected' | 'cancelled';
  collected_at?: string;
  order_id: string;
  order_number: string;
  total: number;
  order_status: string;
  order_date: string;
  delivery_address: string;
}

// Validation middleware
const validateCODCollection = [
  body('order_id')
    .isUUID()
    .withMessage('Invalid order ID'),
  body('collected_amount')
    .isFloat({ min: 0 })
    .withMessage('Collected amount must be a positive number'),
  body('payment_method')
    .isIn(['cash', 'card_on_delivery'])
    .withMessage('Payment method must be cash or card_on_delivery'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// Get all COD collections (for delivery personnel/admin)
router.get('/collections', authenticateToken, async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { status = 'pending', page = '1', limit = '20', delivery_person_id } = req.query as CODFilters;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = ['cod.collection_status = $1'];
    let queryParams: any[] = [status];
    let paramCount = 1;

    // Filter by delivery person if specified
    if (delivery_person_id) {
      paramCount++;
      whereConditions.push(`o.assigned_delivery_person = $${paramCount}`);
      queryParams.push(delivery_person_id);
    }

    // Only show orders that are ready for delivery or out for delivery
    whereConditions.push(`o.order_status IN ('ready_for_pickup', 'out_for_delivery')`);

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        cod.collection_id,
        cod.order_id,
        cod.amount_to_collect,
        cod.collected_amount,
        cod.collection_status,
        cod.payment_method as actual_payment_method,
        cod.collected_at,
        cod.notes as collection_notes,
        o.order_number,
        o.total as order_total,
        o.delivery_address,
        o.delivery_latitude,
        o.delivery_longitude,
        o.order_status,
        o.created_at as order_created_at,
        u.name as customer_name,
        u.phone as customer_phone,
        dp.name as delivery_person_name
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      JOIN users u ON o.user_id = u.user_id
      LEFT JOIN users dp ON o.assigned_delivery_person = dp.user_id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(parseInt(limit), offset);

    const result = await db.query<CODCollection>(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      WHERE ${whereClause}
    `;

    const countResult = await db.query<{total: string}>(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    const pagination: PaginationInfo = {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total,
      pages: Math.ceil(total / parseInt(limit))
    };

    res.json({
      collections: result.rows,
      pagination,
      summary: {
        status: status,
        total_amount: result.rows.reduce((sum, col) => sum + parseFloat(col.amount_to_collect.toString() || '0'), 0)
      }
    });

  } catch (error) {
    console.error('COD collections fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch COD collections',
      error_ar: 'فشل في جلب مجموعات الدفع نقداً',
      error_fr: 'Échec de récupération des collectes COD'
    });
  }
});

// Get single COD collection details
router.get('/collections/:collection_id', authenticateToken, async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { collection_id } = req.params;

    const result = await db.query<CODCollection>(`
      SELECT 
        cod.*,
        o.order_number,
        o.total as order_total,
        o.subtotal,
        o.delivery_fee,
        o.delivery_address,
        o.delivery_latitude,
        o.delivery_longitude,
        o.delivery_instructions,
        o.order_status,
        o.created_at as order_created_at,
        u.name as customer_name,
        u.phone as customer_phone,
        dp.name as delivery_person_name,
        dp.phone as delivery_person_phone,
        json_agg(
          json_build_object(
            'item_id', oi.item_id,
            'product_name', p.name_ar,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price
          )
        ) as order_items
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      JOIN users u ON o.user_id = u.user_id
      LEFT JOIN users dp ON o.assigned_delivery_person = dp.user_id
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      WHERE cod.collection_id = $1
      GROUP BY cod.collection_id, o.order_id, u.user_id, dp.user_id
    `, [collection_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'COD collection not found',
        error_ar: 'مجموعة الدفع نقداً غير موجودة',
        error_fr: 'Collection COD non trouvée'
      });
    }

    res.json({
      collection: result.rows[0]
    });

  } catch (error) {
    console.error('COD collection fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch COD collection',
      error_ar: 'فشل في جلب مجموعة الدفع نقداً',
      error_fr: 'Échec de récupération de la collection COD'
    });
  }
});

// Mark COD as collected (for delivery personnel)
router.post('/collections/:collection_id/collect', authenticateToken, validateCODCollection, async (req: Request, res: Response): Promise<Response | void> => {
  const client = await db.pool.connect();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        error_ar: 'فشل في التحقق من البيانات',
        error_fr: 'Échec de la validation',
        details: errors.array()
      });
    }

    await client.query('BEGIN');

    const { collection_id } = req.params;
    const { collected_amount, payment_method, notes } = req.body as CODCollectionRequest;
    const collector_id = req.user!.user_id;

    // Check if collection exists and is pending
    const collectionCheck = await client.query<{
      collection_id: string;
      order_id: string;
      amount_to_collect: string;
      collection_status: string;
      order_status: string;
      total: string;
    }>(`
      SELECT cod.*, o.order_status, o.total
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      WHERE cod.collection_id = $1
    `, [collection_id]);

    if (collectionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'COD collection not found',
        error_ar: 'مجموعة الدفع نقداً غير موجودة',
        error_fr: 'Collection COD non trouvée'
      });
    }

    const collection = collectionCheck.rows[0];

    if (collection.collection_status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'COD collection already processed',
        error_ar: 'تم معالجة الدفع نقداً بالفعل',
        error_fr: 'Collection COD déjà traitée',
        current_status: collection.collection_status
      });
    }

    // Validate collected amount
    const expectedAmount = parseFloat(collection.amount_to_collect);
    const actualAmount = parseFloat(collected_amount.toString());

    if (Math.abs(expectedAmount - actualAmount) > 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Collected amount does not match expected amount',
        error_ar: 'المبلغ المحصل لا يطابق المبلغ المتوقع',
        error_fr: 'Le montant collecté ne correspond pas au montant attendu',
        expected: expectedAmount,
        collected: actualAmount
      });
    }

    // Update COD collection
    await client.query(`
      UPDATE cod_collections 
      SET 
        collected_amount = $1,
        payment_method = $2,
        collection_status = 'collected',
        collected_at = NOW(),
        collected_by = $3,
        notes = $4
      WHERE collection_id = $5
    `, [collected_amount, payment_method, collector_id, notes, collection_id]);

    // Update order status and payment status
    await client.query(`
      UPDATE orders 
      SET 
        order_status = 'delivered',
        payment_status = 'paid',
        delivered_at = NOW(),
        updated_at = NOW()
      WHERE order_id = $1
    `, [collection.order_id]);

    await client.query('COMMIT');

    // Fetch updated collection details
    const updatedCollection = await db.query<CODCollection>(`
      SELECT 
        cod.*,
        o.order_number,
        u.name as customer_name,
        collector.name as collected_by_name
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      JOIN users u ON o.user_id = u.user_id
      LEFT JOIN users collector ON cod.collected_by = collector.user_id
      WHERE cod.collection_id = $1
    `, [collection_id]);

    res.json({
      message: 'COD collection recorded successfully',
      message_ar: 'تم تسجيل الدفع نقداً بنجاح',
      message_fr: 'Collection COD enregistrée avec succès',
      collection: updatedCollection.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('COD collection error:', error);
    res.status(500).json({
      error: 'Failed to record COD collection',
      error_ar: 'فشل في تسجيل الدفع نقداً',
      error_fr: 'Échec d\'enregistrement de la collection COD'
    });
  } finally {
    client.release();
  }
});

// Get COD collection statistics (for admin/managers)
router.get('/stats/summary', authenticateToken, async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { start_date, end_date, delivery_person_id } = req.query as StatsFilters;
    
    let whereConditions = ['1=1'];
    let queryParams: any[] = [];
    let paramCount = 0;

    // Date range filter
    if (start_date) {
      paramCount++;
      whereConditions.push(`cod.collected_at >= $${paramCount}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`cod.collected_at <= $${paramCount}`);
      queryParams.push(end_date);
    }

    // Delivery person filter
    if (delivery_person_id) {
      paramCount++;
      whereConditions.push(`o.assigned_delivery_person = $${paramCount}`);
      queryParams.push(delivery_person_id);
    }

    const whereClause = whereConditions.join(' AND ');

    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE cod.collection_status = 'pending') as pending_collections,
        COUNT(*) FILTER (WHERE cod.collection_status = 'collected') as completed_collections,
        COUNT(*) FILTER (WHERE cod.collection_status = 'cancelled') as cancelled_collections,
        COALESCE(SUM(cod.amount_to_collect) FILTER (WHERE cod.collection_status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(cod.collected_amount) FILTER (WHERE cod.collection_status = 'collected'), 0) as collected_amount,
        COALESCE(AVG(cod.collected_amount) FILTER (WHERE cod.collection_status = 'collected'), 0) as avg_collection_amount,
        COUNT(*) FILTER (WHERE cod.payment_method = 'cash') as cash_payments,
        COUNT(*) FILTER (WHERE cod.payment_method = 'card_on_delivery') as card_payments
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      WHERE ${whereClause}
    `;

    const statsResult = await db.query<CODStats>(statsQuery, queryParams);

    // Get daily collection trends
    const trendsQuery = `
      SELECT 
        DATE(cod.collected_at) as collection_date,
        COUNT(*) as collections_count,
        SUM(cod.collected_amount) as daily_total
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      WHERE ${whereClause} AND cod.collection_status = 'collected'
      GROUP BY DATE(cod.collected_at)
      ORDER BY collection_date DESC
      LIMIT 30
    `;

    const trendsResult = await db.query<DailyTrend>(trendsQuery, queryParams);

    // Get top delivery persons by collections
    const topCollectorsQuery = `
      SELECT 
        u.user_id,
        u.name,
        COUNT(*) as collections_count,
        SUM(cod.collected_amount) as total_collected
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      JOIN users u ON cod.collected_by = u.user_id
      WHERE ${whereClause} AND cod.collection_status = 'collected'
      GROUP BY u.user_id, u.name
      ORDER BY total_collected DESC
      LIMIT 10
    `;

    const topCollectorsResult = await db.query<TopCollector>(topCollectorsQuery, queryParams);

    res.json({
      summary: statsResult.rows[0],
      daily_trends: trendsResult.rows,
      top_collectors: topCollectorsResult.rows,
      period: {
        start_date: start_date || 'all_time',
        end_date: end_date || 'now',
        delivery_person_id: delivery_person_id || 'all'
      }
    });

  } catch (error) {
    console.error('COD stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch COD statistics',
      error_ar: 'فشل في جلب إحصائيات الدفع نقداً',
      error_fr: 'Échec de récupération des statistiques COD'
    });
  }
});

// Get user's COD orders (for customers)
router.get('/my-cod-orders', authenticateToken, async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const user_id = req.user!.user_id;
    const { status = 'all' } = req.query as { status?: string };

    let whereClause = 'WHERE o.user_id = $1 AND o.payment_method = \'cod\'';
    let queryParams: any[] = [user_id];

    if (status !== 'all') {
      queryParams.push(status);
      whereClause += ` AND cod.collection_status = $${queryParams.length}`;
    }

    const result = await db.query<UserCODOrder>(`
      SELECT 
        cod.collection_id,
        cod.amount_to_collect,
        cod.collected_amount,
        cod.collection_status,
        cod.collected_at,
        o.order_id,
        o.order_number,
        o.total,
        o.order_status,
        o.created_at as order_date,
        o.delivery_address
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      ${whereClause}
      ORDER BY o.created_at DESC
    `, queryParams);

    res.json({
      cod_orders: result.rows,
      summary: {
        total_orders: result.rows.length,
        pending_amount: result.rows
          .filter(order => order.collection_status === 'pending')
          .reduce((sum, order) => sum + parseFloat(order.amount_to_collect.toString() || '0'), 0),
        collected_amount: result.rows
          .filter(order => order.collection_status === 'collected')
          .reduce((sum, order) => sum + parseFloat(order.collected_amount?.toString() || '0'), 0)
      }
    });

  } catch (error) {
    console.error('User COD orders fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch COD orders',
      error_ar: 'فشل في جلب طلبات الدفع نقداً',
      error_fr: 'Échec de récupération des commandes COD'
    });
  }
});

export default router;