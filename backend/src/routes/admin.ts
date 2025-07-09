import express, { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import * as db from '../config/database';
import { authenticateToken } from './auth';

const router = express.Router();

// Type definitions
interface AdminDashboardStats {
  period: string;
  orders: OrderStats;
  products: ProductStats;
  users: UserStats;
  cod: CODStats;
  sales_trend: SalesTrend[];
  top_products: TopProduct[];
  generated_at: string;
}

interface OrderStats {
  total_orders: number;
  pending_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  avg_order_value: number;
  cod_orders: number;
  card_orders: number;
}

interface ProductStats {
  total_products: number;
  active_products: number;
  low_stock_products: number;
  out_of_stock_products: number;
}

interface UserStats {
  total_users: number;
  registered_users: number;
  guest_users: number;
  new_users_7d: number;
}

interface CODStats {
  total_cod_collections: number;
  pending_collections: number;
  completed_collections: number;
  pending_amount: number;
  collected_amount: number;
}

interface SalesTrend {
  date: string;
  orders_count: number;
  daily_revenue: number;
}

interface TopProduct {
  product_id: string;
  product_name: string;
  total_sold: number;
  total_revenue: number;
}

interface AdminOrder {
  order_id: string;
  order_number: string;
  user_id: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: 'cod' | 'card';
  payment_status: string;
  order_status: string;
  delivery_address: string;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_phone: string;
  is_guest: boolean;
  delivery_person_name?: string;
  collection_status?: string;
  collected_amount?: number;
  items_count: number;
}

interface AdminOrderFilters {
  status?: string;
  payment_method?: string;
  page?: string;
  limit?: string;
  search?: string;
  start_date?: string;
  end_date?: string;
}

interface UpdateOrderStatusRequest {
  status: string;
  assigned_delivery_person?: string;
  notes?: string;
}

interface AdminUser {
  user_id: string;
  name: string;
  phone: string;
  email: string;
  type: string;
  is_guest: boolean;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  total_orders: number;
  total_spent: number;
}

interface AdminUserFilters {
  type?: string;
  page?: string;
  limit?: string;
  search?: string;
  is_active?: string;
}

interface InventoryProduct {
  product_id: string;
  product_name: string;
  stock_quantity: number;
  low_stock_threshold: number;
  price: number;
  category_name: string;
  sold_last_30d: number;
  stock_status: 'Out of Stock' | 'Low Stock' | 'In Stock';
}

interface InventoryFilters {
  category?: string;
  low_stock_only?: string;
}

interface InventorySummary {
  total_products: number;
  out_of_stock: number;
  low_stock: number;
  in_stock: number;
  total_inventory_value: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Admin authorization middleware
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.type !== 'admin' && req.user.type !== 'manager')) {
    res.status(403).json({
      error: 'Admin access required',
      error_ar: 'مطلوب صلاحية المدير',
      error_fr: 'Accès administrateur requis'
    });
    return;
  }
  next();
}

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard statistics
router.get('/dashboard/stats', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { period = '7d' } = req.query as { period?: string };
    
    // Calculate date range
    let dateFilter = '';
    switch (period) {
      case '24h':
        dateFilter = "AND created_at >= NOW() - INTERVAL '1 day'";
        break;
      case '7d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
        break;
      case '90d':
        dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
        break;
      default:
        dateFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
    }

    // Get order statistics
    const orderStats = await db.query<OrderStats>(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE order_status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE order_status = 'delivered') as delivered_orders,
        COUNT(*) FILTER (WHERE order_status = 'cancelled') as cancelled_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_order_value,
        COUNT(*) FILTER (WHERE payment_method = 'cod') as cod_orders,
        COUNT(*) FILTER (WHERE payment_method = 'card') as card_orders
      FROM orders 
      WHERE 1=1 ${dateFilter}
    `);

    // Get product statistics
    const productStats = await db.query<ProductStats>(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(*) FILTER (WHERE is_active = true) as active_products,
        COUNT(*) FILTER (WHERE stock_quantity <= low_stock_threshold) as low_stock_products,
        COUNT(*) FILTER (WHERE stock_quantity = 0) as out_of_stock_products
      FROM products
    `);

    // Get user statistics
    const userStats = await db.query<UserStats>(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_guest = false) as registered_users,
        COUNT(*) FILTER (WHERE is_guest = true) as guest_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d
      FROM users 
      WHERE type = 'customer'
    `);

    // Get COD statistics
    const codStats = await db.query<CODStats>(`
      SELECT 
        COUNT(*) as total_cod_collections,
        COUNT(*) FILTER (WHERE collection_status = 'pending') as pending_collections,
        COUNT(*) FILTER (WHERE collection_status = 'collected') as completed_collections,
        COALESCE(SUM(amount_to_collect) FILTER (WHERE collection_status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(collected_amount) FILTER (WHERE collection_status = 'collected'), 0) as collected_amount
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
      WHERE 1=1 ${dateFilter.replace('created_at', 'o.created_at')}
    `);

    // Get daily sales trend
    const salesTrend = await db.query<SalesTrend>(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders_count,
        COALESCE(SUM(total), 0) as daily_revenue
      FROM orders 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    // Get top products
    const topProducts = await db.query<TopProduct>(`
      SELECT 
        p.product_id,
        p.name_ar as product_name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.total_price) as total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      JOIN orders o ON oi.order_id = o.order_id
      WHERE o.created_at >= NOW() - INTERVAL '30 days'
        AND o.order_status NOT IN ('cancelled')
      GROUP BY p.product_id, p.name_ar
      ORDER BY total_sold DESC
      LIMIT 10
    `);

    const dashboardStats: AdminDashboardStats = {
      period: period,
      orders: orderStats.rows[0],
      products: productStats.rows[0],
      users: userStats.rows[0],
      cod: codStats.rows[0],
      sales_trend: salesTrend.rows,
      top_products: topProducts.rows,
      generated_at: new Date().toISOString()
    };

    res.json(dashboardStats);

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      error_ar: 'فشل في جلب إحصائيات لوحة التحكم',
      error_fr: 'Échec de récupération des statistiques du tableau de bord'
    });
  }
});

// Get all orders with filters (admin view)
router.get('/orders', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { 
      status, 
      payment_method, 
      page = '1', 
      limit = '20', 
      search,
      start_date,
      end_date 
    } = req.query as AdminOrderFilters;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let whereConditions = ['1=1'];
    let queryParams: any[] = [];
    let paramCount = 0;

    // Status filter
    if (status) {
      paramCount++;
      whereConditions.push(`o.order_status = $${paramCount}`);
      queryParams.push(status);
    }

    // Payment method filter
    if (payment_method) {
      paramCount++;
      whereConditions.push(`o.payment_method = $${paramCount}`);
      queryParams.push(payment_method);
    }

    // Search filter (order number or customer name/phone)
    if (search) {
      paramCount++;
      whereConditions.push(`(
        o.order_number ILIKE $${paramCount} OR 
        u.name ILIKE $${paramCount} OR 
        u.phone ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    // Date range filters
    if (start_date) {
      paramCount++;
      whereConditions.push(`o.created_at >= $${paramCount}`);
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`o.created_at <= $${paramCount}`);
      queryParams.push(end_date);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        o.*,
        u.name as customer_name,
        u.phone as customer_phone,
        u.is_guest,
        dp.name as delivery_person_name,
        cod.collection_status,
        cod.collected_amount,
        (
          SELECT COUNT(*) 
          FROM order_items oi 
          WHERE oi.order_id = o.order_id
        ) as items_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.user_id
      LEFT JOIN users dp ON o.assigned_delivery_person = dp.user_id
      LEFT JOIN cod_collections cod ON o.order_id = cod.order_id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(parseInt(limit), offset);

    const result = await db.query<AdminOrder>(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.user_id
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
      orders: result.rows,
      pagination
    });

  } catch (error) {
    console.error('Admin orders fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      error_ar: 'فشل في جلب الطلبات',
      error_fr: 'Échec de récupération des commandes'
    });
  }
});

// Update order status
router.patch('/orders/:order_id/status', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { order_id } = req.params;
    const { status, assigned_delivery_person, notes } = req.body as UpdateOrderStatusRequest;

    const validStatuses = [
      'pending', 'confirmed', 'preparing', 'ready_for_pickup',
      'out_for_delivery', 'delivered', 'completed', 'cancelled'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid order status',
        error_ar: 'حالة الطلب غير صحيحة',
        error_fr: 'Statut de commande invalide',
        valid_statuses: validStatuses
      });
    }

    // Build update query dynamically
    let updateFields = ['order_status = $2', 'updated_at = NOW()'];
    let queryParams: any[] = [order_id, status];
    let paramCount = 2;

    if (assigned_delivery_person) {
      paramCount++;
      updateFields.push(`assigned_delivery_person = $${paramCount}`);
      queryParams.push(assigned_delivery_person);
    }

    if (notes) {
      paramCount++;
      updateFields.push(`admin_notes = $${paramCount}`);
      queryParams.push(notes);
    }

    // Special handling for delivered status
    if (status === 'delivered') {
      updateFields.push('delivered_at = NOW()');
    }

    const updateQuery = `
      UPDATE orders 
      SET ${updateFields.join(', ')}
      WHERE order_id = $1
      RETURNING *
    `;

    const result = await db.query<AdminOrder>(updateQuery, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Order not found',
        error_ar: 'الطلب غير موجود',
        error_fr: 'Commande non trouvée'
      });
    }

    // If order is cancelled, restore stock
    if (status === 'cancelled') {
      const itemsResult = await db.query<{product_id: string, variant_id: string | null, quantity: number}>(`
        SELECT oi.product_id, oi.variant_id, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = $1
      `, [order_id]);

      for (const item of itemsResult.rows) {
        if (item.variant_id) {
          await db.query(`
            UPDATE product_variants 
            SET stock_quantity = stock_quantity + $1 
            WHERE variant_id = $2
          `, [item.quantity, item.variant_id]);
        } else {
          await db.query(`
            UPDATE products 
            SET stock_quantity = stock_quantity + $1 
            WHERE product_id = $2
          `, [item.quantity, item.product_id]);
        }
      }
    }

    res.json({
      message: 'Order status updated successfully',
      message_ar: 'تم تحديث حالة الطلب بنجاح',
      message_fr: 'Statut de commande mis à jour avec succès',
      order: result.rows[0]
    });

  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({
      error: 'Failed to update order status',
      error_ar: 'فشل في تحديث حالة الطلب',
      error_fr: 'Échec de mise à jour du statut de commande'
    });
  }
});

// Get all users (admin view)
router.get('/users', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { type, page = '1', limit = '20', search, is_active } = req.query as AdminUserFilters;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereConditions = ['1=1'];
    let queryParams: any[] = [];
    let paramCount = 0;

    // User type filter
    if (type) {
      paramCount++;
      whereConditions.push(`type = $${paramCount}`);
      queryParams.push(type);
    }

    // Active status filter
    if (is_active !== undefined) {
      paramCount++;
      whereConditions.push(`is_active = $${paramCount}`);
      queryParams.push(is_active === 'true');
    }

    // Search filter
    if (search) {
      paramCount++;
      whereConditions.push(`(
        name ILIKE $${paramCount} OR 
        phone ILIKE $${paramCount} OR 
        email ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    const whereClause = whereConditions.join(' AND ');

    const query = `
      SELECT 
        user_id,
        name,
        phone,
        email,
        type,
        is_guest,
        is_active,
        created_at,
        last_login,
        (
          SELECT COUNT(*) 
          FROM orders 
          WHERE user_id = users.user_id
        ) as total_orders,
        (
          SELECT COALESCE(SUM(total), 0) 
          FROM orders 
          WHERE user_id = users.user_id AND order_status = 'delivered'
        ) as total_spent
      FROM users
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(parseInt(limit), offset);

    const result = await db.query<AdminUser>(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users
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
      users: result.rows,
      pagination
    });

  } catch (error) {
    console.error('Admin users fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      error_ar: 'فشل في جلب المستخدمين',
      error_fr: 'Échec de récupération des utilisateurs'
    });
  }
});

// Get inventory report
router.get('/inventory/report', async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { category, low_stock_only = 'false' } = req.query as InventoryFilters;

    let whereConditions = ['p.is_active = true'];
    let queryParams: any[] = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      whereConditions.push(`c.name_en ILIKE $${paramCount}`);
      queryParams.push(`%${category}%`);
    }

    if (low_stock_only === 'true') {
      whereConditions.push('p.stock_quantity <= p.low_stock_threshold');
    }

    const whereClause = whereConditions.join(' AND ');

    const result = await db.query<InventoryProduct>(`
      SELECT 
        p.product_id,
        p.name_ar as product_name,
        p.stock_quantity,
        p.low_stock_threshold,
        p.price,
        c.name_ar as category_name,
        (
          SELECT SUM(quantity) 
          FROM order_items oi 
          JOIN orders o ON oi.order_id = o.order_id
          WHERE oi.product_id = p.product_id 
            AND o.created_at >= NOW() - INTERVAL '30 days'
            AND o.order_status NOT IN ('cancelled')
        ) as sold_last_30d,
        CASE 
          WHEN p.stock_quantity = 0 THEN 'Out of Stock'
          WHEN p.stock_quantity <= p.low_stock_threshold THEN 'Low Stock'
          ELSE 'In Stock'
        END as stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE ${whereClause}
      ORDER BY 
        CASE 
          WHEN p.stock_quantity = 0 THEN 1
          WHEN p.stock_quantity <= p.low_stock_threshold THEN 2
          ELSE 3
        END,
        p.name_ar
    `, queryParams);

    // Get summary statistics
    const summary = await db.query<InventorySummary>(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(*) FILTER (WHERE stock_quantity = 0) as out_of_stock,
        COUNT(*) FILTER (WHERE stock_quantity <= low_stock_threshold AND stock_quantity > 0) as low_stock,
        COUNT(*) FILTER (WHERE stock_quantity > low_stock_threshold) as in_stock,
        COALESCE(SUM(stock_quantity * price), 0) as total_inventory_value
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE ${whereClause}
    `, queryParams);

    res.json({
      products: result.rows,
      summary: summary.rows[0],
      filters: {
        category: category || 'all',
        low_stock_only: low_stock_only === 'true'
      }
    });

  } catch (error) {
    console.error('Inventory report error:', error);
    res.status(500).json({
      error: 'Failed to generate inventory report',
      error_ar: 'فشل في إنشاء تقرير المخزون',
      error_fr: 'Échec de génération du rapport d\'inventaire'
    });
  }
});

export default router;