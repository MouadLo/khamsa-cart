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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRtaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcm91dGVzL2FkbWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsc0RBQW1FO0FBRW5FLHVEQUF5QztBQUN6QyxpQ0FBMkM7QUFFM0MsTUFBTSxNQUFNLEdBQUcsaUJBQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQXVKaEMsaUNBQWlDO0FBQ2pDLFNBQVMsWUFBWSxDQUFDLEdBQVksRUFBRSxHQUFhLEVBQUUsSUFBa0I7SUFDbkUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUM1RSxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUsdUJBQXVCO1lBQzlCLFFBQVEsRUFBRSxxQkFBcUI7WUFDL0IsUUFBUSxFQUFFLDZCQUE2QjtTQUN4QyxDQUFDLENBQUM7UUFDSCxPQUFPO0lBQ1QsQ0FBQztJQUNELElBQUksRUFBRSxDQUFDO0FBQ1QsQ0FBQztBQUVELHFEQUFxRDtBQUNyRCxNQUFNLENBQUMsR0FBRyxDQUFDLHdCQUFpQixDQUFDLENBQUM7QUFDOUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUV6Qix1QkFBdUI7QUFDdkIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBNEIsRUFBRTtJQUM3RixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxHQUFHLElBQUksRUFBRSxHQUFHLEdBQUcsQ0FBQyxLQUE0QixDQUFDO1FBRTNELHVCQUF1QjtRQUN2QixJQUFJLFVBQVUs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QyxDQUFDO1FBRWhCLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDUCxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUk7WUFDckIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE9BQU8sRUFBRTtnQkFDUCxRQUFRLEVBQUUsUUFBUSxJQUFJLEtBQUs7Z0JBQzNCLGNBQWMsRUFBRSxjQUFjLEtBQUssTUFBTTthQUMxQztTQUNGLENBQUMsQ0FBQztJQUVMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUscUNBQXFDO1lBQzVDLFFBQVEsRUFBRSw0QkFBNEI7WUFDdEMsUUFBUSxFQUFFLDhDQUE4QztTQUN6RCxDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZXhwcmVzcywgeyBSZXF1ZXN0LCBSZXNwb25zZSwgTmV4dEZ1bmN0aW9uIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyBib2R5LCB2YWxpZGF0aW9uUmVzdWx0IH0gZnJvbSAnZXhwcmVzcy12YWxpZGF0b3InO1xuaW1wb3J0ICogYXMgZGIgZnJvbSAnLi4vY29uZmlnL2RhdGFiYXNlJztcbmltcG9ydCB7IGF1dGhlbnRpY2F0ZVRva2VuIH0gZnJvbSAnLi9hdXRoJztcblxuY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcblxuLy8gVHlwZSBkZWZpbml0aW9uc1xuaW50ZXJmYWNlIEFkbWluRGFzaGJvYXJkU3RhdHMge1xuICBwZXJpb2Q6IHN0cmluZztcbiAgb3JkZXJzOiBPcmRlclN0YXRzO1xuICBwcm9kdWN0czogUHJvZHVjdFN0YXRzO1xuICB1c2VyczogVXNlclN0YXRzO1xuICBjb2Q6IENPRFN0YXRzO1xuICBzYWxlc190cmVuZDogU2FsZXNUcmVuZFtdO1xuICB0b3BfcHJvZHVjdHM6IFRvcFByb2R1Y3RbXTtcbiAgZ2VuZXJhdGVkX2F0OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBPcmRlclN0YXRzIHtcbiAgdG90YWxfb3JkZXJzOiBudW1iZXI7XG4gIHBlbmRpbmdfb3JkZXJzOiBudW1iZXI7XG4gIGRlbGl2ZXJlZF9vcmRlcnM6IG51bWJlcjtcbiAgY2FuY2VsbGVkX29yZGVyczogbnVtYmVyO1xuICB0b3RhbF9yZXZlbnVlOiBudW1iZXI7XG4gIGF2Z19vcmRlcl92YWx1ZTogbnVtYmVyO1xuICBjb2Rfb3JkZXJzOiBudW1iZXI7XG4gIGNhcmRfb3JkZXJzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQcm9kdWN0U3RhdHMge1xuICB0b3RhbF9wcm9kdWN0czogbnVtYmVyO1xuICBhY3RpdmVfcHJvZHVjdHM6IG51bWJlcjtcbiAgbG93X3N0b2NrX3Byb2R1Y3RzOiBudW1iZXI7XG4gIG91dF9vZl9zdG9ja19wcm9kdWN0czogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgVXNlclN0YXRzIHtcbiAgdG90YWxfdXNlcnM6IG51bWJlcjtcbiAgcmVnaXN0ZXJlZF91c2VyczogbnVtYmVyO1xuICBndWVzdF91c2VyczogbnVtYmVyO1xuICBuZXdfdXNlcnNfN2Q6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENPRFN0YXRzIHtcbiAgdG90YWxfY29kX2NvbGxlY3Rpb25zOiBudW1iZXI7XG4gIHBlbmRpbmdfY29sbGVjdGlvbnM6IG51bWJlcjtcbiAgY29tcGxldGVkX2NvbGxlY3Rpb25zOiBudW1iZXI7XG4gIHBlbmRpbmdfYW1vdW50OiBudW1iZXI7XG4gIGNvbGxlY3RlZF9hbW91bnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNhbGVzVHJlbmQge1xuICBkYXRlOiBzdHJpbmc7XG4gIG9yZGVyc19jb3VudDogbnVtYmVyO1xuICBkYWlseV9yZXZlbnVlOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBUb3BQcm9kdWN0IHtcbiAgcHJvZHVjdF9pZDogc3RyaW5nO1xuICBwcm9kdWN0X25hbWU6IHN0cmluZztcbiAgdG90YWxfc29sZDogbnVtYmVyO1xuICB0b3RhbF9yZXZlbnVlOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBBZG1pbk9yZGVyIHtcbiAgb3JkZXJfaWQ6IHN0cmluZztcbiAgb3JkZXJfbnVtYmVyOiBzdHJpbmc7XG4gIHVzZXJfaWQ6IHN0cmluZztcbiAgc3VidG90YWw6IG51bWJlcjtcbiAgZGVsaXZlcnlfZmVlOiBudW1iZXI7XG4gIHRvdGFsOiBudW1iZXI7XG4gIHBheW1lbnRfbWV0aG9kOiAnY29kJyB8ICdjYXJkJztcbiAgcGF5bWVudF9zdGF0dXM6IHN0cmluZztcbiAgb3JkZXJfc3RhdHVzOiBzdHJpbmc7XG4gIGRlbGl2ZXJ5X2FkZHJlc3M6IHN0cmluZztcbiAgY3JlYXRlZF9hdDogc3RyaW5nO1xuICB1cGRhdGVkX2F0OiBzdHJpbmc7XG4gIGN1c3RvbWVyX25hbWU6IHN0cmluZztcbiAgY3VzdG9tZXJfcGhvbmU6IHN0cmluZztcbiAgaXNfZ3Vlc3Q6IGJvb2xlYW47XG4gIGRlbGl2ZXJ5X3BlcnNvbl9uYW1lPzogc3RyaW5nO1xuICBjb2xsZWN0aW9uX3N0YXR1cz86IHN0cmluZztcbiAgY29sbGVjdGVkX2Ftb3VudD86IG51bWJlcjtcbiAgaXRlbXNfY291bnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEFkbWluT3JkZXJGaWx0ZXJzIHtcbiAgc3RhdHVzPzogc3RyaW5nO1xuICBwYXltZW50X21ldGhvZD86IHN0cmluZztcbiAgcGFnZT86IHN0cmluZztcbiAgbGltaXQ/OiBzdHJpbmc7XG4gIHNlYXJjaD86IHN0cmluZztcbiAgc3RhcnRfZGF0ZT86IHN0cmluZztcbiAgZW5kX2RhdGU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBVcGRhdGVPcmRlclN0YXR1c1JlcXVlc3Qge1xuICBzdGF0dXM6IHN0cmluZztcbiAgYXNzaWduZWRfZGVsaXZlcnlfcGVyc29uPzogc3RyaW5nO1xuICBub3Rlcz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFkbWluVXNlciB7XG4gIHVzZXJfaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBwaG9uZTogc3RyaW5nO1xuICBlbWFpbDogc3RyaW5nO1xuICB0eXBlOiBzdHJpbmc7XG4gIGlzX2d1ZXN0OiBib29sZWFuO1xuICBpc19hY3RpdmU6IGJvb2xlYW47XG4gIGNyZWF0ZWRfYXQ6IHN0cmluZztcbiAgbGFzdF9sb2dpbj86IHN0cmluZztcbiAgdG90YWxfb3JkZXJzOiBudW1iZXI7XG4gIHRvdGFsX3NwZW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBBZG1pblVzZXJGaWx0ZXJzIHtcbiAgdHlwZT86IHN0cmluZztcbiAgcGFnZT86IHN0cmluZztcbiAgbGltaXQ/OiBzdHJpbmc7XG4gIHNlYXJjaD86IHN0cmluZztcbiAgaXNfYWN0aXZlPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSW52ZW50b3J5UHJvZHVjdCB7XG4gIHByb2R1Y3RfaWQ6IHN0cmluZztcbiAgcHJvZHVjdF9uYW1lOiBzdHJpbmc7XG4gIHN0b2NrX3F1YW50aXR5OiBudW1iZXI7XG4gIGxvd19zdG9ja190aHJlc2hvbGQ6IG51bWJlcjtcbiAgcHJpY2U6IG51bWJlcjtcbiAgY2F0ZWdvcnlfbmFtZTogc3RyaW5nO1xuICBzb2xkX2xhc3RfMzBkOiBudW1iZXI7XG4gIHN0b2NrX3N0YXR1czogJ091dCBvZiBTdG9jaycgfCAnTG93IFN0b2NrJyB8ICdJbiBTdG9jayc7XG59XG5cbmludGVyZmFjZSBJbnZlbnRvcnlGaWx0ZXJzIHtcbiAgY2F0ZWdvcnk/OiBzdHJpbmc7XG4gIGxvd19zdG9ja19vbmx5Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSW52ZW50b3J5U3VtbWFyeSB7XG4gIHRvdGFsX3Byb2R1Y3RzOiBudW1iZXI7XG4gIG91dF9vZl9zdG9jazogbnVtYmVyO1xuICBsb3dfc3RvY2s6IG51bWJlcjtcbiAgaW5fc3RvY2s6IG51bWJlcjtcbiAgdG90YWxfaW52ZW50b3J5X3ZhbHVlOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQYWdpbmF0aW9uSW5mbyB7XG4gIHBhZ2U6IG51bWJlcjtcbiAgbGltaXQ6IG51bWJlcjtcbiAgdG90YWw6IG51bWJlcjtcbiAgcGFnZXM6IG51bWJlcjtcbn1cblxuLy8gQWRtaW4gYXV0aG9yaXphdGlvbiBtaWRkbGV3YXJlXG5mdW5jdGlvbiByZXF1aXJlQWRtaW4ocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlLCBuZXh0OiBOZXh0RnVuY3Rpb24pOiB2b2lkIHtcbiAgaWYgKCFyZXEudXNlciB8fCAocmVxLnVzZXIudHlwZSAhPT0gJ2FkbWluJyAmJiByZXEudXNlci50eXBlICE9PSAnbWFuYWdlcicpKSB7XG4gICAgcmVzLnN0YXR1cyg0MDMpLmpzb24oe1xuICAgICAgZXJyb3I6ICdBZG1pbiBhY2Nlc3MgcmVxdWlyZWQnLFxuICAgICAgZXJyb3JfYXI6ICfZhdi32YTZiNioINi12YTYp9it2YrYqSDYp9mE2YXYr9mK2LEnLFxuICAgICAgZXJyb3JfZnI6ICdBY2PDqHMgYWRtaW5pc3RyYXRldXIgcmVxdWlzJ1xuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuICBuZXh0KCk7XG59XG5cbi8vIEFwcGx5IGF1dGhlbnRpY2F0aW9uIGFuZCBhZG1pbiBjaGVjayB0byBhbGwgcm91dGVzXG5yb3V0ZXIudXNlKGF1dGhlbnRpY2F0ZVRva2VuKTtcbnJvdXRlci51c2UocmVxdWlyZUFkbWluKTtcblxuLy8gRGFzaGJvYXJkIHN0YXRpc3RpY3NcbnJvdXRlci5nZXQoJy9kYXNoYm9hcmQvc3RhdHMnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHBlcmlvZCA9ICc3ZCcgfSA9IHJlcS5xdWVyeSBhcyB7IHBlcmlvZD86IHN0cmluZyB9O1xuICAgIFxuICAgIC8vIENhbGN1bGF0ZSBkYXRlIHJhbmdlXG4gICAgbGV0IGRhdGVGaWx0ZXIgPSAnJztcbiAgICBzd2l0Y2ggKHBlcmlvZCkge1xuICAgICAgY2FzZSAnMjRoJzpcbiAgICAgICAgZGF0ZUZpbHRlciA9IFwiQU5EIGNyZWF0ZWRfYXQgPj0gTk9XKCkgLSBJTlRFUlZBTCAnMSBkYXknXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnN2QnOlxuICAgICAgICBkYXRlRmlsdGVyID0gXCJBTkQgY3JlYXRlZF9hdCA+PSBOT1coKSAtIElOVEVSVkFMICc3IGRheXMnXCI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnMzBkJzpcbiAgICAgICAgZGF0ZUZpbHRlciA9IFwiQU5EIGNyZWF0ZWRfYXQgPj0gTk9XKCkgLSBJTlRFUlZBTCAnMzAgZGF5cydcIjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICc5MGQnOlxuICAgICAgICBkYXRlRmlsdGVyID0gXCJBTkQgY3JlYXRlZF9hdCA+PSBOT1coKSAtIElOVEVSVkFMICc5MCBkYXlzJ1wiO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGRhdGVGaWx0ZXIgPSBcIkFORCBjcmVhdGVkX2F0ID49IE5PVygpIC0gSU5URVJWQUwgJzcgZGF5cydcIjtcbiAgICB9XG5cbiAgICAvLyBHZXQgb3JkZXIgc3RhdGlzdGljc1xuICAgIGNvbnN0IG9yZGVyU3RhdHMgPSBhd2FpdCBkYi5xdWVyeTxPcmRlclN0YXRzPihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIENPVU5UKCopIGFzIHRvdGFsX29yZGVycyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBvcmRlcl9zdGF0dXMgPSAncGVuZGluZycpIGFzIHBlbmRpbmdfb3JkZXJzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIG9yZGVyX3N0YXR1cyA9ICdkZWxpdmVyZWQnKSBhcyBkZWxpdmVyZWRfb3JkZXJzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIG9yZGVyX3N0YXR1cyA9ICdjYW5jZWxsZWQnKSBhcyBjYW5jZWxsZWRfb3JkZXJzLFxuICAgICAgICBDT0FMRVNDRShTVU0odG90YWwpLCAwKSBhcyB0b3RhbF9yZXZlbnVlLFxuICAgICAgICBDT0FMRVNDRShBVkcodG90YWwpLCAwKSBhcyBhdmdfb3JkZXJfdmFsdWUsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgcGF5bWVudF9tZXRob2QgPSAnY29kJykgYXMgY29kX29yZGVycyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBwYXltZW50X21ldGhvZCA9ICdjYXJkJykgYXMgY2FyZF9vcmRlcnNcbiAgICAgIEZST00gb3JkZXJzIFxuICAgICAgV0hFUkUgMT0xICR7ZGF0ZUZpbHRlcn1cbiAgICBgKTtcblxuICAgIC8vIEdldCBwcm9kdWN0IHN0YXRpc3RpY3NcbiAgICBjb25zdCBwcm9kdWN0U3RhdHMgPSBhd2FpdCBkYi5xdWVyeTxQcm9kdWN0U3RhdHM+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgQ09VTlQoKikgYXMgdG90YWxfcHJvZHVjdHMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgaXNfYWN0aXZlID0gdHJ1ZSkgYXMgYWN0aXZlX3Byb2R1Y3RzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIHN0b2NrX3F1YW50aXR5IDw9IGxvd19zdG9ja190aHJlc2hvbGQpIGFzIGxvd19zdG9ja19wcm9kdWN0cyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBzdG9ja19xdWFudGl0eSA9IDApIGFzIG91dF9vZl9zdG9ja19wcm9kdWN0c1xuICAgICAgRlJPTSBwcm9kdWN0c1xuICAgIGApO1xuXG4gICAgLy8gR2V0IHVzZXIgc3RhdGlzdGljc1xuICAgIGNvbnN0IHVzZXJTdGF0cyA9IGF3YWl0IGRiLnF1ZXJ5PFVzZXJTdGF0cz4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBDT1VOVCgqKSBhcyB0b3RhbF91c2VycyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBpc19ndWVzdCA9IGZhbHNlKSBhcyByZWdpc3RlcmVkX3VzZXJzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIGlzX2d1ZXN0ID0gdHJ1ZSkgYXMgZ3Vlc3RfdXNlcnMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgY3JlYXRlZF9hdCA+PSBOT1coKSAtIElOVEVSVkFMICc3IGRheXMnKSBhcyBuZXdfdXNlcnNfN2RcbiAgICAgIEZST00gdXNlcnMgXG4gICAgICBXSEVSRSB0eXBlID0gJ2N1c3RvbWVyJ1xuICAgIGApO1xuXG4gICAgLy8gR2V0IENPRCBzdGF0aXN0aWNzXG4gICAgY29uc3QgY29kU3RhdHMgPSBhd2FpdCBkYi5xdWVyeTxDT0RTdGF0cz4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBDT1VOVCgqKSBhcyB0b3RhbF9jb2RfY29sbGVjdGlvbnMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgY29sbGVjdGlvbl9zdGF0dXMgPSAncGVuZGluZycpIGFzIHBlbmRpbmdfY29sbGVjdGlvbnMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJykgYXMgY29tcGxldGVkX2NvbGxlY3Rpb25zLFxuICAgICAgICBDT0FMRVNDRShTVU0oYW1vdW50X3RvX2NvbGxlY3QpIEZJTFRFUiAoV0hFUkUgY29sbGVjdGlvbl9zdGF0dXMgPSAncGVuZGluZycpLCAwKSBhcyBwZW5kaW5nX2Ftb3VudCxcbiAgICAgICAgQ09BTEVTQ0UoU1VNKGNvbGxlY3RlZF9hbW91bnQpIEZJTFRFUiAoV0hFUkUgY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJyksIDApIGFzIGNvbGxlY3RlZF9hbW91bnRcbiAgICAgIEZST00gY29kX2NvbGxlY3Rpb25zIGNvZFxuICAgICAgSk9JTiBvcmRlcnMgbyBPTiBjb2Qub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICBXSEVSRSAxPTEgJHtkYXRlRmlsdGVyLnJlcGxhY2UoJ2NyZWF0ZWRfYXQnLCAnby5jcmVhdGVkX2F0Jyl9XG4gICAgYCk7XG5cbiAgICAvLyBHZXQgZGFpbHkgc2FsZXMgdHJlbmRcbiAgICBjb25zdCBzYWxlc1RyZW5kID0gYXdhaXQgZGIucXVlcnk8U2FsZXNUcmVuZD4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBEQVRFKGNyZWF0ZWRfYXQpIGFzIGRhdGUsXG4gICAgICAgIENPVU5UKCopIGFzIG9yZGVyc19jb3VudCxcbiAgICAgICAgQ09BTEVTQ0UoU1VNKHRvdGFsKSwgMCkgYXMgZGFpbHlfcmV2ZW51ZVxuICAgICAgRlJPTSBvcmRlcnMgXG4gICAgICBXSEVSRSBjcmVhdGVkX2F0ID49IE5PVygpIC0gSU5URVJWQUwgJzMwIGRheXMnXG4gICAgICBHUk9VUCBCWSBEQVRFKGNyZWF0ZWRfYXQpXG4gICAgICBPUkRFUiBCWSBkYXRlIERFU0NcbiAgICAgIExJTUlUIDMwXG4gICAgYCk7XG5cbiAgICAvLyBHZXQgdG9wIHByb2R1Y3RzXG4gICAgY29uc3QgdG9wUHJvZHVjdHMgPSBhd2FpdCBkYi5xdWVyeTxUb3BQcm9kdWN0PihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHAucHJvZHVjdF9pZCxcbiAgICAgICAgcC5uYW1lX2FyIGFzIHByb2R1Y3RfbmFtZSxcbiAgICAgICAgU1VNKG9pLnF1YW50aXR5KSBhcyB0b3RhbF9zb2xkLFxuICAgICAgICBTVU0ob2kudG90YWxfcHJpY2UpIGFzIHRvdGFsX3JldmVudWVcbiAgICAgIEZST00gb3JkZXJfaXRlbXMgb2lcbiAgICAgIEpPSU4gcHJvZHVjdHMgcCBPTiBvaS5wcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIG9pLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgV0hFUkUgby5jcmVhdGVkX2F0ID49IE5PVygpIC0gSU5URVJWQUwgJzMwIGRheXMnXG4gICAgICAgIEFORCBvLm9yZGVyX3N0YXR1cyBOT1QgSU4gKCdjYW5jZWxsZWQnKVxuICAgICAgR1JPVVAgQlkgcC5wcm9kdWN0X2lkLCBwLm5hbWVfYXJcbiAgICAgIE9SREVSIEJZIHRvdGFsX3NvbGQgREVTQ1xuICAgICAgTElNSVQgMTBcbiAgICBgKTtcblxuICAgIGNvbnN0IGRhc2hib2FyZFN0YXRzOiBBZG1pbkRhc2hib2FyZFN0YXRzID0ge1xuICAgICAgcGVyaW9kOiBwZXJpb2QsXG4gICAgICBvcmRlcnM6IG9yZGVyU3RhdHMucm93c1swXSxcbiAgICAgIHByb2R1Y3RzOiBwcm9kdWN0U3RhdHMucm93c1swXSxcbiAgICAgIHVzZXJzOiB1c2VyU3RhdHMucm93c1swXSxcbiAgICAgIGNvZDogY29kU3RhdHMucm93c1swXSxcbiAgICAgIHNhbGVzX3RyZW5kOiBzYWxlc1RyZW5kLnJvd3MsXG4gICAgICB0b3BfcHJvZHVjdHM6IHRvcFByb2R1Y3RzLnJvd3MsXG4gICAgICBnZW5lcmF0ZWRfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgIH07XG5cbiAgICByZXMuanNvbihkYXNoYm9hcmRTdGF0cyk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdEYXNoYm9hcmQgc3RhdHMgZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoIGRhc2hib2FyZCBzdGF0aXN0aWNzJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KzZhNioINil2K3Ytdin2KbZitin2Kog2YTZiNit2Kkg2KfZhNiq2K3Zg9mFJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBzdGF0aXN0aXF1ZXMgZHUgdGFibGVhdSBkZSBib3JkJ1xuICAgIH0pO1xuICB9XG59KTtcblxuLy8gR2V0IGFsbCBvcmRlcnMgd2l0aCBmaWx0ZXJzIChhZG1pbiB2aWV3KVxucm91dGVyLmdldCgnL29yZGVycycsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgXG4gICAgICBzdGF0dXMsIFxuICAgICAgcGF5bWVudF9tZXRob2QsIFxuICAgICAgcGFnZSA9ICcxJywgXG4gICAgICBsaW1pdCA9ICcyMCcsIFxuICAgICAgc2VhcmNoLFxuICAgICAgc3RhcnRfZGF0ZSxcbiAgICAgIGVuZF9kYXRlIFxuICAgIH0gPSByZXEucXVlcnkgYXMgQWRtaW5PcmRlckZpbHRlcnM7XG4gICAgXG4gICAgY29uc3Qgb2Zmc2V0ID0gKHBhcnNlSW50KHBhZ2UpIC0gMSkgKiBwYXJzZUludChsaW1pdCk7XG4gICAgXG4gICAgbGV0IHdoZXJlQ29uZGl0aW9ucyA9IFsnMT0xJ107XG4gICAgbGV0IHF1ZXJ5UGFyYW1zOiBhbnlbXSA9IFtdO1xuICAgIGxldCBwYXJhbUNvdW50ID0gMDtcblxuICAgIC8vIFN0YXR1cyBmaWx0ZXJcbiAgICBpZiAoc3RhdHVzKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgby5vcmRlcl9zdGF0dXMgPSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChzdGF0dXMpO1xuICAgIH1cblxuICAgIC8vIFBheW1lbnQgbWV0aG9kIGZpbHRlclxuICAgIGlmIChwYXltZW50X21ldGhvZCkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYG8ucGF5bWVudF9tZXRob2QgPSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChwYXltZW50X21ldGhvZCk7XG4gICAgfVxuXG4gICAgLy8gU2VhcmNoIGZpbHRlciAob3JkZXIgbnVtYmVyIG9yIGN1c3RvbWVyIG5hbWUvcGhvbmUpXG4gICAgaWYgKHNlYXJjaCkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYChcbiAgICAgICAgby5vcmRlcl9udW1iZXIgSUxJS0UgJCR7cGFyYW1Db3VudH0gT1IgXG4gICAgICAgIHUubmFtZSBJTElLRSAkJHtwYXJhbUNvdW50fSBPUiBcbiAgICAgICAgdS5waG9uZSBJTElLRSAkJHtwYXJhbUNvdW50fVxuICAgICAgKWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChgJSR7c2VhcmNofSVgKTtcbiAgICB9XG5cbiAgICAvLyBEYXRlIHJhbmdlIGZpbHRlcnNcbiAgICBpZiAoc3RhcnRfZGF0ZSkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYG8uY3JlYXRlZF9hdCA+PSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChzdGFydF9kYXRlKTtcbiAgICB9XG5cbiAgICBpZiAoZW5kX2RhdGUpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBvLmNyZWF0ZWRfYXQgPD0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goZW5kX2RhdGUpO1xuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmVDb25kaXRpb25zLmpvaW4oJyBBTkQgJyk7XG5cbiAgICBjb25zdCBxdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgby4qLFxuICAgICAgICB1Lm5hbWUgYXMgY3VzdG9tZXJfbmFtZSxcbiAgICAgICAgdS5waG9uZSBhcyBjdXN0b21lcl9waG9uZSxcbiAgICAgICAgdS5pc19ndWVzdCxcbiAgICAgICAgZHAubmFtZSBhcyBkZWxpdmVyeV9wZXJzb25fbmFtZSxcbiAgICAgICAgY29kLmNvbGxlY3Rpb25fc3RhdHVzLFxuICAgICAgICBjb2QuY29sbGVjdGVkX2Ftb3VudCxcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKSBcbiAgICAgICAgICBGUk9NIG9yZGVyX2l0ZW1zIG9pIFxuICAgICAgICAgIFdIRVJFIG9pLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgICApIGFzIGl0ZW1zX2NvdW50XG4gICAgICBGUk9NIG9yZGVycyBvXG4gICAgICBMRUZUIEpPSU4gdXNlcnMgdSBPTiBvLnVzZXJfaWQgPSB1LnVzZXJfaWRcbiAgICAgIExFRlQgSk9JTiB1c2VycyBkcCBPTiBvLmFzc2lnbmVkX2RlbGl2ZXJ5X3BlcnNvbiA9IGRwLnVzZXJfaWRcbiAgICAgIExFRlQgSk9JTiBjb2RfY29sbGVjdGlvbnMgY29kIE9OIG8ub3JkZXJfaWQgPSBjb2Qub3JkZXJfaWRcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9XG4gICAgICBPUkRFUiBCWSBvLmNyZWF0ZWRfYXQgREVTQ1xuICAgICAgTElNSVQgJCR7cGFyYW1Db3VudCArIDF9IE9GRlNFVCAkJHtwYXJhbUNvdW50ICsgMn1cbiAgICBgO1xuXG4gICAgcXVlcnlQYXJhbXMucHVzaChwYXJzZUludChsaW1pdCksIG9mZnNldCk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxBZG1pbk9yZGVyPihxdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgLy8gR2V0IHRvdGFsIGNvdW50XG4gICAgY29uc3QgY291bnRRdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBDT1VOVCgqKSBhcyB0b3RhbFxuICAgICAgRlJPTSBvcmRlcnMgb1xuICAgICAgTEVGVCBKT0lOIHVzZXJzIHUgT04gby51c2VyX2lkID0gdS51c2VyX2lkXG4gICAgICBXSEVSRSAke3doZXJlQ2xhdXNlfVxuICAgIGA7XG5cbiAgICBjb25zdCBjb3VudFJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PHt0b3RhbDogc3RyaW5nfT4oY291bnRRdWVyeSwgcXVlcnlQYXJhbXMuc2xpY2UoMCwgLTIpKTtcbiAgICBjb25zdCB0b3RhbCA9IHBhcnNlSW50KGNvdW50UmVzdWx0LnJvd3NbMF0udG90YWwpO1xuXG4gICAgY29uc3QgcGFnaW5hdGlvbjogUGFnaW5hdGlvbkluZm8gPSB7XG4gICAgICBwYWdlOiBwYXJzZUludChwYWdlKSxcbiAgICAgIGxpbWl0OiBwYXJzZUludChsaW1pdCksXG4gICAgICB0b3RhbDogdG90YWwsXG4gICAgICBwYWdlczogTWF0aC5jZWlsKHRvdGFsIC8gcGFyc2VJbnQobGltaXQpKVxuICAgIH07XG5cbiAgICByZXMuanNvbih7XG4gICAgICBvcmRlcnM6IHJlc3VsdC5yb3dzLFxuICAgICAgcGFnaW5hdGlvblxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQWRtaW4gb3JkZXJzIGZldGNoIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCBvcmRlcnMnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYrNmE2Kgg2KfZhNi32YTYqNin2KonLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZGVzIGNvbW1hbmRlcydcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIFVwZGF0ZSBvcmRlciBzdGF0dXNcbnJvdXRlci5wYXRjaCgnL29yZGVycy86b3JkZXJfaWQvc3RhdHVzJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBvcmRlcl9pZCB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCB7IHN0YXR1cywgYXNzaWduZWRfZGVsaXZlcnlfcGVyc29uLCBub3RlcyB9ID0gcmVxLmJvZHkgYXMgVXBkYXRlT3JkZXJTdGF0dXNSZXF1ZXN0O1xuXG4gICAgY29uc3QgdmFsaWRTdGF0dXNlcyA9IFtcbiAgICAgICdwZW5kaW5nJywgJ2NvbmZpcm1lZCcsICdwcmVwYXJpbmcnLCAncmVhZHlfZm9yX3BpY2t1cCcsXG4gICAgICAnb3V0X2Zvcl9kZWxpdmVyeScsICdkZWxpdmVyZWQnLCAnY29tcGxldGVkJywgJ2NhbmNlbGxlZCdcbiAgICBdO1xuXG4gICAgaWYgKCF2YWxpZFN0YXR1c2VzLmluY2x1ZGVzKHN0YXR1cykpIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnSW52YWxpZCBvcmRlciBzdGF0dXMnLFxuICAgICAgICBlcnJvcl9hcjogJ9it2KfZhNipINin2YTYt9mE2Kgg2LrZitixINi12K3Zitit2KknLFxuICAgICAgICBlcnJvcl9mcjogJ1N0YXR1dCBkZSBjb21tYW5kZSBpbnZhbGlkZScsXG4gICAgICAgIHZhbGlkX3N0YXR1c2VzOiB2YWxpZFN0YXR1c2VzXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBCdWlsZCB1cGRhdGUgcXVlcnkgZHluYW1pY2FsbHlcbiAgICBsZXQgdXBkYXRlRmllbGRzID0gWydvcmRlcl9zdGF0dXMgPSAkMicsICd1cGRhdGVkX2F0ID0gTk9XKCknXTtcbiAgICBsZXQgcXVlcnlQYXJhbXM6IGFueVtdID0gW29yZGVyX2lkLCBzdGF0dXNdO1xuICAgIGxldCBwYXJhbUNvdW50ID0gMjtcblxuICAgIGlmIChhc3NpZ25lZF9kZWxpdmVyeV9wZXJzb24pIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHVwZGF0ZUZpZWxkcy5wdXNoKGBhc3NpZ25lZF9kZWxpdmVyeV9wZXJzb24gPSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChhc3NpZ25lZF9kZWxpdmVyeV9wZXJzb24pO1xuICAgIH1cblxuICAgIGlmIChub3Rlcykge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgdXBkYXRlRmllbGRzLnB1c2goYGFkbWluX25vdGVzID0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2gobm90ZXMpO1xuICAgIH1cblxuICAgIC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIGRlbGl2ZXJlZCBzdGF0dXNcbiAgICBpZiAoc3RhdHVzID09PSAnZGVsaXZlcmVkJykge1xuICAgICAgdXBkYXRlRmllbGRzLnB1c2goJ2RlbGl2ZXJlZF9hdCA9IE5PVygpJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXBkYXRlUXVlcnkgPSBgXG4gICAgICBVUERBVEUgb3JkZXJzIFxuICAgICAgU0VUICR7dXBkYXRlRmllbGRzLmpvaW4oJywgJyl9XG4gICAgICBXSEVSRSBvcmRlcl9pZCA9ICQxXG4gICAgICBSRVRVUk5JTkcgKlxuICAgIGA7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxBZG1pbk9yZGVyPih1cGRhdGVRdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdPcmRlciBub3QgZm91bmQnLFxuICAgICAgICBlcnJvcl9hcjogJ9in2YTYt9mE2Kgg2LrZitixINmF2YjYrNmI2K8nLFxuICAgICAgICBlcnJvcl9mcjogJ0NvbW1hbmRlIG5vbiB0cm91dsOpZSdcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIElmIG9yZGVyIGlzIGNhbmNlbGxlZCwgcmVzdG9yZSBzdG9ja1xuICAgIGlmIChzdGF0dXMgPT09ICdjYW5jZWxsZWQnKSB7XG4gICAgICBjb25zdCBpdGVtc1Jlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PHtwcm9kdWN0X2lkOiBzdHJpbmcsIHZhcmlhbnRfaWQ6IHN0cmluZyB8IG51bGwsIHF1YW50aXR5OiBudW1iZXJ9PihgXG4gICAgICAgIFNFTEVDVCBvaS5wcm9kdWN0X2lkLCBvaS52YXJpYW50X2lkLCBvaS5xdWFudGl0eVxuICAgICAgICBGUk9NIG9yZGVyX2l0ZW1zIG9pXG4gICAgICAgIFdIRVJFIG9pLm9yZGVyX2lkID0gJDFcbiAgICAgIGAsIFtvcmRlcl9pZF0pO1xuXG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXNSZXN1bHQucm93cykge1xuICAgICAgICBpZiAoaXRlbS52YXJpYW50X2lkKSB7XG4gICAgICAgICAgYXdhaXQgZGIucXVlcnkoYFxuICAgICAgICAgICAgVVBEQVRFIHByb2R1Y3RfdmFyaWFudHMgXG4gICAgICAgICAgICBTRVQgc3RvY2tfcXVhbnRpdHkgPSBzdG9ja19xdWFudGl0eSArICQxIFxuICAgICAgICAgICAgV0hFUkUgdmFyaWFudF9pZCA9ICQyXG4gICAgICAgICAgYCwgW2l0ZW0ucXVhbnRpdHksIGl0ZW0udmFyaWFudF9pZF0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGF3YWl0IGRiLnF1ZXJ5KGBcbiAgICAgICAgICAgIFVQREFURSBwcm9kdWN0cyBcbiAgICAgICAgICAgIFNFVCBzdG9ja19xdWFudGl0eSA9IHN0b2NrX3F1YW50aXR5ICsgJDEgXG4gICAgICAgICAgICBXSEVSRSBwcm9kdWN0X2lkID0gJDJcbiAgICAgICAgICBgLCBbaXRlbS5xdWFudGl0eSwgaXRlbS5wcm9kdWN0X2lkXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXMuanNvbih7XG4gICAgICBtZXNzYWdlOiAnT3JkZXIgc3RhdHVzIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgIG1lc3NhZ2VfYXI6ICfYqtmFINiq2K3Yr9mK2Ksg2K3Yp9mE2Kkg2KfZhNi32YTYqCDYqNmG2KzYp9itJyxcbiAgICAgIG1lc3NhZ2VfZnI6ICdTdGF0dXQgZGUgY29tbWFuZGUgbWlzIMOgIGpvdXIgYXZlYyBzdWNjw6hzJyxcbiAgICAgIG9yZGVyOiByZXN1bHQucm93c1swXVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignT3JkZXIgc3RhdHVzIHVwZGF0ZSBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gdXBkYXRlIG9yZGVyIHN0YXR1cycsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINiq2K3Yr9mK2Ksg2K3Yp9mE2Kkg2KfZhNi32YTYqCcsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSBtaXNlIMOgIGpvdXIgZHUgc3RhdHV0IGRlIGNvbW1hbmRlJ1xuICAgIH0pO1xuICB9XG59KTtcblxuLy8gR2V0IGFsbCB1c2VycyAoYWRtaW4gdmlldylcbnJvdXRlci5nZXQoJy91c2VycycsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgdHlwZSwgcGFnZSA9ICcxJywgbGltaXQgPSAnMjAnLCBzZWFyY2gsIGlzX2FjdGl2ZSB9ID0gcmVxLnF1ZXJ5IGFzIEFkbWluVXNlckZpbHRlcnM7XG4gICAgY29uc3Qgb2Zmc2V0ID0gKHBhcnNlSW50KHBhZ2UpIC0gMSkgKiBwYXJzZUludChsaW1pdCk7XG5cbiAgICBsZXQgd2hlcmVDb25kaXRpb25zID0gWycxPTEnXTtcbiAgICBsZXQgcXVlcnlQYXJhbXM6IGFueVtdID0gW107XG4gICAgbGV0IHBhcmFtQ291bnQgPSAwO1xuXG4gICAgLy8gVXNlciB0eXBlIGZpbHRlclxuICAgIGlmICh0eXBlKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgdHlwZSA9ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHR5cGUpO1xuICAgIH1cblxuICAgIC8vIEFjdGl2ZSBzdGF0dXMgZmlsdGVyXG4gICAgaWYgKGlzX2FjdGl2ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgaXNfYWN0aXZlID0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goaXNfYWN0aXZlID09PSAndHJ1ZScpO1xuICAgIH1cblxuICAgIC8vIFNlYXJjaCBmaWx0ZXJcbiAgICBpZiAoc2VhcmNoKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgKFxuICAgICAgICBuYW1lIElMSUtFICQke3BhcmFtQ291bnR9IE9SIFxuICAgICAgICBwaG9uZSBJTElLRSAkJHtwYXJhbUNvdW50fSBPUiBcbiAgICAgICAgZW1haWwgSUxJS0UgJCR7cGFyYW1Db3VudH1cbiAgICAgIClgKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goYCUke3NlYXJjaH0lYCk7XG4gICAgfVxuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPSB3aGVyZUNvbmRpdGlvbnMuam9pbignIEFORCAnKTtcblxuICAgIGNvbnN0IHF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICB1c2VyX2lkLFxuICAgICAgICBuYW1lLFxuICAgICAgICBwaG9uZSxcbiAgICAgICAgZW1haWwsXG4gICAgICAgIHR5cGUsXG4gICAgICAgIGlzX2d1ZXN0LFxuICAgICAgICBpc19hY3RpdmUsXG4gICAgICAgIGNyZWF0ZWRfYXQsXG4gICAgICAgIGxhc3RfbG9naW4sXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgQ09VTlQoKikgXG4gICAgICAgICAgRlJPTSBvcmRlcnMgXG4gICAgICAgICAgV0hFUkUgdXNlcl9pZCA9IHVzZXJzLnVzZXJfaWRcbiAgICAgICAgKSBhcyB0b3RhbF9vcmRlcnMsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgQ09BTEVTQ0UoU1VNKHRvdGFsKSwgMCkgXG4gICAgICAgICAgRlJPTSBvcmRlcnMgXG4gICAgICAgICAgV0hFUkUgdXNlcl9pZCA9IHVzZXJzLnVzZXJfaWQgQU5EIG9yZGVyX3N0YXR1cyA9ICdkZWxpdmVyZWQnXG4gICAgICAgICkgYXMgdG90YWxfc3BlbnRcbiAgICAgIEZST00gdXNlcnNcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9XG4gICAgICBPUkRFUiBCWSBjcmVhdGVkX2F0IERFU0NcbiAgICAgIExJTUlUICQke3BhcmFtQ291bnQgKyAxfSBPRkZTRVQgJCR7cGFyYW1Db3VudCArIDJ9XG4gICAgYDtcblxuICAgIHF1ZXJ5UGFyYW1zLnB1c2gocGFyc2VJbnQobGltaXQpLCBvZmZzZXQpO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8QWRtaW5Vc2VyPihxdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgLy8gR2V0IHRvdGFsIGNvdW50XG4gICAgY29uc3QgY291bnRRdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBDT1VOVCgqKSBhcyB0b3RhbFxuICAgICAgRlJPTSB1c2Vyc1xuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICBgO1xuXG4gICAgY29uc3QgY291bnRSZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTx7dG90YWw6IHN0cmluZ30+KGNvdW50UXVlcnksIHF1ZXJ5UGFyYW1zLnNsaWNlKDAsIC0yKSk7XG4gICAgY29uc3QgdG90YWwgPSBwYXJzZUludChjb3VudFJlc3VsdC5yb3dzWzBdLnRvdGFsKTtcblxuICAgIGNvbnN0IHBhZ2luYXRpb246IFBhZ2luYXRpb25JbmZvID0ge1xuICAgICAgcGFnZTogcGFyc2VJbnQocGFnZSksXG4gICAgICBsaW1pdDogcGFyc2VJbnQobGltaXQpLFxuICAgICAgdG90YWw6IHRvdGFsLFxuICAgICAgcGFnZXM6IE1hdGguY2VpbCh0b3RhbCAvIHBhcnNlSW50KGxpbWl0KSlcbiAgICB9O1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgdXNlcnM6IHJlc3VsdC5yb3dzLFxuICAgICAgcGFnaW5hdGlvblxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQWRtaW4gdXNlcnMgZmV0Y2ggZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoIHVzZXJzJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KzZhNioINin2YTZhdiz2KrYrtiv2YXZitmGJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyB1dGlsaXNhdGV1cnMnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgaW52ZW50b3J5IHJlcG9ydFxucm91dGVyLmdldCgnL2ludmVudG9yeS9yZXBvcnQnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IGNhdGVnb3J5LCBsb3dfc3RvY2tfb25seSA9ICdmYWxzZScgfSA9IHJlcS5xdWVyeSBhcyBJbnZlbnRvcnlGaWx0ZXJzO1xuXG4gICAgbGV0IHdoZXJlQ29uZGl0aW9ucyA9IFsncC5pc19hY3RpdmUgPSB0cnVlJ107XG4gICAgbGV0IHF1ZXJ5UGFyYW1zOiBhbnlbXSA9IFtdO1xuICAgIGxldCBwYXJhbUNvdW50ID0gMDtcblxuICAgIGlmIChjYXRlZ29yeSkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYGMubmFtZV9lbiBJTElLRSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChgJSR7Y2F0ZWdvcnl9JWApO1xuICAgIH1cblxuICAgIGlmIChsb3dfc3RvY2tfb25seSA9PT0gJ3RydWUnKSB7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaCgncC5zdG9ja19xdWFudGl0eSA8PSBwLmxvd19zdG9ja190aHJlc2hvbGQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlQ29uZGl0aW9ucy5qb2luKCcgQU5EICcpO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8SW52ZW50b3J5UHJvZHVjdD4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBwLnByb2R1Y3RfaWQsXG4gICAgICAgIHAubmFtZV9hciBhcyBwcm9kdWN0X25hbWUsXG4gICAgICAgIHAuc3RvY2tfcXVhbnRpdHksXG4gICAgICAgIHAubG93X3N0b2NrX3RocmVzaG9sZCxcbiAgICAgICAgcC5wcmljZSxcbiAgICAgICAgYy5uYW1lX2FyIGFzIGNhdGVnb3J5X25hbWUsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgU1VNKHF1YW50aXR5KSBcbiAgICAgICAgICBGUk9NIG9yZGVyX2l0ZW1zIG9pIFxuICAgICAgICAgIEpPSU4gb3JkZXJzIG8gT04gb2kub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICAgICAgV0hFUkUgb2kucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZCBcbiAgICAgICAgICAgIEFORCBvLmNyZWF0ZWRfYXQgPj0gTk9XKCkgLSBJTlRFUlZBTCAnMzAgZGF5cydcbiAgICAgICAgICAgIEFORCBvLm9yZGVyX3N0YXR1cyBOT1QgSU4gKCdjYW5jZWxsZWQnKVxuICAgICAgICApIGFzIHNvbGRfbGFzdF8zMGQsXG4gICAgICAgIENBU0UgXG4gICAgICAgICAgV0hFTiBwLnN0b2NrX3F1YW50aXR5ID0gMCBUSEVOICdPdXQgb2YgU3RvY2snXG4gICAgICAgICAgV0hFTiBwLnN0b2NrX3F1YW50aXR5IDw9IHAubG93X3N0b2NrX3RocmVzaG9sZCBUSEVOICdMb3cgU3RvY2snXG4gICAgICAgICAgRUxTRSAnSW4gU3RvY2snXG4gICAgICAgIEVORCBhcyBzdG9ja19zdGF0dXNcbiAgICAgIEZST00gcHJvZHVjdHMgcFxuICAgICAgTEVGVCBKT0lOIGNhdGVnb3JpZXMgYyBPTiBwLmNhdGVnb3J5X2lkID0gYy5jYXRlZ29yeV9pZFxuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICAgIE9SREVSIEJZIFxuICAgICAgICBDQVNFIFxuICAgICAgICAgIFdIRU4gcC5zdG9ja19xdWFudGl0eSA9IDAgVEhFTiAxXG4gICAgICAgICAgV0hFTiBwLnN0b2NrX3F1YW50aXR5IDw9IHAubG93X3N0b2NrX3RocmVzaG9sZCBUSEVOIDJcbiAgICAgICAgICBFTFNFIDNcbiAgICAgICAgRU5ELFxuICAgICAgICBwLm5hbWVfYXJcbiAgICBgLCBxdWVyeVBhcmFtcyk7XG5cbiAgICAvLyBHZXQgc3VtbWFyeSBzdGF0aXN0aWNzXG4gICAgY29uc3Qgc3VtbWFyeSA9IGF3YWl0IGRiLnF1ZXJ5PEludmVudG9yeVN1bW1hcnk+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgQ09VTlQoKikgYXMgdG90YWxfcHJvZHVjdHMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgc3RvY2tfcXVhbnRpdHkgPSAwKSBhcyBvdXRfb2Zfc3RvY2ssXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgc3RvY2tfcXVhbnRpdHkgPD0gbG93X3N0b2NrX3RocmVzaG9sZCBBTkQgc3RvY2tfcXVhbnRpdHkgPiAwKSBhcyBsb3dfc3RvY2ssXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgc3RvY2tfcXVhbnRpdHkgPiBsb3dfc3RvY2tfdGhyZXNob2xkKSBhcyBpbl9zdG9jayxcbiAgICAgICAgQ09BTEVTQ0UoU1VNKHN0b2NrX3F1YW50aXR5ICogcHJpY2UpLCAwKSBhcyB0b3RhbF9pbnZlbnRvcnlfdmFsdWVcbiAgICAgIEZST00gcHJvZHVjdHMgcFxuICAgICAgTEVGVCBKT0lOIGNhdGVnb3JpZXMgYyBPTiBwLmNhdGVnb3J5X2lkID0gYy5jYXRlZ29yeV9pZFxuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICBgLCBxdWVyeVBhcmFtcyk7XG5cbiAgICByZXMuanNvbih7XG4gICAgICBwcm9kdWN0czogcmVzdWx0LnJvd3MsXG4gICAgICBzdW1tYXJ5OiBzdW1tYXJ5LnJvd3NbMF0sXG4gICAgICBmaWx0ZXJzOiB7XG4gICAgICAgIGNhdGVnb3J5OiBjYXRlZ29yeSB8fCAnYWxsJyxcbiAgICAgICAgbG93X3N0b2NrX29ubHk6IGxvd19zdG9ja19vbmx5ID09PSAndHJ1ZSdcbiAgICAgIH1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ludmVudG9yeSByZXBvcnQgZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGdlbmVyYXRlIGludmVudG9yeSByZXBvcnQnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYpdmG2LTYp9ihINiq2YLYsdmK2LEg2KfZhNmF2K7YstmI2YYnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgZ8OpbsOpcmF0aW9uIGR1IHJhcHBvcnQgZFxcJ2ludmVudGFpcmUnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG5leHBvcnQgZGVmYXVsdCByb3V0ZXI7Il19