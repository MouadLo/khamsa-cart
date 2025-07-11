"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db = __importStar(require("../config/database"));
const auth_1 = require("./auth");
const router = express_1.default.Router();
// Admin authorization middleware
function requireAdmin(req, res, next) {
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
router.use(auth_1.authenticateToken);
router.use(requireAdmin);
// Dashboard statistics
router.get('/dashboard/stats', async (req, res) => {
    try {
        const { period = '7d' } = req.query;
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
        const orderStats = await db.query(`
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
        const productStats = await db.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(*) FILTER (WHERE is_active = true) as active_products,
        COUNT(*) FILTER (WHERE stock_quantity <= low_stock_threshold) as low_stock_products,
        COUNT(*) FILTER (WHERE stock_quantity = 0) as out_of_stock_products
      FROM products
    `);
        // Get user statistics
        const userStats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE is_guest = false) as registered_users,
        COUNT(*) FILTER (WHERE is_guest = true) as guest_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d
      FROM users 
      WHERE type = 'customer'
    `);
        // Get COD statistics
        const codStats = await db.query(`
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
        const salesTrend = await db.query(`
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
        const topProducts = await db.query(`
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
        const dashboardStats = {
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
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch dashboard statistics',
            error_ar: 'فشل في جلب إحصائيات لوحة التحكم',
            error_fr: 'Échec de récupération des statistiques du tableau de bord'
        });
    }
});
// Get all orders with filters (admin view)
router.get('/orders', async (req, res) => {
    try {
        const { status, payment_method, page = '1', limit = '20', search, start_date, end_date } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let whereConditions = ['1=1'];
        let queryParams = [];
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
        const result = await db.query(query, queryParams);
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.user_id
      WHERE ${whereClause}
    `;
        const countResult = await db.query(countQuery, queryParams.slice(0, -2));
        const total = parseInt(countResult.rows[0].total);
        const pagination = {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            pages: Math.ceil(total / parseInt(limit))
        };
        res.json({
            orders: result.rows,
            pagination
        });
    }
    catch (error) {
        console.error('Admin orders fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch orders',
            error_ar: 'فشل في جلب الطلبات',
            error_fr: 'Échec de récupération des commandes'
        });
    }
});
// Update order status
router.patch('/orders/:order_id/status', async (req, res) => {
    try {
        const { order_id } = req.params;
        const { status, assigned_delivery_person, notes } = req.body;
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
        let queryParams = [order_id, status];
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
        const result = await db.query(updateQuery, queryParams);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Order not found',
                error_ar: 'الطلب غير موجود',
                error_fr: 'Commande non trouvée'
            });
        }
        // If order is cancelled, restore stock
        if (status === 'cancelled') {
            const itemsResult = await db.query(`
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
                }
                else {
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
    }
    catch (error) {
        console.error('Order status update error:', error);
        res.status(500).json({
            error: 'Failed to update order status',
            error_ar: 'فشل في تحديث حالة الطلب',
            error_fr: 'Échec de mise à jour du statut de commande'
        });
    }
});
// Get all users (admin view)
router.get('/users', async (req, res) => {
    try {
        const { type, page = '1', limit = '20', search, is_active } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let whereConditions = ['1=1'];
        let queryParams = [];
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
        const result = await db.query(query, queryParams);
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM users
      WHERE ${whereClause}
    `;
        const countResult = await db.query(countQuery, queryParams.slice(0, -2));
        const total = parseInt(countResult.rows[0].total);
        const pagination = {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            pages: Math.ceil(total / parseInt(limit))
        };
        res.json({
            users: result.rows,
            pagination
        });
    }
    catch (error) {
        console.error('Admin users fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch users',
            error_ar: 'فشل في جلب المستخدمين',
            error_fr: 'Échec de récupération des utilisateurs'
        });
    }
});
// Get inventory report
router.get('/inventory/report', async (req, res) => {
    try {
        const { category, low_stock_only = 'false' } = req.query;
        let whereConditions = ['p.is_active = true'];
        let queryParams = [];
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
        const result = await db.query(`
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
        const summary = await db.query(`
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
    }
    catch (error) {
        console.error('Inventory report error:', error);
        res.status(500).json({
            error: 'Failed to generate inventory report',
            error_ar: 'فشل في إنشاء تقرير المخزون',
            error_fr: 'Échec de génération du rapport d\'inventaire'
        });
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcm91dGVzL2FkbWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxzREFBbUU7QUFFbkUsdURBQXlDO0FBQ3pDLGlDQUEyQztBQUUzQyxNQUFNLE1BQU0sR0FBRyxpQkFBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBdUpoQyxpQ0FBaUM7QUFDakMsU0FBUyxZQUFZLENBQUMsR0FBWSxFQUFFLEdBQWEsRUFBRSxJQUFrQjtJQUNuRSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsRUFBRSxDQUFDO1FBQzVFLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSx1QkFBdUI7WUFDOUIsUUFBUSxFQUFFLHFCQUFxQjtZQUMvQixRQUFRLEVBQUUsNkJBQTZCO1NBQ3hDLENBQUMsQ0FBQztRQUNILE9BQU87SUFDVCxDQUFDO0lBQ0QsSUFBSSxFQUFFLENBQUM7QUFDVCxDQUFDO0FBRUQscURBQXFEO0FBQ3JELE1BQU0sQ0FBQyxHQUFHLENBQUMsd0JBQWlCLENBQUMsQ0FBQztBQUM5QixNQUFNLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRXpCLHVCQUF1QjtBQUN2QixNQUFNLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLEtBQUssRUFBRSxHQUFZLEVBQUUsR0FBYSxFQUE0QixFQUFFO0lBQzdGLElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxNQUFNLEdBQUcsSUFBSSxFQUFFLEdBQUcsR0FBRyxDQUFDLEtBQTRCLENBQUM7UUFFM0QsdUJBQXVCO1FBQ3ZCLElBQUksVUFBVSxHQUFHLEVBQUUs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aEIsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSTtZQUNyQixPQUFPLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDeEIsT0FBTyxFQUFFO2dCQUNQLFFBQVEsRUFBRSxRQUFRLElBQUksS0FBSztnQkFDM0IsY0FBYyxFQUFFLGNBQWMsS0FBSyxNQUFNO2FBQzFDO1NBQ0YsQ0FBQyxDQUFDO0lBRUwsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2hELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSxxQ0FBcUM7WUFDNUMsUUFBUSxFQUFFLDRCQUE0QjtZQUN0QyxRQUFRLEVBQUUsOENBQThDO1NBQ3pELENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILGtCQUFlLE1BQU0sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlLCBOZXh0RnVuY3Rpb24gfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IGJvZHksIHZhbGlkYXRpb25SZXN1bHQgfSBmcm9tICdleHByZXNzLXZhbGlkYXRvcic7XG5pbXBvcnQgKiBhcyBkYiBmcm9tICcuLi9jb25maWcvZGF0YWJhc2UnO1xuaW1wb3J0IHsgYXV0aGVudGljYXRlVG9rZW4gfSBmcm9tICcuL2F1dGgnO1xuXG5jb25zdCByb3V0ZXIgPSBleHByZXNzLlJvdXRlcigpO1xuXG4vLyBUeXBlIGRlZmluaXRpb25zXG5pbnRlcmZhY2UgQWRtaW5EYXNoYm9hcmRTdGF0cyB7XG4gIHBlcmlvZDogc3RyaW5nO1xuICBvcmRlcnM6IE9yZGVyU3RhdHM7XG4gIHByb2R1Y3RzOiBQcm9kdWN0U3RhdHM7XG4gIHVzZXJzOiBVc2VyU3RhdHM7XG4gIGNvZDogQ09EU3RhdHM7XG4gIHNhbGVzX3RyZW5kOiBTYWxlc1RyZW5kW107XG4gIHRvcF9wcm9kdWN0czogVG9wUHJvZHVjdFtdO1xuICBnZW5lcmF0ZWRfYXQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE9yZGVyU3RhdHMge1xuICB0b3RhbF9vcmRlcnM6IG51bWJlcjtcbiAgcGVuZGluZ19vcmRlcnM6IG51bWJlcjtcbiAgZGVsaXZlcmVkX29yZGVyczogbnVtYmVyO1xuICBjYW5jZWxsZWRfb3JkZXJzOiBudW1iZXI7XG4gIHRvdGFsX3JldmVudWU6IG51bWJlcjtcbiAgYXZnX29yZGVyX3ZhbHVlOiBudW1iZXI7XG4gIGNvZF9vcmRlcnM6IG51bWJlcjtcbiAgY2FyZF9vcmRlcnM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFByb2R1Y3RTdGF0cyB7XG4gIHRvdGFsX3Byb2R1Y3RzOiBudW1iZXI7XG4gIGFjdGl2ZV9wcm9kdWN0czogbnVtYmVyO1xuICBsb3dfc3RvY2tfcHJvZHVjdHM6IG51bWJlcjtcbiAgb3V0X29mX3N0b2NrX3Byb2R1Y3RzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBVc2VyU3RhdHMge1xuICB0b3RhbF91c2VyczogbnVtYmVyO1xuICByZWdpc3RlcmVkX3VzZXJzOiBudW1iZXI7XG4gIGd1ZXN0X3VzZXJzOiBudW1iZXI7XG4gIG5ld191c2Vyc183ZDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ09EU3RhdHMge1xuICB0b3RhbF9jb2RfY29sbGVjdGlvbnM6IG51bWJlcjtcbiAgcGVuZGluZ19jb2xsZWN0aW9uczogbnVtYmVyO1xuICBjb21wbGV0ZWRfY29sbGVjdGlvbnM6IG51bWJlcjtcbiAgcGVuZGluZ19hbW91bnQ6IG51bWJlcjtcbiAgY29sbGVjdGVkX2Ftb3VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2FsZXNUcmVuZCB7XG4gIGRhdGU6IHN0cmluZztcbiAgb3JkZXJzX2NvdW50OiBudW1iZXI7XG4gIGRhaWx5X3JldmVudWU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFRvcFByb2R1Y3Qge1xuICBwcm9kdWN0X2lkOiBzdHJpbmc7XG4gIHByb2R1Y3RfbmFtZTogc3RyaW5nO1xuICB0b3RhbF9zb2xkOiBudW1iZXI7XG4gIHRvdGFsX3JldmVudWU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFkbWluT3JkZXIge1xuICBvcmRlcl9pZDogc3RyaW5nO1xuICBvcmRlcl9udW1iZXI6IHN0cmluZztcbiAgdXNlcl9pZDogc3RyaW5nO1xuICBzdWJ0b3RhbDogbnVtYmVyO1xuICBkZWxpdmVyeV9mZWU6IG51bWJlcjtcbiAgdG90YWw6IG51bWJlcjtcbiAgcGF5bWVudF9tZXRob2Q6ICdjb2QnIHwgJ2NhcmQnO1xuICBwYXltZW50X3N0YXR1czogc3RyaW5nO1xuICBvcmRlcl9zdGF0dXM6IHN0cmluZztcbiAgZGVsaXZlcnlfYWRkcmVzczogc3RyaW5nO1xuICBjcmVhdGVkX2F0OiBzdHJpbmc7XG4gIHVwZGF0ZWRfYXQ6IHN0cmluZztcbiAgY3VzdG9tZXJfbmFtZTogc3RyaW5nO1xuICBjdXN0b21lcl9waG9uZTogc3RyaW5nO1xuICBpc19ndWVzdDogYm9vbGVhbjtcbiAgZGVsaXZlcnlfcGVyc29uX25hbWU/OiBzdHJpbmc7XG4gIGNvbGxlY3Rpb25fc3RhdHVzPzogc3RyaW5nO1xuICBjb2xsZWN0ZWRfYW1vdW50PzogbnVtYmVyO1xuICBpdGVtc19jb3VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQWRtaW5PcmRlckZpbHRlcnMge1xuICBzdGF0dXM/OiBzdHJpbmc7XG4gIHBheW1lbnRfbWV0aG9kPzogc3RyaW5nO1xuICBwYWdlPzogc3RyaW5nO1xuICBsaW1pdD86IHN0cmluZztcbiAgc2VhcmNoPzogc3RyaW5nO1xuICBzdGFydF9kYXRlPzogc3RyaW5nO1xuICBlbmRfZGF0ZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFVwZGF0ZU9yZGVyU3RhdHVzUmVxdWVzdCB7XG4gIHN0YXR1czogc3RyaW5nO1xuICBhc3NpZ25lZF9kZWxpdmVyeV9wZXJzb24/OiBzdHJpbmc7XG4gIG5vdGVzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQWRtaW5Vc2VyIHtcbiAgdXNlcl9pZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHBob25lOiBzdHJpbmc7XG4gIGVtYWlsOiBzdHJpbmc7XG4gIHR5cGU6IHN0cmluZztcbiAgaXNfZ3Vlc3Q6IGJvb2xlYW47XG4gIGlzX2FjdGl2ZTogYm9vbGVhbjtcbiAgY3JlYXRlZF9hdDogc3RyaW5nO1xuICBsYXN0X2xvZ2luPzogc3RyaW5nO1xuICB0b3RhbF9vcmRlcnM6IG51bWJlcjtcbiAgdG90YWxfc3BlbnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFkbWluVXNlckZpbHRlcnMge1xuICB0eXBlPzogc3RyaW5nO1xuICBwYWdlPzogc3RyaW5nO1xuICBsaW1pdD86IHN0cmluZztcbiAgc2VhcmNoPzogc3RyaW5nO1xuICBpc19hY3RpdmU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJbnZlbnRvcnlQcm9kdWN0IHtcbiAgcHJvZHVjdF9pZDogc3RyaW5nO1xuICBwcm9kdWN0X25hbWU6IHN0cmluZztcbiAgc3RvY2tfcXVhbnRpdHk6IG51bWJlcjtcbiAgbG93X3N0b2NrX3RocmVzaG9sZDogbnVtYmVyO1xuICBwcmljZTogbnVtYmVyO1xuICBjYXRlZ29yeV9uYW1lOiBzdHJpbmc7XG4gIHNvbGRfbGFzdF8zMGQ6IG51bWJlcjtcbiAgc3RvY2tfc3RhdHVzOiAnT3V0IG9mIFN0b2NrJyB8ICdMb3cgU3RvY2snIHwgJ0luIFN0b2NrJztcbn1cblxuaW50ZXJmYWNlIEludmVudG9yeUZpbHRlcnMge1xuICBjYXRlZ29yeT86IHN0cmluZztcbiAgbG93X3N0b2NrX29ubHk/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJbnZlbnRvcnlTdW1tYXJ5IHtcbiAgdG90YWxfcHJvZHVjdHM6IG51bWJlcjtcbiAgb3V0X29mX3N0b2NrOiBudW1iZXI7XG4gIGxvd19zdG9jazogbnVtYmVyO1xuICBpbl9zdG9jazogbnVtYmVyO1xuICB0b3RhbF9pbnZlbnRvcnlfdmFsdWU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFBhZ2luYXRpb25JbmZvIHtcbiAgcGFnZTogbnVtYmVyO1xuICBsaW1pdDogbnVtYmVyO1xuICB0b3RhbDogbnVtYmVyO1xuICBwYWdlczogbnVtYmVyO1xufVxuXG4vLyBBZG1pbiBhdXRob3JpemF0aW9uIG1pZGRsZXdhcmVcbmZ1bmN0aW9uIHJlcXVpcmVBZG1pbihyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbik6IHZvaWQge1xuICBpZiAoIXJlcS51c2VyIHx8IChyZXEudXNlci50eXBlICE9PSAnYWRtaW4nICYmIHJlcS51c2VyLnR5cGUgIT09ICdtYW5hZ2VyJykpIHtcbiAgICByZXMuc3RhdHVzKDQwMykuanNvbih7XG4gICAgICBlcnJvcjogJ0FkbWluIGFjY2VzcyByZXF1aXJlZCcsXG4gICAgICBlcnJvcl9hcjogJ9mF2LfZhNmI2Kgg2LXZhNin2K3ZitipINin2YTZhdiv2YrYsScsXG4gICAgICBlcnJvcl9mcjogJ0FjY8OocyBhZG1pbmlzdHJhdGV1ciByZXF1aXMnXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuLy8gQXBwbHkgYXV0aGVudGljYXRpb24gYW5kIGFkbWluIGNoZWNrIHRvIGFsbCByb3V0ZXNcbnJvdXRlci51c2UoYXV0aGVudGljYXRlVG9rZW4pO1xucm91dGVyLnVzZShyZXF1aXJlQWRtaW4pO1xuXG4vLyBEYXNoYm9hcmQgc3RhdGlzdGljc1xucm91dGVyLmdldCgnL2Rhc2hib2FyZC9zdGF0cycsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgcGVyaW9kID0gJzdkJyB9ID0gcmVxLnF1ZXJ5IGFzIHsgcGVyaW9kPzogc3RyaW5nIH07XG4gICAgXG4gICAgLy8gQ2FsY3VsYXRlIGRhdGUgcmFuZ2VcbiAgICBsZXQgZGF0ZUZpbHRlciA9ICcnO1xuICAgIHN3aXRjaCAocGVyaW9kKSB7XG4gICAgICBjYXNlICcyNGgnOlxuICAgICAgICBkYXRlRmlsdGVyID0gXCJBTkQgY3JlYXRlZF9hdCA+PSBOT1coKSAtIElOVEVSVkFMICcxIGRheSdcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICc3ZCc6XG4gICAgICAgIGRhdGVGaWx0ZXIgPSBcIkFORCBjcmVhdGVkX2F0ID49IE5PVygpIC0gSU5URVJWQUwgJzcgZGF5cydcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICczMGQnOlxuICAgICAgICBkYXRlRmlsdGVyID0gXCJBTkQgY3JlYXRlZF9hdCA+PSBOT1coKSAtIElOVEVSVkFMICczMCBkYXlzJ1wiO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJzkwZCc6XG4gICAgICAgIGRhdGVGaWx0ZXIgPSBcIkFORCBjcmVhdGVkX2F0ID49IE5PVygpIC0gSU5URVJWQUwgJzkwIGRheXMnXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgZGF0ZUZpbHRlciA9IFwiQU5EIGNyZWF0ZWRfYXQgPj0gTk9XKCkgLSBJTlRFUlZBTCAnNyBkYXlzJ1wiO1xuICAgIH1cblxuICAgIC8vIEdldCBvcmRlciBzdGF0aXN0aWNzXG4gICAgY29uc3Qgb3JkZXJTdGF0cyA9IGF3YWl0IGRiLnF1ZXJ5PE9yZGVyU3RhdHM+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgQ09VTlQoKikgYXMgdG90YWxfb3JkZXJzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIG9yZGVyX3N0YXR1cyA9ICdwZW5kaW5nJykgYXMgcGVuZGluZ19vcmRlcnMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgb3JkZXJfc3RhdHVzID0gJ2RlbGl2ZXJlZCcpIGFzIGRlbGl2ZXJlZF9vcmRlcnMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgb3JkZXJfc3RhdHVzID0gJ2NhbmNlbGxlZCcpIGFzIGNhbmNlbGxlZF9vcmRlcnMsXG4gICAgICAgIENPQUxFU0NFKFNVTSh0b3RhbCksIDApIGFzIHRvdGFsX3JldmVudWUsXG4gICAgICAgIENPQUxFU0NFKEFWRyh0b3RhbCksIDApIGFzIGF2Z19vcmRlcl92YWx1ZSxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBwYXltZW50X21ldGhvZCA9ICdjb2QnKSBhcyBjb2Rfb3JkZXJzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIHBheW1lbnRfbWV0aG9kID0gJ2NhcmQnKSBhcyBjYXJkX29yZGVyc1xuICAgICAgRlJPTSBvcmRlcnMgXG4gICAgICBXSEVSRSAxPTEgJHtkYXRlRmlsdGVyfVxuICAgIGApO1xuXG4gICAgLy8gR2V0IHByb2R1Y3Qgc3RhdGlzdGljc1xuICAgIGNvbnN0IHByb2R1Y3RTdGF0cyA9IGF3YWl0IGRiLnF1ZXJ5PFByb2R1Y3RTdGF0cz4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBDT1VOVCgqKSBhcyB0b3RhbF9wcm9kdWN0cyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBpc19hY3RpdmUgPSB0cnVlKSBhcyBhY3RpdmVfcHJvZHVjdHMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgc3RvY2tfcXVhbnRpdHkgPD0gbG93X3N0b2NrX3RocmVzaG9sZCkgYXMgbG93X3N0b2NrX3Byb2R1Y3RzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIHN0b2NrX3F1YW50aXR5ID0gMCkgYXMgb3V0X29mX3N0b2NrX3Byb2R1Y3RzXG4gICAgICBGUk9NIHByb2R1Y3RzXG4gICAgYCk7XG5cbiAgICAvLyBHZXQgdXNlciBzdGF0aXN0aWNzXG4gICAgY29uc3QgdXNlclN0YXRzID0gYXdhaXQgZGIucXVlcnk8VXNlclN0YXRzPihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIENPVU5UKCopIGFzIHRvdGFsX3VzZXJzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIGlzX2d1ZXN0ID0gZmFsc2UpIGFzIHJlZ2lzdGVyZWRfdXNlcnMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgaXNfZ3Vlc3QgPSB0cnVlKSBhcyBndWVzdF91c2VycyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBjcmVhdGVkX2F0ID49IE5PVygpIC0gSU5URVJWQUwgJzcgZGF5cycpIGFzIG5ld191c2Vyc183ZFxuICAgICAgRlJPTSB1c2VycyBcbiAgICAgIFdIRVJFIHR5cGUgPSAnY3VzdG9tZXInXG4gICAgYCk7XG5cbiAgICAvLyBHZXQgQ09EIHN0YXRpc3RpY3NcbiAgICBjb25zdCBjb2RTdGF0cyA9IGF3YWl0IGRiLnF1ZXJ5PENPRFN0YXRzPihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIENPVU5UKCopIGFzIHRvdGFsX2NvZF9jb2xsZWN0aW9ucyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBjb2xsZWN0aW9uX3N0YXR1cyA9ICdwZW5kaW5nJykgYXMgcGVuZGluZ19jb2xsZWN0aW9ucyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBjb2xsZWN0aW9uX3N0YXR1cyA9ICdjb2xsZWN0ZWQnKSBhcyBjb21wbGV0ZWRfY29sbGVjdGlvbnMsXG4gICAgICAgIENPQUxFU0NFKFNVTShhbW91bnRfdG9fY29sbGVjdCkgRklMVEVSIChXSEVSRSBjb2xsZWN0aW9uX3N0YXR1cyA9ICdwZW5kaW5nJyksIDApIGFzIHBlbmRpbmdfYW1vdW50LFxuICAgICAgICBDT0FMRVNDRShTVU0oY29sbGVjdGVkX2Ftb3VudCkgRklMVEVSIChXSEVSRSBjb2xsZWN0aW9uX3N0YXR1cyA9ICdjb2xsZWN0ZWQnKSwgMCkgYXMgY29sbGVjdGVkX2Ftb3VudFxuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgIFdIRVJFIDE9MSAke2RhdGVGaWx0ZXIucmVwbGFjZSgnY3JlYXRlZF9hdCcsICdvLmNyZWF0ZWRfYXQnKX1cbiAgICBgKTtcblxuICAgIC8vIEdldCBkYWlseSBzYWxlcyB0cmVuZFxuICAgIGNvbnN0IHNhbGVzVHJlbmQgPSBhd2FpdCBkYi5xdWVyeTxTYWxlc1RyZW5kPihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIERBVEUoY3JlYXRlZF9hdCkgYXMgZGF0ZSxcbiAgICAgICAgQ09VTlQoKikgYXMgb3JkZXJzX2NvdW50LFxuICAgICAgICBDT0FMRVNDRShTVU0odG90YWwpLCAwKSBhcyBkYWlseV9yZXZlbnVlXG4gICAgICBGUk9NIG9yZGVycyBcbiAgICAgIFdIRVJFIGNyZWF0ZWRfYXQgPj0gTk9XKCkgLSBJTlRFUlZBTCAnMzAgZGF5cydcbiAgICAgIEdST1VQIEJZIERBVEUoY3JlYXRlZF9hdClcbiAgICAgIE9SREVSIEJZIGRhdGUgREVTQ1xuICAgICAgTElNSVQgMzBcbiAgICBgKTtcblxuICAgIC8vIEdldCB0b3AgcHJvZHVjdHNcbiAgICBjb25zdCB0b3BQcm9kdWN0cyA9IGF3YWl0IGRiLnF1ZXJ5PFRvcFByb2R1Y3Q+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgcC5wcm9kdWN0X2lkLFxuICAgICAgICBwLm5hbWVfYXIgYXMgcHJvZHVjdF9uYW1lLFxuICAgICAgICBTVU0ob2kucXVhbnRpdHkpIGFzIHRvdGFsX3NvbGQsXG4gICAgICAgIFNVTShvaS50b3RhbF9wcmljZSkgYXMgdG90YWxfcmV2ZW51ZVxuICAgICAgRlJPTSBvcmRlcl9pdGVtcyBvaVxuICAgICAgSk9JTiBwcm9kdWN0cyBwIE9OIG9pLnByb2R1Y3RfaWQgPSBwLnByb2R1Y3RfaWRcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gb2kub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICBXSEVSRSBvLmNyZWF0ZWRfYXQgPj0gTk9XKCkgLSBJTlRFUlZBTCAnMzAgZGF5cydcbiAgICAgICAgQU5EIG8ub3JkZXJfc3RhdHVzIE5PVCBJTiAoJ2NhbmNlbGxlZCcpXG4gICAgICBHUk9VUCBCWSBwLnByb2R1Y3RfaWQsIHAubmFtZV9hclxuICAgICAgT1JERVIgQlkgdG90YWxfc29sZCBERVNDXG4gICAgICBMSU1JVCAxMFxuICAgIGApO1xuXG4gICAgY29uc3QgZGFzaGJvYXJkU3RhdHM6IEFkbWluRGFzaGJvYXJkU3RhdHMgPSB7XG4gICAgICBwZXJpb2Q6IHBlcmlvZCxcbiAgICAgIG9yZGVyczogb3JkZXJTdGF0cy5yb3dzWzBdLFxuICAgICAgcHJvZHVjdHM6IHByb2R1Y3RTdGF0cy5yb3dzWzBdLFxuICAgICAgdXNlcnM6IHVzZXJTdGF0cy5yb3dzWzBdLFxuICAgICAgY29kOiBjb2RTdGF0cy5yb3dzWzBdLFxuICAgICAgc2FsZXNfdHJlbmQ6IHNhbGVzVHJlbmQucm93cyxcbiAgICAgIHRvcF9wcm9kdWN0czogdG9wUHJvZHVjdHMucm93cyxcbiAgICAgIGdlbmVyYXRlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgfTtcblxuICAgIHJlcy5qc29uKGRhc2hib2FyZFN0YXRzKTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Rhc2hib2FyZCBzdGF0cyBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggZGFzaGJvYXJkIHN0YXRpc3RpY3MnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYrNmE2Kgg2KXYrdi12KfYptmK2KfYqiDZhNmI2K3YqSDYp9mE2KrYrdmD2YUnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZGVzIHN0YXRpc3RpcXVlcyBkdSB0YWJsZWF1IGRlIGJvcmQnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgYWxsIG9yZGVycyB3aXRoIGZpbHRlcnMgKGFkbWluIHZpZXcpXG5yb3V0ZXIuZ2V0KCcvb3JkZXJzJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBcbiAgICAgIHN0YXR1cywgXG4gICAgICBwYXltZW50X21ldGhvZCwgXG4gICAgICBwYWdlID0gJzEnLCBcbiAgICAgIGxpbWl0ID0gJzIwJywgXG4gICAgICBzZWFyY2gsXG4gICAgICBzdGFydF9kYXRlLFxuICAgICAgZW5kX2RhdGUgXG4gICAgfSA9IHJlcS5xdWVyeSBhcyBBZG1pbk9yZGVyRmlsdGVycztcbiAgICBcbiAgICBjb25zdCBvZmZzZXQgPSAocGFyc2VJbnQocGFnZSkgLSAxKSAqIHBhcnNlSW50KGxpbWl0KTtcbiAgICBcbiAgICBsZXQgd2hlcmVDb25kaXRpb25zID0gWycxPTEnXTtcbiAgICBsZXQgcXVlcnlQYXJhbXM6IGFueVtdID0gW107XG4gICAgbGV0IHBhcmFtQ291bnQgPSAwO1xuXG4gICAgLy8gU3RhdHVzIGZpbHRlclxuICAgIGlmIChzdGF0dXMpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBvLm9yZGVyX3N0YXR1cyA9ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHN0YXR1cyk7XG4gICAgfVxuXG4gICAgLy8gUGF5bWVudCBtZXRob2QgZmlsdGVyXG4gICAgaWYgKHBheW1lbnRfbWV0aG9kKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgby5wYXltZW50X21ldGhvZCA9ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHBheW1lbnRfbWV0aG9kKTtcbiAgICB9XG5cbiAgICAvLyBTZWFyY2ggZmlsdGVyIChvcmRlciBudW1iZXIgb3IgY3VzdG9tZXIgbmFtZS9waG9uZSlcbiAgICBpZiAoc2VhcmNoKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgKFxuICAgICAgICBvLm9yZGVyX251bWJlciBJTElLRSAkJHtwYXJhbUNvdW50fSBPUiBcbiAgICAgICAgdS5uYW1lIElMSUtFICQke3BhcmFtQ291bnR9IE9SIFxuICAgICAgICB1LnBob25lIElMSUtFICQke3BhcmFtQ291bnR9XG4gICAgICApYCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKGAlJHtzZWFyY2h9JWApO1xuICAgIH1cblxuICAgIC8vIERhdGUgcmFuZ2UgZmlsdGVyc1xuICAgIGlmIChzdGFydF9kYXRlKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgby5jcmVhdGVkX2F0ID49ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHN0YXJ0X2RhdGUpO1xuICAgIH1cblxuICAgIGlmIChlbmRfZGF0ZSkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYG8uY3JlYXRlZF9hdCA8PSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChlbmRfZGF0ZSk7XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPSB3aGVyZUNvbmRpdGlvbnMuam9pbignIEFORCAnKTtcblxuICAgIGNvbnN0IHF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBvLiosXG4gICAgICAgIHUubmFtZSBhcyBjdXN0b21lcl9uYW1lLFxuICAgICAgICB1LnBob25lIGFzIGN1c3RvbWVyX3Bob25lLFxuICAgICAgICB1LmlzX2d1ZXN0LFxuICAgICAgICBkcC5uYW1lIGFzIGRlbGl2ZXJ5X3BlcnNvbl9uYW1lLFxuICAgICAgICBjb2QuY29sbGVjdGlvbl9zdGF0dXMsXG4gICAgICAgIGNvZC5jb2xsZWN0ZWRfYW1vdW50LFxuICAgICAgICAoXG4gICAgICAgICAgU0VMRUNUIENPVU5UKCopIFxuICAgICAgICAgIEZST00gb3JkZXJfaXRlbXMgb2kgXG4gICAgICAgICAgV0hFUkUgb2kub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICAgICkgYXMgaXRlbXNfY291bnRcbiAgICAgIEZST00gb3JkZXJzIG9cbiAgICAgIExFRlQgSk9JTiB1c2VycyB1IE9OIG8udXNlcl9pZCA9IHUudXNlcl9pZFxuICAgICAgTEVGVCBKT0lOIHVzZXJzIGRwIE9OIG8uYXNzaWduZWRfZGVsaXZlcnlfcGVyc29uID0gZHAudXNlcl9pZFxuICAgICAgTEVGVCBKT0lOIGNvZF9jb2xsZWN0aW9ucyBjb2QgT04gby5vcmRlcl9pZCA9IGNvZC5vcmRlcl9pZFxuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICAgIE9SREVSIEJZIG8uY3JlYXRlZF9hdCBERVNDXG4gICAgICBMSU1JVCAkJHtwYXJhbUNvdW50ICsgMX0gT0ZGU0VUICQke3BhcmFtQ291bnQgKyAyfVxuICAgIGA7XG5cbiAgICBxdWVyeVBhcmFtcy5wdXNoKHBhcnNlSW50KGxpbWl0KSwgb2Zmc2V0KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PEFkbWluT3JkZXI+KHF1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICAvLyBHZXQgdG90YWwgY291bnRcbiAgICBjb25zdCBjb3VudFF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIENPVU5UKCopIGFzIHRvdGFsXG4gICAgICBGUk9NIG9yZGVycyBvXG4gICAgICBMRUZUIEpPSU4gdXNlcnMgdSBPTiBvLnVzZXJfaWQgPSB1LnVzZXJfaWRcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9XG4gICAgYDtcblxuICAgIGNvbnN0IGNvdW50UmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8e3RvdGFsOiBzdHJpbmd9Pihjb3VudFF1ZXJ5LCBxdWVyeVBhcmFtcy5zbGljZSgwLCAtMikpO1xuICAgIGNvbnN0IHRvdGFsID0gcGFyc2VJbnQoY291bnRSZXN1bHQucm93c1swXS50b3RhbCk7XG5cbiAgICBjb25zdCBwYWdpbmF0aW9uOiBQYWdpbmF0aW9uSW5mbyA9IHtcbiAgICAgIHBhZ2U6IHBhcnNlSW50KHBhZ2UpLFxuICAgICAgbGltaXQ6IHBhcnNlSW50KGxpbWl0KSxcbiAgICAgIHRvdGFsOiB0b3RhbCxcbiAgICAgIHBhZ2VzOiBNYXRoLmNlaWwodG90YWwgLyBwYXJzZUludChsaW1pdCkpXG4gICAgfTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIG9yZGVyczogcmVzdWx0LnJvd3MsXG4gICAgICBwYWdpbmF0aW9uXG4gICAgfSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdBZG1pbiBvcmRlcnMgZmV0Y2ggZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoIG9yZGVycycsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDYp9mE2LfZhNio2KfYqicsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZXMgY29tbWFuZGVzJ1xuICAgIH0pO1xuICB9XG59KTtcblxuLy8gVXBkYXRlIG9yZGVyIHN0YXR1c1xucm91dGVyLnBhdGNoKCcvb3JkZXJzLzpvcmRlcl9pZC9zdGF0dXMnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IG9yZGVyX2lkIH0gPSByZXEucGFyYW1zO1xuICAgIGNvbnN0IHsgc3RhdHVzLCBhc3NpZ25lZF9kZWxpdmVyeV9wZXJzb24sIG5vdGVzIH0gPSByZXEuYm9keSBhcyBVcGRhdGVPcmRlclN0YXR1c1JlcXVlc3Q7XG5cbiAgICBjb25zdCB2YWxpZFN0YXR1c2VzID0gW1xuICAgICAgJ3BlbmRpbmcnLCAnY29uZmlybWVkJywgJ3ByZXBhcmluZycsICdyZWFkeV9mb3JfcGlja3VwJyxcbiAgICAgICdvdXRfZm9yX2RlbGl2ZXJ5JywgJ2RlbGl2ZXJlZCcsICdjb21wbGV0ZWQnLCAnY2FuY2VsbGVkJ1xuICAgIF07XG5cbiAgICBpZiAoIXZhbGlkU3RhdHVzZXMuaW5jbHVkZXMoc3RhdHVzKSkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdJbnZhbGlkIG9yZGVyIHN0YXR1cycsXG4gICAgICAgIGVycm9yX2FyOiAn2K3Yp9mE2Kkg2KfZhNi32YTYqCDYutmK2LEg2LXYrdmK2K3YqScsXG4gICAgICAgIGVycm9yX2ZyOiAnU3RhdHV0IGRlIGNvbW1hbmRlIGludmFsaWRlJyxcbiAgICAgICAgdmFsaWRfc3RhdHVzZXM6IHZhbGlkU3RhdHVzZXNcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEJ1aWxkIHVwZGF0ZSBxdWVyeSBkeW5hbWljYWxseVxuICAgIGxldCB1cGRhdGVGaWVsZHMgPSBbJ29yZGVyX3N0YXR1cyA9ICQyJywgJ3VwZGF0ZWRfYXQgPSBOT1coKSddO1xuICAgIGxldCBxdWVyeVBhcmFtczogYW55W10gPSBbb3JkZXJfaWQsIHN0YXR1c107XG4gICAgbGV0IHBhcmFtQ291bnQgPSAyO1xuXG4gICAgaWYgKGFzc2lnbmVkX2RlbGl2ZXJ5X3BlcnNvbikge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgdXBkYXRlRmllbGRzLnB1c2goYGFzc2lnbmVkX2RlbGl2ZXJ5X3BlcnNvbiA9ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKGFzc2lnbmVkX2RlbGl2ZXJ5X3BlcnNvbik7XG4gICAgfVxuXG4gICAgaWYgKG5vdGVzKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB1cGRhdGVGaWVsZHMucHVzaChgYWRtaW5fbm90ZXMgPSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChub3Rlcyk7XG4gICAgfVxuXG4gICAgLy8gU3BlY2lhbCBoYW5kbGluZyBmb3IgZGVsaXZlcmVkIHN0YXR1c1xuICAgIGlmIChzdGF0dXMgPT09ICdkZWxpdmVyZWQnKSB7XG4gICAgICB1cGRhdGVGaWVsZHMucHVzaCgnZGVsaXZlcmVkX2F0ID0gTk9XKCknKTtcbiAgICB9XG5cbiAgICBjb25zdCB1cGRhdGVRdWVyeSA9IGBcbiAgICAgIFVQREFURSBvcmRlcnMgXG4gICAgICBTRVQgJHt1cGRhdGVGaWVsZHMuam9pbignLCAnKX1cbiAgICAgIFdIRVJFIG9yZGVyX2lkID0gJDFcbiAgICAgIFJFVFVSTklORyAqXG4gICAgYDtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PEFkbWluT3JkZXI+KHVwZGF0ZVF1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICBpZiAocmVzdWx0LnJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xuICAgICAgICBlcnJvcjogJ09yZGVyIG5vdCBmb3VuZCcsXG4gICAgICAgIGVycm9yX2FyOiAn2KfZhNi32YTYqCDYutmK2LEg2YXZiNis2YjYrycsXG4gICAgICAgIGVycm9yX2ZyOiAnQ29tbWFuZGUgbm9uIHRyb3V2w6llJ1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gSWYgb3JkZXIgaXMgY2FuY2VsbGVkLCByZXN0b3JlIHN0b2NrXG4gICAgaWYgKHN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcpIHtcbiAgICAgIGNvbnN0IGl0ZW1zUmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8e3Byb2R1Y3RfaWQ6IHN0cmluZywgdmFyaWFudF9pZDogc3RyaW5nIHwgbnVsbCwgcXVhbnRpdHk6IG51bWJlcn0+KGBcbiAgICAgICAgU0VMRUNUIG9pLnByb2R1Y3RfaWQsIG9pLnZhcmlhbnRfaWQsIG9pLnF1YW50aXR5XG4gICAgICAgIEZST00gb3JkZXJfaXRlbXMgb2lcbiAgICAgICAgV0hFUkUgb2kub3JkZXJfaWQgPSAkMVxuICAgICAgYCwgW29yZGVyX2lkXSk7XG5cbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtc1Jlc3VsdC5yb3dzKSB7XG4gICAgICAgIGlmIChpdGVtLnZhcmlhbnRfaWQpIHtcbiAgICAgICAgICBhd2FpdCBkYi5xdWVyeShgXG4gICAgICAgICAgICBVUERBVEUgcHJvZHVjdF92YXJpYW50cyBcbiAgICAgICAgICAgIFNFVCBzdG9ja19xdWFudGl0eSA9IHN0b2NrX3F1YW50aXR5ICsgJDEgXG4gICAgICAgICAgICBXSEVSRSB2YXJpYW50X2lkID0gJDJcbiAgICAgICAgICBgLCBbaXRlbS5xdWFudGl0eSwgaXRlbS52YXJpYW50X2lkXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgZGIucXVlcnkoYFxuICAgICAgICAgICAgVVBEQVRFIHByb2R1Y3RzIFxuICAgICAgICAgICAgU0VUIHN0b2NrX3F1YW50aXR5ID0gc3RvY2tfcXVhbnRpdHkgKyAkMSBcbiAgICAgICAgICAgIFdIRVJFIHByb2R1Y3RfaWQgPSAkMlxuICAgICAgICAgIGAsIFtpdGVtLnF1YW50aXR5LCBpdGVtLnByb2R1Y3RfaWRdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJlcy5qc29uKHtcbiAgICAgIG1lc3NhZ2U6ICdPcmRlciBzdGF0dXMgdXBkYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgbWVzc2FnZV9hcjogJ9iq2YUg2KrYrdiv2YrYqyDYrdin2YTYqSDYp9mE2LfZhNioINio2YbYrNin2K0nLFxuICAgICAgbWVzc2FnZV9mcjogJ1N0YXR1dCBkZSBjb21tYW5kZSBtaXMgw6Agam91ciBhdmVjIHN1Y2PDqHMnLFxuICAgICAgb3JkZXI6IHJlc3VsdC5yb3dzWzBdXG4gICAgfSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdPcmRlciBzdGF0dXMgdXBkYXRlIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byB1cGRhdGUgb3JkZXIgc3RhdHVzJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KrYrdiv2YrYqyDYrdin2YTYqSDYp9mE2LfZhNioJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIG1pc2Ugw6Agam91ciBkdSBzdGF0dXQgZGUgY29tbWFuZGUnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgYWxsIHVzZXJzIChhZG1pbiB2aWV3KVxucm91dGVyLmdldCgnL3VzZXJzJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyB0eXBlLCBwYWdlID0gJzEnLCBsaW1pdCA9ICcyMCcsIHNlYXJjaCwgaXNfYWN0aXZlIH0gPSByZXEucXVlcnkgYXMgQWRtaW5Vc2VyRmlsdGVycztcbiAgICBjb25zdCBvZmZzZXQgPSAocGFyc2VJbnQocGFnZSkgLSAxKSAqIHBhcnNlSW50KGxpbWl0KTtcblxuICAgIGxldCB3aGVyZUNvbmRpdGlvbnMgPSBbJzE9MSddO1xuICAgIGxldCBxdWVyeVBhcmFtczogYW55W10gPSBbXTtcbiAgICBsZXQgcGFyYW1Db3VudCA9IDA7XG5cbiAgICAvLyBVc2VyIHR5cGUgZmlsdGVyXG4gICAgaWYgKHR5cGUpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGB0eXBlID0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2godHlwZSk7XG4gICAgfVxuXG4gICAgLy8gQWN0aXZlIHN0YXR1cyBmaWx0ZXJcbiAgICBpZiAoaXNfYWN0aXZlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBpc19hY3RpdmUgPSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChpc19hY3RpdmUgPT09ICd0cnVlJyk7XG4gICAgfVxuXG4gICAgLy8gU2VhcmNoIGZpbHRlclxuICAgIGlmIChzZWFyY2gpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGAoXG4gICAgICAgIG5hbWUgSUxJS0UgJCR7cGFyYW1Db3VudH0gT1IgXG4gICAgICAgIHBob25lIElMSUtFICQke3BhcmFtQ291bnR9IE9SIFxuICAgICAgICBlbWFpbCBJTElLRSAkJHtwYXJhbUNvdW50fVxuICAgICAgKWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChgJSR7c2VhcmNofSVgKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlQ29uZGl0aW9ucy5qb2luKCcgQU5EICcpO1xuXG4gICAgY29uc3QgcXVlcnkgPSBgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHVzZXJfaWQsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIHBob25lLFxuICAgICAgICBlbWFpbCxcbiAgICAgICAgdHlwZSxcbiAgICAgICAgaXNfZ3Vlc3QsXG4gICAgICAgIGlzX2FjdGl2ZSxcbiAgICAgICAgY3JlYXRlZF9hdCxcbiAgICAgICAgbGFzdF9sb2dpbixcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKSBcbiAgICAgICAgICBGUk9NIG9yZGVycyBcbiAgICAgICAgICBXSEVSRSB1c2VyX2lkID0gdXNlcnMudXNlcl9pZFxuICAgICAgICApIGFzIHRvdGFsX29yZGVycyxcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBDT0FMRVNDRShTVU0odG90YWwpLCAwKSBcbiAgICAgICAgICBGUk9NIG9yZGVycyBcbiAgICAgICAgICBXSEVSRSB1c2VyX2lkID0gdXNlcnMudXNlcl9pZCBBTkQgb3JkZXJfc3RhdHVzID0gJ2RlbGl2ZXJlZCdcbiAgICAgICAgKSBhcyB0b3RhbF9zcGVudFxuICAgICAgRlJPTSB1c2Vyc1xuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICAgIE9SREVSIEJZIGNyZWF0ZWRfYXQgREVTQ1xuICAgICAgTElNSVQgJCR7cGFyYW1Db3VudCArIDF9IE9GRlNFVCAkJHtwYXJhbUNvdW50ICsgMn1cbiAgICBgO1xuXG4gICAgcXVlcnlQYXJhbXMucHVzaChwYXJzZUludChsaW1pdCksIG9mZnNldCk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxBZG1pblVzZXI+KHF1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICAvLyBHZXQgdG90YWwgY291bnRcbiAgICBjb25zdCBjb3VudFF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIENPVU5UKCopIGFzIHRvdGFsXG4gICAgICBGUk9NIHVzZXJzXG4gICAgICBXSEVSRSAke3doZXJlQ2xhdXNlfVxuICAgIGA7XG5cbiAgICBjb25zdCBjb3VudFJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PHt0b3RhbDogc3RyaW5nfT4oY291bnRRdWVyeSwgcXVlcnlQYXJhbXMuc2xpY2UoMCwgLTIpKTtcbiAgICBjb25zdCB0b3RhbCA9IHBhcnNlSW50KGNvdW50UmVzdWx0LnJvd3NbMF0udG90YWwpO1xuXG4gICAgY29uc3QgcGFnaW5hdGlvbjogUGFnaW5hdGlvbkluZm8gPSB7XG4gICAgICBwYWdlOiBwYXJzZUludChwYWdlKSxcbiAgICAgIGxpbWl0OiBwYXJzZUludChsaW1pdCksXG4gICAgICB0b3RhbDogdG90YWwsXG4gICAgICBwYWdlczogTWF0aC5jZWlsKHRvdGFsIC8gcGFyc2VJbnQobGltaXQpKVxuICAgIH07XG5cbiAgICByZXMuanNvbih7XG4gICAgICB1c2VyczogcmVzdWx0LnJvd3MsXG4gICAgICBwYWdpbmF0aW9uXG4gICAgfSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdBZG1pbiB1c2VycyBmZXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggdXNlcnMnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYrNmE2Kgg2KfZhNmF2LPYqtiu2K/ZhdmK2YYnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZGVzIHV0aWxpc2F0ZXVycydcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIEdldCBpbnZlbnRvcnkgcmVwb3J0XG5yb3V0ZXIuZ2V0KCcvaW52ZW50b3J5L3JlcG9ydCcsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgY2F0ZWdvcnksIGxvd19zdG9ja19vbmx5ID0gJ2ZhbHNlJyB9ID0gcmVxLnF1ZXJ5IGFzIEludmVudG9yeUZpbHRlcnM7XG5cbiAgICBsZXQgd2hlcmVDb25kaXRpb25zID0gWydwLmlzX2FjdGl2ZSA9IHRydWUnXTtcbiAgICBsZXQgcXVlcnlQYXJhbXM6IGFueVtdID0gW107XG4gICAgbGV0IHBhcmFtQ291bnQgPSAwO1xuXG4gICAgaWYgKGNhdGVnb3J5KSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgYy5uYW1lX2VuIElMSUtFICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKGAlJHtjYXRlZ29yeX0lYCk7XG4gICAgfVxuXG4gICAgaWYgKGxvd19zdG9ja19vbmx5ID09PSAndHJ1ZScpIHtcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKCdwLnN0b2NrX3F1YW50aXR5IDw9IHAubG93X3N0b2NrX3RocmVzaG9sZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmVDb25kaXRpb25zLmpvaW4oJyBBTkQgJyk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxJbnZlbnRvcnlQcm9kdWN0PihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHAucHJvZHVjdF9pZCxcbiAgICAgICAgcC5uYW1lX2FyIGFzIHByb2R1Y3RfbmFtZSxcbiAgICAgICAgcC5zdG9ja19xdWFudGl0eSxcbiAgICAgICAgcC5sb3dfc3RvY2tfdGhyZXNob2xkLFxuICAgICAgICBwLnByaWNlLFxuICAgICAgICBjLm5hbWVfYXIgYXMgY2F0ZWdvcnlfbmFtZSxcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBTVU0ocXVhbnRpdHkpIFxuICAgICAgICAgIEZST00gb3JkZXJfaXRlbXMgb2kgXG4gICAgICAgICAgSk9JTiBvcmRlcnMgbyBPTiBvaS5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgICAgICBXSEVSRSBvaS5wcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkIFxuICAgICAgICAgICAgQU5EIG8uY3JlYXRlZF9hdCA+PSBOT1coKSAtIElOVEVSVkFMICczMCBkYXlzJ1xuICAgICAgICAgICAgQU5EIG8ub3JkZXJfc3RhdHVzIE5PVCBJTiAoJ2NhbmNlbGxlZCcpXG4gICAgICAgICkgYXMgc29sZF9sYXN0XzMwZCxcbiAgICAgICAgQ0FTRSBcbiAgICAgICAgICBXSEVOIHAuc3RvY2tfcXVhbnRpdHkgPSAwIFRIRU4gJ091dCBvZiBTdG9jaydcbiAgICAgICAgICBXSEVOIHAuc3RvY2tfcXVhbnRpdHkgPD0gcC5sb3dfc3RvY2tfdGhyZXNob2xkIFRIRU4gJ0xvdyBTdG9jaydcbiAgICAgICAgICBFTFNFICdJbiBTdG9jaydcbiAgICAgICAgRU5EIGFzIHN0b2NrX3N0YXR1c1xuICAgICAgRlJPTSBwcm9kdWN0cyBwXG4gICAgICBMRUZUIEpPSU4gY2F0ZWdvcmllcyBjIE9OIHAuY2F0ZWdvcnlfaWQgPSBjLmNhdGVnb3J5X2lkXG4gICAgICBXSEVSRSAke3doZXJlQ2xhdXNlfVxuICAgICAgT1JERVIgQlkgXG4gICAgICAgIENBU0UgXG4gICAgICAgICAgV0hFTiBwLnN0b2NrX3F1YW50aXR5ID0gMCBUSEVOIDFcbiAgICAgICAgICBXSEVOIHAuc3RvY2tfcXVhbnRpdHkgPD0gcC5sb3dfc3RvY2tfdGhyZXNob2xkIFRIRU4gMlxuICAgICAgICAgIEVMU0UgM1xuICAgICAgICBFTkQsXG4gICAgICAgIHAubmFtZV9hclxuICAgIGAsIHF1ZXJ5UGFyYW1zKTtcblxuICAgIC8vIEdldCBzdW1tYXJ5IHN0YXRpc3RpY3NcbiAgICBjb25zdCBzdW1tYXJ5ID0gYXdhaXQgZGIucXVlcnk8SW52ZW50b3J5U3VtbWFyeT4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBDT1VOVCgqKSBhcyB0b3RhbF9wcm9kdWN0cyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBzdG9ja19xdWFudGl0eSA9IDApIGFzIG91dF9vZl9zdG9jayxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBzdG9ja19xdWFudGl0eSA8PSBsb3dfc3RvY2tfdGhyZXNob2xkIEFORCBzdG9ja19xdWFudGl0eSA+IDApIGFzIGxvd19zdG9jayxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBzdG9ja19xdWFudGl0eSA+IGxvd19zdG9ja190aHJlc2hvbGQpIGFzIGluX3N0b2NrLFxuICAgICAgICBDT0FMRVNDRShTVU0oc3RvY2tfcXVhbnRpdHkgKiBwcmljZSksIDApIGFzIHRvdGFsX2ludmVudG9yeV92YWx1ZVxuICAgICAgRlJPTSBwcm9kdWN0cyBwXG4gICAgICBMRUZUIEpPSU4gY2F0ZWdvcmllcyBjIE9OIHAuY2F0ZWdvcnlfaWQgPSBjLmNhdGVnb3J5X2lkXG4gICAgICBXSEVSRSAke3doZXJlQ2xhdXNlfVxuICAgIGAsIHF1ZXJ5UGFyYW1zKTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIHByb2R1Y3RzOiByZXN1bHQucm93cyxcbiAgICAgIHN1bW1hcnk6IHN1bW1hcnkucm93c1swXSxcbiAgICAgIGZpbHRlcnM6IHtcbiAgICAgICAgY2F0ZWdvcnk6IGNhdGVnb3J5IHx8ICdhbGwnLFxuICAgICAgICBsb3dfc3RvY2tfb25seTogbG93X3N0b2NrX29ubHkgPT09ICd0cnVlJ1xuICAgICAgfVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignSW52ZW50b3J5IHJlcG9ydCBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZ2VuZXJhdGUgaW52ZW50b3J5IHJlcG9ydCcsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINil2YbYtNin2KEg2KrZgtix2YrYsSDYp9mE2YXYrtiy2YjZhicsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSBnw6luw6lyYXRpb24gZHUgcmFwcG9ydCBkXFwnaW52ZW50YWlyZSdcbiAgICB9KTtcbiAgfVxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IHJvdXRlcjsiXX0=