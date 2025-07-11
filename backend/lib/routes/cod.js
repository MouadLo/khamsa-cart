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
const express_validator_1 = require("express-validator");
const db = __importStar(require("../config/database"));
const auth_1 = require("./auth");
const router = express_1.default.Router();
// Validation middleware
const validateCODCollection = [
    (0, express_validator_1.body)('order_id')
        .isUUID()
        .withMessage('Invalid order ID'),
    (0, express_validator_1.body)('collected_amount')
        .isFloat({ min: 0 })
        .withMessage('Collected amount must be a positive number'),
    (0, express_validator_1.body)('payment_method')
        .isIn(['cash', 'card_on_delivery'])
        .withMessage('Payment method must be cash or card_on_delivery'),
    (0, express_validator_1.body)('notes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Notes cannot exceed 500 characters')
];
// Get all COD collections (for delivery personnel/admin)
router.get('/collections', auth_1.authenticateToken, async (req, res) => {
    try {
        const { status = 'pending', page = '1', limit = '20', delivery_person_id } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let whereConditions = ['cod.collection_status = $1'];
        let queryParams = [status];
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
        const result = await db.query(query, queryParams);
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM cod_collections cod
      JOIN orders o ON cod.order_id = o.order_id
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
            collections: result.rows,
            pagination,
            summary: {
                status: status,
                total_amount: result.rows.reduce((sum, col) => sum + parseFloat(col.amount_to_collect.toString() || '0'), 0)
            }
        });
    }
    catch (error) {
        console.error('COD collections fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch COD collections',
            error_ar: 'فشل في جلب مجموعات الدفع نقداً',
            error_fr: 'Échec de récupération des collectes COD'
        });
    }
});
// Get single COD collection details
router.get('/collections/:collection_id', auth_1.authenticateToken, async (req, res) => {
    try {
        const { collection_id } = req.params;
        const result = await db.query(`
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
    }
    catch (error) {
        console.error('COD collection fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch COD collection',
            error_ar: 'فشل في جلب مجموعة الدفع نقداً',
            error_fr: 'Échec de récupération de la collection COD'
        });
    }
});
// Mark COD as collected (for delivery personnel)
router.post('/collections/:collection_id/collect', auth_1.authenticateToken, validateCODCollection, async (req, res) => {
    const client = await db.pool.connect();
    try {
        const errors = (0, express_validator_1.validationResult)(req);
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
        const { collected_amount, payment_method, notes } = req.body;
        const collector_id = req.user.user_id;
        // Check if collection exists and is pending
        const collectionCheck = await client.query(`
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
        const updatedCollection = await db.query(`
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
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('COD collection error:', error);
        res.status(500).json({
            error: 'Failed to record COD collection',
            error_ar: 'فشل في تسجيل الدفع نقداً',
            error_fr: 'Échec d\'enregistrement de la collection COD'
        });
    }
    finally {
        client.release();
    }
});
// Get COD collection statistics (for admin/managers)
router.get('/stats/summary', auth_1.authenticateToken, async (req, res) => {
    try {
        const { start_date, end_date, delivery_person_id } = req.query;
        let whereConditions = ['1=1'];
        let queryParams = [];
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
        const statsResult = await db.query(statsQuery, queryParams);
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
        const trendsResult = await db.query(trendsQuery, queryParams);
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
        const topCollectorsResult = await db.query(topCollectorsQuery, queryParams);
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
    }
    catch (error) {
        console.error('COD stats error:', error);
        res.status(500).json({
            error: 'Failed to fetch COD statistics',
            error_ar: 'فشل في جلب إحصائيات الدفع نقداً',
            error_fr: 'Échec de récupération des statistiques COD'
        });
    }
});
// Get user's COD orders (for customers)
router.get('/my-cod-orders', auth_1.authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.user_id;
        const { status = 'all' } = req.query;
        let whereClause = 'WHERE o.user_id = $1 AND o.payment_method = \'cod\'';
        let queryParams = [user_id];
        if (status !== 'all') {
            queryParams.push(status);
            whereClause += ` AND cod.collection_status = $${queryParams.length}`;
        }
        const result = await db.query(`
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
    }
    catch (error) {
        console.error('User COD orders fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch COD orders',
            error_ar: 'فشل في جلب طلبات الدفع نقداً',
            error_fr: 'Échec de récupération des commandes COD'
        });
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3JvdXRlcy9jb2QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHNEQUFxRDtBQUNyRCx5REFBMkQ7QUFDM0QsdURBQXlDO0FBQ3pDLGlDQUEyQztBQUUzQyxNQUFNLE1BQU0sR0FBRyxpQkFBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBcUdoQyx3QkFBd0I7QUFDeEIsTUFBTSxxQkFBcUIsR0FBRztJQUM1QixJQUFBLHdCQUFJLEVBQUMsVUFBVSxDQUFDO1NBQ2IsTUFBTSxFQUFFO1NBQ1IsV0FBVyxDQUFDLGtCQUFrQixDQUFDO0lBQ2xDLElBQUEsd0JBQUksRUFBQyxrQkFBa0IsQ0FBQztTQUNyQixPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUM7U0FDbkIsV0FBVyxDQUFDLDRDQUE0QyxDQUFDO0lBQzVELElBQUEsd0JBQUksRUFBQyxnQkFBZ0IsQ0FBQztTQUNuQixJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztTQUNsQyxXQUFXLENBQUMsaURBQWlELENBQUM7SUFDakUsSUFBQSx3QkFBSSxFQUFDLE9BQU8sQ0FBQztTQUNWLFFBQVEsRUFBRTtTQUNWLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQztTQUN0QixXQUFXLENBQUMsb0NBQW9DLENBQUM7Q0FDckQsQ0FBQztBQUVGLHlEQUF5RDtBQUN6RCxNQUFNLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSx3QkFBaUIsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBNEIsRUFBRTtJQUM1RyxJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxHQUFHLFNBQVMsRUFBRSxJQUFJLEdBQUcsR0FBRyxFQUFFLEtBQUssR0FBRyxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxHQUFHLENBQUMsS0FBbUIsQ0FBQztRQUNyRyxNQUFNLE1BQU0sR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFdEQsSUFBSSxlQUFlLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3JELElBQUksV0FBVyxHQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBRW5CLHlDQUF5QztRQUN6QyxJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDdkIsVUFBVSxFQUFFLENBQUM7WUFDYixlQUFlLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQ3BFLFdBQVcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN2QyxDQUFDO1FBRUQsbUVBQW1FO1FBQ25FLGVBQWUsQ0FBQyxJQUFJLENBQUMsNERBQTRELENBQUMsQ0FBQztRQUVuRixNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRWxELE1BQU0sS0FBSyxHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Y0F3QkosV0FBVzs7ZUFFVixVQUFVLEdBQUcsQ0FBQyxZQUFZLFVBQVUsR0FBRyxDQUFDO0tBQ2xELENBQUM7UUFFRixXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUUxQyxNQUFNLE1BQU0sR0FBRyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQWdCLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQztRQUVqRSxrQkFBa0I7UUFDbEIsTUFBTSxVQUFVLEdBQUc7Ozs7Y0FJVCxXQUFXO0tBQ3BCLENBQUM7UUFFRixNQUFNLFdBQVcsR0FBRyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQWtCLFVBQVUsRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUYsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbEQsTUFBTSxVQUFVLEdBQW1CO1lBQ2pDLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDO1lBQ3BCLEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDO1lBQ3RCLEtBQUssRUFBRSxLQUFLO1lBQ1osS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUMxQyxDQUFDO1FBRUYsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLFdBQVcsRUFBRSxNQUFNLENBQUMsSUFBSTtZQUN4QixVQUFVO1lBQ1YsT0FBTyxFQUFFO2dCQUNQLE1BQU0sRUFBRSxNQUFNO2dCQUNkLFlBQVksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUM3RztTQUNGLENBQUMsQ0FBQztJQUVMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUsaUNBQWlDO1lBQ3hDLFFBQVEsRUFBRSxnQ0FBZ0M7WUFDMUMsUUFBUSxFQUFFLHlDQUF5QztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxvQ0FBb0M7QUFDcEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSx3QkFBaUIsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBNEIsRUFBRTtJQUMzSCxJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsYUFBYSxFQUFFLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztRQUVyQyxNQUFNLE1BQU0sR0FBRyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQWdCOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0tBa0M1QyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUVwQixJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzdCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLEtBQUssRUFBRSwwQkFBMEI7Z0JBQ2pDLFFBQVEsRUFBRSwrQkFBK0I7Z0JBQ3pDLFFBQVEsRUFBRSw0QkFBNEI7YUFDdkMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDUCxVQUFVLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7U0FDM0IsQ0FBQyxDQUFDO0lBRUwsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSxnQ0FBZ0M7WUFDdkMsUUFBUSxFQUFFLCtCQUErQjtZQUN6QyxRQUFRLEVBQUUsNENBQTRDO1NBQ3ZELENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILGlEQUFpRDtBQUNqRCxNQUFNLENBQUMsSUFBSSxDQUFDLHFDQUFxQyxFQUFFLHdCQUFpQixFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxHQUFZLEVBQUUsR0FBYSxFQUE0QixFQUFFO0lBQzNKLE1BQU0sTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUV2QyxJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sR0FBRyxJQUFBLG9DQUFnQixFQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUN0QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixLQUFLLEVBQUUsbUJBQW1CO2dCQUMxQixRQUFRLEVBQUUsMkJBQTJCO2dCQUNyQyxRQUFRLEVBQUUsd0JBQXdCO2dCQUNsQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRTthQUN4QixDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTVCLE1BQU0sRUFBRSxhQUFhLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO1FBQ3JDLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFLEdBQUcsR0FBRyxDQUFDLElBQTRCLENBQUM7UUFDckYsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLElBQUssQ0FBQyxPQUFPLENBQUM7UUFFdkMsNENBQTRDO1FBQzVDLE1BQU0sZUFBZSxHQUFHLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FPdkM7Ozs7O0tBS0YsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFFcEIsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN0QyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDL0IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLDBCQUEwQjtnQkFDakMsUUFBUSxFQUFFLCtCQUErQjtnQkFDekMsUUFBUSxFQUFFLDRCQUE0QjthQUN2QyxDQUFDLENBQUM7UUFDTCxDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUUzQyxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUMvQyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDL0IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLGtDQUFrQztnQkFDekMsUUFBUSxFQUFFLDhCQUE4QjtnQkFDeEMsUUFBUSxFQUFFLDZCQUE2QjtnQkFDdkMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxpQkFBaUI7YUFDN0MsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELDRCQUE0QjtRQUM1QixNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDaEUsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFN0QsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsR0FBRyxZQUFZLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQztZQUNuRCxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDL0IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLGlEQUFpRDtnQkFDeEQsUUFBUSxFQUFFLHVDQUF1QztnQkFDakQsUUFBUSxFQUFFLDBEQUEwRDtnQkFDcEUsUUFBUSxFQUFFLGNBQWM7Z0JBQ3hCLFNBQVMsRUFBRSxZQUFZO2FBQ3hCLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDOzs7Ozs7Ozs7O0tBVWxCLEVBQUUsQ0FBQyxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBRTNFLHlDQUF5QztRQUN6QyxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUM7Ozs7Ozs7O0tBUWxCLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUUxQixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFN0IsbUNBQW1DO1FBQ25DLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFnQjs7Ozs7Ozs7Ozs7S0FXdkQsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFFcEIsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLE9BQU8sRUFBRSxzQ0FBc0M7WUFDL0MsVUFBVSxFQUFFLDRCQUE0QjtZQUN4QyxVQUFVLEVBQUUsd0NBQXdDO1lBQ3BELFVBQVUsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ3RDLENBQUMsQ0FBQztJQUVMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQy9CLE9BQU8sQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsS0FBSyxFQUFFLGlDQUFpQztZQUN4QyxRQUFRLEVBQUUsMEJBQTBCO1lBQ3BDLFFBQVEsRUFBRSw4Q0FBOEM7U0FDekQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztZQUFTLENBQUM7UUFDVCxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbkIsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDO0FBRUgscURBQXFEO0FBQ3JELE1BQU0sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsd0JBQWlCLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQTRCLEVBQUU7SUFDOUcsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxHQUFHLENBQUMsS0FBcUIsQ0FBQztRQUUvRSxJQUFJLGVBQWUsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlCLElBQUksV0FBVyxHQUFVLEVBQUUsQ0FBQztRQUM1QixJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFFbkIsb0JBQW9CO1FBQ3BCLElBQUksVUFBVSxFQUFFLENBQUM7WUFDZixVQUFVLEVBQUUsQ0FBQztZQUNiLGVBQWUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDM0QsV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBRUQsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNiLFVBQVUsRUFBRSxDQUFDO1lBQ2IsZUFBZSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUMzRCxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzdCLENBQUM7UUFFRCx5QkFBeUI7UUFDekIsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1lBQ3ZCLFVBQVUsRUFBRSxDQUFDO1lBQ2IsZUFBZSxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUNwRSxXQUFXLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFbEQsTUFBTSxVQUFVLEdBQUc7Ozs7Ozs7Ozs7OztjQVlULFdBQVc7S0FDcEIsQ0FBQztRQUVGLE1BQU0sV0FBVyxHQUFHLE1BQU0sRUFBRSxDQUFDLEtBQUssQ0FBVyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFdEUsOEJBQThCO1FBQzlCLE1BQU0sV0FBVyxHQUFHOzs7Ozs7O2NBT1YsV0FBVzs7OztLQUlwQixDQUFDO1FBRUYsTUFBTSxZQUFZLEdBQUcsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFhLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUUxRSwwQ0FBMEM7UUFDMUMsTUFBTSxrQkFBa0IsR0FBRzs7Ozs7Ozs7O2NBU2pCLFdBQVc7Ozs7S0FJcEIsQ0FBQztRQUVGLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFlLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTFGLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDUCxPQUFPLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDNUIsWUFBWSxFQUFFLFlBQVksQ0FBQyxJQUFJO1lBQy9CLGNBQWMsRUFBRSxtQkFBbUIsQ0FBQyxJQUFJO1lBQ3hDLE1BQU0sRUFBRTtnQkFDTixVQUFVLEVBQUUsVUFBVSxJQUFJLFVBQVU7Z0JBQ3BDLFFBQVEsRUFBRSxRQUFRLElBQUksS0FBSztnQkFDM0Isa0JBQWtCLEVBQUUsa0JBQWtCLElBQUksS0FBSzthQUNoRDtTQUNGLENBQUMsQ0FBQztJQUVMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUsZ0NBQWdDO1lBQ3ZDLFFBQVEsRUFBRSxpQ0FBaUM7WUFDM0MsUUFBUSxFQUFFLDRDQUE0QztTQUN2RCxDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCx3Q0FBd0M7QUFDeEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSx3QkFBaUIsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBNEIsRUFBRTtJQUM5RyxJQUFJLENBQUM7UUFDSCxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSyxDQUFDLE9BQU8sQ0FBQztRQUNsQyxNQUFNLEVBQUUsTUFBTSxHQUFHLEtBQUssRUFBRSxHQUFHLEdBQUcsQ0FBQyxLQUE0QixDQUFDO1FBRTVELElBQUksV0FBVyxHQUFHLHFEQUFxRCxDQUFDO1FBQ3hFLElBQUksV0FBVyxHQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFbkMsSUFBSSxNQUFNLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDckIsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN6QixXQUFXLElBQUksaUNBQWlDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN2RSxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFlOzs7Ozs7Ozs7Ozs7Ozs7UUFleEMsV0FBVzs7S0FFZCxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRWhCLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDUCxVQUFVLEVBQUUsTUFBTSxDQUFDLElBQUk7WUFDdkIsT0FBTyxFQUFFO2dCQUNQLFlBQVksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU07Z0JBQ2hDLGNBQWMsRUFBRSxNQUFNLENBQUMsSUFBSTtxQkFDeEIsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLGlCQUFpQixLQUFLLFNBQVMsQ0FBQztxQkFDdEQsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsR0FBRyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RixnQkFBZ0IsRUFBRSxNQUFNLENBQUMsSUFBSTtxQkFDMUIsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLGlCQUFpQixLQUFLLFdBQVcsQ0FBQztxQkFDeEQsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsR0FBRyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQzFGO1NBQ0YsQ0FBQyxDQUFDO0lBRUwsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3JELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSw0QkFBNEI7WUFDbkMsUUFBUSxFQUFFLDhCQUE4QjtZQUN4QyxRQUFRLEVBQUUseUNBQXlDO1NBQ3BELENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILGtCQUFlLE1BQU0sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyBib2R5LCB2YWxpZGF0aW9uUmVzdWx0IH0gZnJvbSAnZXhwcmVzcy12YWxpZGF0b3InO1xuaW1wb3J0ICogYXMgZGIgZnJvbSAnLi4vY29uZmlnL2RhdGFiYXNlJztcbmltcG9ydCB7IGF1dGhlbnRpY2F0ZVRva2VuIH0gZnJvbSAnLi9hdXRoJztcblxuY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcblxuLy8gVHlwZSBkZWZpbml0aW9uc1xuaW50ZXJmYWNlIENPRENvbGxlY3Rpb24ge1xuICBjb2xsZWN0aW9uX2lkOiBzdHJpbmc7XG4gIG9yZGVyX2lkOiBzdHJpbmc7XG4gIGFtb3VudF90b19jb2xsZWN0OiBudW1iZXI7XG4gIGNvbGxlY3RlZF9hbW91bnQ/OiBudW1iZXI7XG4gIGNvbGxlY3Rpb25fc3RhdHVzOiAncGVuZGluZycgfCAnY29sbGVjdGVkJyB8ICdjYW5jZWxsZWQnO1xuICBwYXltZW50X21ldGhvZD86ICdjYXNoJyB8ICdjYXJkX29uX2RlbGl2ZXJ5JztcbiAgY29sbGVjdGVkX2F0Pzogc3RyaW5nO1xuICBjb2xsZWN0ZWRfYnk/OiBzdHJpbmc7XG4gIG5vdGVzPzogc3RyaW5nO1xuICBvcmRlcl9udW1iZXI6IHN0cmluZztcbiAgb3JkZXJfdG90YWw6IG51bWJlcjtcbiAgZGVsaXZlcnlfYWRkcmVzczogc3RyaW5nO1xuICBkZWxpdmVyeV9sYXRpdHVkZTogbnVtYmVyO1xuICBkZWxpdmVyeV9sb25naXR1ZGU6IG51bWJlcjtcbiAgb3JkZXJfc3RhdHVzOiBzdHJpbmc7XG4gIG9yZGVyX2NyZWF0ZWRfYXQ6IHN0cmluZztcbiAgY3VzdG9tZXJfbmFtZTogc3RyaW5nO1xuICBjdXN0b21lcl9waG9uZTogc3RyaW5nO1xuICBkZWxpdmVyeV9wZXJzb25fbmFtZT86IHN0cmluZztcbiAgZGVsaXZlcnlfcGVyc29uX3Bob25lPzogc3RyaW5nO1xuICBvcmRlcl9pdGVtcz86IE9yZGVySXRlbVtdO1xuICBjb2xsZWN0ZWRfYnlfbmFtZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE9yZGVySXRlbSB7XG4gIGl0ZW1faWQ6IHN0cmluZztcbiAgcHJvZHVjdF9uYW1lOiBzdHJpbmc7XG4gIHF1YW50aXR5OiBudW1iZXI7XG4gIHVuaXRfcHJpY2U6IG51bWJlcjtcbiAgdG90YWxfcHJpY2U6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIENPRENvbGxlY3Rpb25SZXF1ZXN0IHtcbiAgb3JkZXJfaWQ6IHN0cmluZztcbiAgY29sbGVjdGVkX2Ftb3VudDogbnVtYmVyO1xuICBwYXltZW50X21ldGhvZDogJ2Nhc2gnIHwgJ2NhcmRfb25fZGVsaXZlcnknO1xuICBub3Rlcz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENPREZpbHRlcnMge1xuICBzdGF0dXM/OiBzdHJpbmc7XG4gIHBhZ2U/OiBzdHJpbmc7XG4gIGxpbWl0Pzogc3RyaW5nO1xuICBkZWxpdmVyeV9wZXJzb25faWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDT0RTdGF0cyB7XG4gIHBlbmRpbmdfY29sbGVjdGlvbnM6IG51bWJlcjtcbiAgY29tcGxldGVkX2NvbGxlY3Rpb25zOiBudW1iZXI7XG4gIGNhbmNlbGxlZF9jb2xsZWN0aW9uczogbnVtYmVyO1xuICBwZW5kaW5nX2Ftb3VudDogbnVtYmVyO1xuICBjb2xsZWN0ZWRfYW1vdW50OiBudW1iZXI7XG4gIGF2Z19jb2xsZWN0aW9uX2Ftb3VudDogbnVtYmVyO1xuICBjYXNoX3BheW1lbnRzOiBudW1iZXI7XG4gIGNhcmRfcGF5bWVudHM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIERhaWx5VHJlbmQge1xuICBjb2xsZWN0aW9uX2RhdGU6IHN0cmluZztcbiAgY29sbGVjdGlvbnNfY291bnQ6IG51bWJlcjtcbiAgZGFpbHlfdG90YWw6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFRvcENvbGxlY3RvciB7XG4gIHVzZXJfaWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBjb2xsZWN0aW9uc19jb3VudDogbnVtYmVyO1xuICB0b3RhbF9jb2xsZWN0ZWQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFN0YXRzRmlsdGVycyB7XG4gIHN0YXJ0X2RhdGU/OiBzdHJpbmc7XG4gIGVuZF9kYXRlPzogc3RyaW5nO1xuICBkZWxpdmVyeV9wZXJzb25faWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBQYWdpbmF0aW9uSW5mbyB7XG4gIHBhZ2U6IG51bWJlcjtcbiAgbGltaXQ6IG51bWJlcjtcbiAgdG90YWw6IG51bWJlcjtcbiAgcGFnZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFVzZXJDT0RPcmRlciB7XG4gIGNvbGxlY3Rpb25faWQ6IHN0cmluZztcbiAgYW1vdW50X3RvX2NvbGxlY3Q6IG51bWJlcjtcbiAgY29sbGVjdGVkX2Ftb3VudD86IG51bWJlcjtcbiAgY29sbGVjdGlvbl9zdGF0dXM6ICdwZW5kaW5nJyB8ICdjb2xsZWN0ZWQnIHwgJ2NhbmNlbGxlZCc7XG4gIGNvbGxlY3RlZF9hdD86IHN0cmluZztcbiAgb3JkZXJfaWQ6IHN0cmluZztcbiAgb3JkZXJfbnVtYmVyOiBzdHJpbmc7XG4gIHRvdGFsOiBudW1iZXI7XG4gIG9yZGVyX3N0YXR1czogc3RyaW5nO1xuICBvcmRlcl9kYXRlOiBzdHJpbmc7XG4gIGRlbGl2ZXJ5X2FkZHJlc3M6IHN0cmluZztcbn1cblxuLy8gVmFsaWRhdGlvbiBtaWRkbGV3YXJlXG5jb25zdCB2YWxpZGF0ZUNPRENvbGxlY3Rpb24gPSBbXG4gIGJvZHkoJ29yZGVyX2lkJylcbiAgICAuaXNVVUlEKClcbiAgICAud2l0aE1lc3NhZ2UoJ0ludmFsaWQgb3JkZXIgSUQnKSxcbiAgYm9keSgnY29sbGVjdGVkX2Ftb3VudCcpXG4gICAgLmlzRmxvYXQoeyBtaW46IDAgfSlcbiAgICAud2l0aE1lc3NhZ2UoJ0NvbGxlY3RlZCBhbW91bnQgbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpLFxuICBib2R5KCdwYXltZW50X21ldGhvZCcpXG4gICAgLmlzSW4oWydjYXNoJywgJ2NhcmRfb25fZGVsaXZlcnknXSlcbiAgICAud2l0aE1lc3NhZ2UoJ1BheW1lbnQgbWV0aG9kIG11c3QgYmUgY2FzaCBvciBjYXJkX29uX2RlbGl2ZXJ5JyksXG4gIGJvZHkoJ25vdGVzJylcbiAgICAub3B0aW9uYWwoKVxuICAgIC5pc0xlbmd0aCh7IG1heDogNTAwIH0pXG4gICAgLndpdGhNZXNzYWdlKCdOb3RlcyBjYW5ub3QgZXhjZWVkIDUwMCBjaGFyYWN0ZXJzJylcbl07XG5cbi8vIEdldCBhbGwgQ09EIGNvbGxlY3Rpb25zIChmb3IgZGVsaXZlcnkgcGVyc29ubmVsL2FkbWluKVxucm91dGVyLmdldCgnL2NvbGxlY3Rpb25zJywgYXV0aGVudGljYXRlVG9rZW4sIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgc3RhdHVzID0gJ3BlbmRpbmcnLCBwYWdlID0gJzEnLCBsaW1pdCA9ICcyMCcsIGRlbGl2ZXJ5X3BlcnNvbl9pZCB9ID0gcmVxLnF1ZXJ5IGFzIENPREZpbHRlcnM7XG4gICAgY29uc3Qgb2Zmc2V0ID0gKHBhcnNlSW50KHBhZ2UpIC0gMSkgKiBwYXJzZUludChsaW1pdCk7XG5cbiAgICBsZXQgd2hlcmVDb25kaXRpb25zID0gWydjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAkMSddO1xuICAgIGxldCBxdWVyeVBhcmFtczogYW55W10gPSBbc3RhdHVzXTtcbiAgICBsZXQgcGFyYW1Db3VudCA9IDE7XG5cbiAgICAvLyBGaWx0ZXIgYnkgZGVsaXZlcnkgcGVyc29uIGlmIHNwZWNpZmllZFxuICAgIGlmIChkZWxpdmVyeV9wZXJzb25faWQpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBvLmFzc2lnbmVkX2RlbGl2ZXJ5X3BlcnNvbiA9ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKGRlbGl2ZXJ5X3BlcnNvbl9pZCk7XG4gICAgfVxuXG4gICAgLy8gT25seSBzaG93IG9yZGVycyB0aGF0IGFyZSByZWFkeSBmb3IgZGVsaXZlcnkgb3Igb3V0IGZvciBkZWxpdmVyeVxuICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBvLm9yZGVyX3N0YXR1cyBJTiAoJ3JlYWR5X2Zvcl9waWNrdXAnLCAnb3V0X2Zvcl9kZWxpdmVyeScpYCk7XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlQ29uZGl0aW9ucy5qb2luKCcgQU5EICcpO1xuXG4gICAgY29uc3QgcXVlcnkgPSBgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIGNvZC5jb2xsZWN0aW9uX2lkLFxuICAgICAgICBjb2Qub3JkZXJfaWQsXG4gICAgICAgIGNvZC5hbW91bnRfdG9fY29sbGVjdCxcbiAgICAgICAgY29kLmNvbGxlY3RlZF9hbW91bnQsXG4gICAgICAgIGNvZC5jb2xsZWN0aW9uX3N0YXR1cyxcbiAgICAgICAgY29kLnBheW1lbnRfbWV0aG9kIGFzIGFjdHVhbF9wYXltZW50X21ldGhvZCxcbiAgICAgICAgY29kLmNvbGxlY3RlZF9hdCxcbiAgICAgICAgY29kLm5vdGVzIGFzIGNvbGxlY3Rpb25fbm90ZXMsXG4gICAgICAgIG8ub3JkZXJfbnVtYmVyLFxuICAgICAgICBvLnRvdGFsIGFzIG9yZGVyX3RvdGFsLFxuICAgICAgICBvLmRlbGl2ZXJ5X2FkZHJlc3MsXG4gICAgICAgIG8uZGVsaXZlcnlfbGF0aXR1ZGUsXG4gICAgICAgIG8uZGVsaXZlcnlfbG9uZ2l0dWRlLFxuICAgICAgICBvLm9yZGVyX3N0YXR1cyxcbiAgICAgICAgby5jcmVhdGVkX2F0IGFzIG9yZGVyX2NyZWF0ZWRfYXQsXG4gICAgICAgIHUubmFtZSBhcyBjdXN0b21lcl9uYW1lLFxuICAgICAgICB1LnBob25lIGFzIGN1c3RvbWVyX3Bob25lLFxuICAgICAgICBkcC5uYW1lIGFzIGRlbGl2ZXJ5X3BlcnNvbl9uYW1lXG4gICAgICBGUk9NIGNvZF9jb2xsZWN0aW9ucyBjb2RcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gY29kLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgSk9JTiB1c2VycyB1IE9OIG8udXNlcl9pZCA9IHUudXNlcl9pZFxuICAgICAgTEVGVCBKT0lOIHVzZXJzIGRwIE9OIG8uYXNzaWduZWRfZGVsaXZlcnlfcGVyc29uID0gZHAudXNlcl9pZFxuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICAgIE9SREVSIEJZIG8uY3JlYXRlZF9hdCBERVNDXG4gICAgICBMSU1JVCAkJHtwYXJhbUNvdW50ICsgMX0gT0ZGU0VUICQke3BhcmFtQ291bnQgKyAyfVxuICAgIGA7XG5cbiAgICBxdWVyeVBhcmFtcy5wdXNoKHBhcnNlSW50KGxpbWl0KSwgb2Zmc2V0KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PENPRENvbGxlY3Rpb24+KHF1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICAvLyBHZXQgdG90YWwgY291bnRcbiAgICBjb25zdCBjb3VudFF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIENPVU5UKCopIGFzIHRvdGFsXG4gICAgICBGUk9NIGNvZF9jb2xsZWN0aW9ucyBjb2RcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gY29kLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICBgO1xuXG4gICAgY29uc3QgY291bnRSZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTx7dG90YWw6IHN0cmluZ30+KGNvdW50UXVlcnksIHF1ZXJ5UGFyYW1zLnNsaWNlKDAsIC0yKSk7XG4gICAgY29uc3QgdG90YWwgPSBwYXJzZUludChjb3VudFJlc3VsdC5yb3dzWzBdLnRvdGFsKTtcblxuICAgIGNvbnN0IHBhZ2luYXRpb246IFBhZ2luYXRpb25JbmZvID0ge1xuICAgICAgcGFnZTogcGFyc2VJbnQocGFnZSksXG4gICAgICBsaW1pdDogcGFyc2VJbnQobGltaXQpLFxuICAgICAgdG90YWw6IHRvdGFsLFxuICAgICAgcGFnZXM6IE1hdGguY2VpbCh0b3RhbCAvIHBhcnNlSW50KGxpbWl0KSlcbiAgICB9O1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgY29sbGVjdGlvbnM6IHJlc3VsdC5yb3dzLFxuICAgICAgcGFnaW5hdGlvbixcbiAgICAgIHN1bW1hcnk6IHtcbiAgICAgICAgc3RhdHVzOiBzdGF0dXMsXG4gICAgICAgIHRvdGFsX2Ftb3VudDogcmVzdWx0LnJvd3MucmVkdWNlKChzdW0sIGNvbCkgPT4gc3VtICsgcGFyc2VGbG9hdChjb2wuYW1vdW50X3RvX2NvbGxlY3QudG9TdHJpbmcoKSB8fCAnMCcpLCAwKVxuICAgICAgfVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQ09EIGNvbGxlY3Rpb25zIGZldGNoIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCBDT0QgY29sbGVjdGlvbnMnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYrNmE2Kgg2YXYrNmF2YjYudin2Kog2KfZhNiv2YHYuSDZhtmC2K/Yp9mLJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBjb2xsZWN0ZXMgQ09EJ1xuICAgIH0pO1xuICB9XG59KTtcblxuLy8gR2V0IHNpbmdsZSBDT0QgY29sbGVjdGlvbiBkZXRhaWxzXG5yb3V0ZXIuZ2V0KCcvY29sbGVjdGlvbnMvOmNvbGxlY3Rpb25faWQnLCBhdXRoZW50aWNhdGVUb2tlbiwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBjb2xsZWN0aW9uX2lkIH0gPSByZXEucGFyYW1zO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8Q09EQ29sbGVjdGlvbj4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBjb2QuKixcbiAgICAgICAgby5vcmRlcl9udW1iZXIsXG4gICAgICAgIG8udG90YWwgYXMgb3JkZXJfdG90YWwsXG4gICAgICAgIG8uc3VidG90YWwsXG4gICAgICAgIG8uZGVsaXZlcnlfZmVlLFxuICAgICAgICBvLmRlbGl2ZXJ5X2FkZHJlc3MsXG4gICAgICAgIG8uZGVsaXZlcnlfbGF0aXR1ZGUsXG4gICAgICAgIG8uZGVsaXZlcnlfbG9uZ2l0dWRlLFxuICAgICAgICBvLmRlbGl2ZXJ5X2luc3RydWN0aW9ucyxcbiAgICAgICAgby5vcmRlcl9zdGF0dXMsXG4gICAgICAgIG8uY3JlYXRlZF9hdCBhcyBvcmRlcl9jcmVhdGVkX2F0LFxuICAgICAgICB1Lm5hbWUgYXMgY3VzdG9tZXJfbmFtZSxcbiAgICAgICAgdS5waG9uZSBhcyBjdXN0b21lcl9waG9uZSxcbiAgICAgICAgZHAubmFtZSBhcyBkZWxpdmVyeV9wZXJzb25fbmFtZSxcbiAgICAgICAgZHAucGhvbmUgYXMgZGVsaXZlcnlfcGVyc29uX3Bob25lLFxuICAgICAgICBqc29uX2FnZyhcbiAgICAgICAgICBqc29uX2J1aWxkX29iamVjdChcbiAgICAgICAgICAgICdpdGVtX2lkJywgb2kuaXRlbV9pZCxcbiAgICAgICAgICAgICdwcm9kdWN0X25hbWUnLCBwLm5hbWVfYXIsXG4gICAgICAgICAgICAncXVhbnRpdHknLCBvaS5xdWFudGl0eSxcbiAgICAgICAgICAgICd1bml0X3ByaWNlJywgb2kudW5pdF9wcmljZSxcbiAgICAgICAgICAgICd0b3RhbF9wcmljZScsIG9pLnRvdGFsX3ByaWNlXG4gICAgICAgICAgKVxuICAgICAgICApIGFzIG9yZGVyX2l0ZW1zXG4gICAgICBGUk9NIGNvZF9jb2xsZWN0aW9ucyBjb2RcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gY29kLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgSk9JTiB1c2VycyB1IE9OIG8udXNlcl9pZCA9IHUudXNlcl9pZFxuICAgICAgTEVGVCBKT0lOIHVzZXJzIGRwIE9OIG8uYXNzaWduZWRfZGVsaXZlcnlfcGVyc29uID0gZHAudXNlcl9pZFxuICAgICAgTEVGVCBKT0lOIG9yZGVyX2l0ZW1zIG9pIE9OIG8ub3JkZXJfaWQgPSBvaS5vcmRlcl9pZFxuICAgICAgTEVGVCBKT0lOIHByb2R1Y3RzIHAgT04gb2kucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZFxuICAgICAgV0hFUkUgY29kLmNvbGxlY3Rpb25faWQgPSAkMVxuICAgICAgR1JPVVAgQlkgY29kLmNvbGxlY3Rpb25faWQsIG8ub3JkZXJfaWQsIHUudXNlcl9pZCwgZHAudXNlcl9pZFxuICAgIGAsIFtjb2xsZWN0aW9uX2lkXSk7XG5cbiAgICBpZiAocmVzdWx0LnJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0NPRCBjb2xsZWN0aW9uIG5vdCBmb3VuZCcsXG4gICAgICAgIGVycm9yX2FyOiAn2YXYrNmF2YjYudipINin2YTYr9mB2Lkg2YbZgtiv2KfZiyDYutmK2LEg2YXZiNis2YjYr9ipJyxcbiAgICAgICAgZXJyb3JfZnI6ICdDb2xsZWN0aW9uIENPRCBub24gdHJvdXbDqWUnXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICByZXMuanNvbih7XG4gICAgICBjb2xsZWN0aW9uOiByZXN1bHQucm93c1swXVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQ09EIGNvbGxlY3Rpb24gZmV0Y2ggZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoIENPRCBjb2xsZWN0aW9uJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KzZhNioINmF2KzZhdmI2LnYqSDYp9mE2K/Zgdi5INmG2YLYr9in2YsnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZGUgbGEgY29sbGVjdGlvbiBDT0QnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBNYXJrIENPRCBhcyBjb2xsZWN0ZWQgKGZvciBkZWxpdmVyeSBwZXJzb25uZWwpXG5yb3V0ZXIucG9zdCgnL2NvbGxlY3Rpb25zLzpjb2xsZWN0aW9uX2lkL2NvbGxlY3QnLCBhdXRoZW50aWNhdGVUb2tlbiwgdmFsaWRhdGVDT0RDb2xsZWN0aW9uLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgY29uc3QgY2xpZW50ID0gYXdhaXQgZGIucG9vbC5jb25uZWN0KCk7XG4gIFxuICB0cnkge1xuICAgIGNvbnN0IGVycm9ycyA9IHZhbGlkYXRpb25SZXN1bHQocmVxKTtcbiAgICBpZiAoIWVycm9ycy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnVmFsaWRhdGlvbiBmYWlsZWQnLFxuICAgICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINin2YTYqtit2YLZgiDZhdmGINin2YTYqNmK2KfZhtin2KonLFxuICAgICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSBsYSB2YWxpZGF0aW9uJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3JzLmFycmF5KClcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnQkVHSU4nKTtcblxuICAgIGNvbnN0IHsgY29sbGVjdGlvbl9pZCB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCB7IGNvbGxlY3RlZF9hbW91bnQsIHBheW1lbnRfbWV0aG9kLCBub3RlcyB9ID0gcmVxLmJvZHkgYXMgQ09EQ29sbGVjdGlvblJlcXVlc3Q7XG4gICAgY29uc3QgY29sbGVjdG9yX2lkID0gcmVxLnVzZXIhLnVzZXJfaWQ7XG5cbiAgICAvLyBDaGVjayBpZiBjb2xsZWN0aW9uIGV4aXN0cyBhbmQgaXMgcGVuZGluZ1xuICAgIGNvbnN0IGNvbGxlY3Rpb25DaGVjayA9IGF3YWl0IGNsaWVudC5xdWVyeTx7XG4gICAgICBjb2xsZWN0aW9uX2lkOiBzdHJpbmc7XG4gICAgICBvcmRlcl9pZDogc3RyaW5nO1xuICAgICAgYW1vdW50X3RvX2NvbGxlY3Q6IHN0cmluZztcbiAgICAgIGNvbGxlY3Rpb25fc3RhdHVzOiBzdHJpbmc7XG4gICAgICBvcmRlcl9zdGF0dXM6IHN0cmluZztcbiAgICAgIHRvdGFsOiBzdHJpbmc7XG4gICAgfT4oYFxuICAgICAgU0VMRUNUIGNvZC4qLCBvLm9yZGVyX3N0YXR1cywgby50b3RhbFxuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgIFdIRVJFIGNvZC5jb2xsZWN0aW9uX2lkID0gJDFcbiAgICBgLCBbY29sbGVjdGlvbl9pZF0pO1xuXG4gICAgaWYgKGNvbGxlY3Rpb25DaGVjay5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdDT0QgY29sbGVjdGlvbiBub3QgZm91bmQnLFxuICAgICAgICBlcnJvcl9hcjogJ9mF2KzZhdmI2LnYqSDYp9mE2K/Zgdi5INmG2YLYr9in2Ysg2LrZitixINmF2YjYrNmI2K/YqScsXG4gICAgICAgIGVycm9yX2ZyOiAnQ29sbGVjdGlvbiBDT0Qgbm9uIHRyb3V2w6llJ1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgY29sbGVjdGlvbiA9IGNvbGxlY3Rpb25DaGVjay5yb3dzWzBdO1xuXG4gICAgaWYgKGNvbGxlY3Rpb24uY29sbGVjdGlvbl9zdGF0dXMgIT09ICdwZW5kaW5nJykge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdDT0QgY29sbGVjdGlvbiBhbHJlYWR5IHByb2Nlc3NlZCcsXG4gICAgICAgIGVycm9yX2FyOiAn2KrZhSDZhdi52KfZhNis2Kkg2KfZhNiv2YHYuSDZhtmC2K/Yp9mLINio2KfZhNmB2LnZhCcsXG4gICAgICAgIGVycm9yX2ZyOiAnQ29sbGVjdGlvbiBDT0QgZMOpasOgIHRyYWl0w6llJyxcbiAgICAgICAgY3VycmVudF9zdGF0dXM6IGNvbGxlY3Rpb24uY29sbGVjdGlvbl9zdGF0dXNcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGNvbGxlY3RlZCBhbW91bnRcbiAgICBjb25zdCBleHBlY3RlZEFtb3VudCA9IHBhcnNlRmxvYXQoY29sbGVjdGlvbi5hbW91bnRfdG9fY29sbGVjdCk7XG4gICAgY29uc3QgYWN0dWFsQW1vdW50ID0gcGFyc2VGbG9hdChjb2xsZWN0ZWRfYW1vdW50LnRvU3RyaW5nKCkpO1xuXG4gICAgaWYgKE1hdGguYWJzKGV4cGVjdGVkQW1vdW50IC0gYWN0dWFsQW1vdW50KSA+IDAuMDEpIHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnQ29sbGVjdGVkIGFtb3VudCBkb2VzIG5vdCBtYXRjaCBleHBlY3RlZCBhbW91bnQnLFxuICAgICAgICBlcnJvcl9hcjogJ9in2YTZhdio2YTYuiDYp9mE2YXYrdi12YQg2YTYpyDZiti32KfYqNmCINin2YTZhdio2YTYuiDYp9mE2YXYqtmI2YLYuScsXG4gICAgICAgIGVycm9yX2ZyOiAnTGUgbW9udGFudCBjb2xsZWN0w6kgbmUgY29ycmVzcG9uZCBwYXMgYXUgbW9udGFudCBhdHRlbmR1JyxcbiAgICAgICAgZXhwZWN0ZWQ6IGV4cGVjdGVkQW1vdW50LFxuICAgICAgICBjb2xsZWN0ZWQ6IGFjdHVhbEFtb3VudFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIENPRCBjb2xsZWN0aW9uXG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgIFVQREFURSBjb2RfY29sbGVjdGlvbnMgXG4gICAgICBTRVQgXG4gICAgICAgIGNvbGxlY3RlZF9hbW91bnQgPSAkMSxcbiAgICAgICAgcGF5bWVudF9tZXRob2QgPSAkMixcbiAgICAgICAgY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJyxcbiAgICAgICAgY29sbGVjdGVkX2F0ID0gTk9XKCksXG4gICAgICAgIGNvbGxlY3RlZF9ieSA9ICQzLFxuICAgICAgICBub3RlcyA9ICQ0XG4gICAgICBXSEVSRSBjb2xsZWN0aW9uX2lkID0gJDVcbiAgICBgLCBbY29sbGVjdGVkX2Ftb3VudCwgcGF5bWVudF9tZXRob2QsIGNvbGxlY3Rvcl9pZCwgbm90ZXMsIGNvbGxlY3Rpb25faWRdKTtcblxuICAgIC8vIFVwZGF0ZSBvcmRlciBzdGF0dXMgYW5kIHBheW1lbnQgc3RhdHVzXG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgIFVQREFURSBvcmRlcnMgXG4gICAgICBTRVQgXG4gICAgICAgIG9yZGVyX3N0YXR1cyA9ICdkZWxpdmVyZWQnLFxuICAgICAgICBwYXltZW50X3N0YXR1cyA9ICdwYWlkJyxcbiAgICAgICAgZGVsaXZlcmVkX2F0ID0gTk9XKCksXG4gICAgICAgIHVwZGF0ZWRfYXQgPSBOT1coKVxuICAgICAgV0hFUkUgb3JkZXJfaWQgPSAkMVxuICAgIGAsIFtjb2xsZWN0aW9uLm9yZGVyX2lkXSk7XG5cbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0NPTU1JVCcpO1xuXG4gICAgLy8gRmV0Y2ggdXBkYXRlZCBjb2xsZWN0aW9uIGRldGFpbHNcbiAgICBjb25zdCB1cGRhdGVkQ29sbGVjdGlvbiA9IGF3YWl0IGRiLnF1ZXJ5PENPRENvbGxlY3Rpb24+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgY29kLiosXG4gICAgICAgIG8ub3JkZXJfbnVtYmVyLFxuICAgICAgICB1Lm5hbWUgYXMgY3VzdG9tZXJfbmFtZSxcbiAgICAgICAgY29sbGVjdG9yLm5hbWUgYXMgY29sbGVjdGVkX2J5X25hbWVcbiAgICAgIEZST00gY29kX2NvbGxlY3Rpb25zIGNvZFxuICAgICAgSk9JTiBvcmRlcnMgbyBPTiBjb2Qub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICBKT0lOIHVzZXJzIHUgT04gby51c2VyX2lkID0gdS51c2VyX2lkXG4gICAgICBMRUZUIEpPSU4gdXNlcnMgY29sbGVjdG9yIE9OIGNvZC5jb2xsZWN0ZWRfYnkgPSBjb2xsZWN0b3IudXNlcl9pZFxuICAgICAgV0hFUkUgY29kLmNvbGxlY3Rpb25faWQgPSAkMVxuICAgIGAsIFtjb2xsZWN0aW9uX2lkXSk7XG5cbiAgICByZXMuanNvbih7XG4gICAgICBtZXNzYWdlOiAnQ09EIGNvbGxlY3Rpb24gcmVjb3JkZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgIG1lc3NhZ2VfYXI6ICfYqtmFINiq2LPYrNmK2YQg2KfZhNiv2YHYuSDZhtmC2K/Yp9mLINio2YbYrNin2K0nLFxuICAgICAgbWVzc2FnZV9mcjogJ0NvbGxlY3Rpb24gQ09EIGVucmVnaXN0csOpZSBhdmVjIHN1Y2PDqHMnLFxuICAgICAgY29sbGVjdGlvbjogdXBkYXRlZENvbGxlY3Rpb24ucm93c1swXVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NPRCBjb2xsZWN0aW9uIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byByZWNvcmQgQ09EIGNvbGxlY3Rpb24nLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYqtiz2KzZitmEINin2YTYr9mB2Lkg2YbZgtiv2KfZiycsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkXFwnZW5yZWdpc3RyZW1lbnQgZGUgbGEgY29sbGVjdGlvbiBDT0QnXG4gICAgfSk7XG4gIH0gZmluYWxseSB7XG4gICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgfVxufSk7XG5cbi8vIEdldCBDT0QgY29sbGVjdGlvbiBzdGF0aXN0aWNzIChmb3IgYWRtaW4vbWFuYWdlcnMpXG5yb3V0ZXIuZ2V0KCcvc3RhdHMvc3VtbWFyeScsIGF1dGhlbnRpY2F0ZVRva2VuLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHN0YXJ0X2RhdGUsIGVuZF9kYXRlLCBkZWxpdmVyeV9wZXJzb25faWQgfSA9IHJlcS5xdWVyeSBhcyBTdGF0c0ZpbHRlcnM7XG4gICAgXG4gICAgbGV0IHdoZXJlQ29uZGl0aW9ucyA9IFsnMT0xJ107XG4gICAgbGV0IHF1ZXJ5UGFyYW1zOiBhbnlbXSA9IFtdO1xuICAgIGxldCBwYXJhbUNvdW50ID0gMDtcblxuICAgIC8vIERhdGUgcmFuZ2UgZmlsdGVyXG4gICAgaWYgKHN0YXJ0X2RhdGUpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBjb2QuY29sbGVjdGVkX2F0ID49ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHN0YXJ0X2RhdGUpO1xuICAgIH1cblxuICAgIGlmIChlbmRfZGF0ZSkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYGNvZC5jb2xsZWN0ZWRfYXQgPD0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goZW5kX2RhdGUpO1xuICAgIH1cblxuICAgIC8vIERlbGl2ZXJ5IHBlcnNvbiBmaWx0ZXJcbiAgICBpZiAoZGVsaXZlcnlfcGVyc29uX2lkKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgby5hc3NpZ25lZF9kZWxpdmVyeV9wZXJzb24gPSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChkZWxpdmVyeV9wZXJzb25faWQpO1xuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlQ2xhdXNlID0gd2hlcmVDb25kaXRpb25zLmpvaW4oJyBBTkQgJyk7XG5cbiAgICBjb25zdCBzdGF0c1F1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIGNvZC5jb2xsZWN0aW9uX3N0YXR1cyA9ICdwZW5kaW5nJykgYXMgcGVuZGluZ19jb2xsZWN0aW9ucyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJykgYXMgY29tcGxldGVkX2NvbGxlY3Rpb25zLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIGNvZC5jb2xsZWN0aW9uX3N0YXR1cyA9ICdjYW5jZWxsZWQnKSBhcyBjYW5jZWxsZWRfY29sbGVjdGlvbnMsXG4gICAgICAgIENPQUxFU0NFKFNVTShjb2QuYW1vdW50X3RvX2NvbGxlY3QpIEZJTFRFUiAoV0hFUkUgY29kLmNvbGxlY3Rpb25fc3RhdHVzID0gJ3BlbmRpbmcnKSwgMCkgYXMgcGVuZGluZ19hbW91bnQsXG4gICAgICAgIENPQUxFU0NFKFNVTShjb2QuY29sbGVjdGVkX2Ftb3VudCkgRklMVEVSIChXSEVSRSBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJyksIDApIGFzIGNvbGxlY3RlZF9hbW91bnQsXG4gICAgICAgIENPQUxFU0NFKEFWRyhjb2QuY29sbGVjdGVkX2Ftb3VudCkgRklMVEVSIChXSEVSRSBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJyksIDApIGFzIGF2Z19jb2xsZWN0aW9uX2Ftb3VudCxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBjb2QucGF5bWVudF9tZXRob2QgPSAnY2FzaCcpIGFzIGNhc2hfcGF5bWVudHMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgY29kLnBheW1lbnRfbWV0aG9kID0gJ2NhcmRfb25fZGVsaXZlcnknKSBhcyBjYXJkX3BheW1lbnRzXG4gICAgICBGUk9NIGNvZF9jb2xsZWN0aW9ucyBjb2RcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gY29kLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX1cbiAgICBgO1xuXG4gICAgY29uc3Qgc3RhdHNSZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxDT0RTdGF0cz4oc3RhdHNRdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgLy8gR2V0IGRhaWx5IGNvbGxlY3Rpb24gdHJlbmRzXG4gICAgY29uc3QgdHJlbmRzUXVlcnkgPSBgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIERBVEUoY29kLmNvbGxlY3RlZF9hdCkgYXMgY29sbGVjdGlvbl9kYXRlLFxuICAgICAgICBDT1VOVCgqKSBhcyBjb2xsZWN0aW9uc19jb3VudCxcbiAgICAgICAgU1VNKGNvZC5jb2xsZWN0ZWRfYW1vdW50KSBhcyBkYWlseV90b3RhbFxuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9IEFORCBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJ1xuICAgICAgR1JPVVAgQlkgREFURShjb2QuY29sbGVjdGVkX2F0KVxuICAgICAgT1JERVIgQlkgY29sbGVjdGlvbl9kYXRlIERFU0NcbiAgICAgIExJTUlUIDMwXG4gICAgYDtcblxuICAgIGNvbnN0IHRyZW5kc1Jlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PERhaWx5VHJlbmQ+KHRyZW5kc1F1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICAvLyBHZXQgdG9wIGRlbGl2ZXJ5IHBlcnNvbnMgYnkgY29sbGVjdGlvbnNcbiAgICBjb25zdCB0b3BDb2xsZWN0b3JzUXVlcnkgPSBgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHUudXNlcl9pZCxcbiAgICAgICAgdS5uYW1lLFxuICAgICAgICBDT1VOVCgqKSBhcyBjb2xsZWN0aW9uc19jb3VudCxcbiAgICAgICAgU1VNKGNvZC5jb2xsZWN0ZWRfYW1vdW50KSBhcyB0b3RhbF9jb2xsZWN0ZWRcbiAgICAgIEZST00gY29kX2NvbGxlY3Rpb25zIGNvZFxuICAgICAgSk9JTiBvcmRlcnMgbyBPTiBjb2Qub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICBKT0lOIHVzZXJzIHUgT04gY29kLmNvbGxlY3RlZF9ieSA9IHUudXNlcl9pZFxuICAgICAgV0hFUkUgJHt3aGVyZUNsYXVzZX0gQU5EIGNvZC5jb2xsZWN0aW9uX3N0YXR1cyA9ICdjb2xsZWN0ZWQnXG4gICAgICBHUk9VUCBCWSB1LnVzZXJfaWQsIHUubmFtZVxuICAgICAgT1JERVIgQlkgdG90YWxfY29sbGVjdGVkIERFU0NcbiAgICAgIExJTUlUIDEwXG4gICAgYDtcblxuICAgIGNvbnN0IHRvcENvbGxlY3RvcnNSZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxUb3BDb2xsZWN0b3I+KHRvcENvbGxlY3RvcnNRdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgc3VtbWFyeTogc3RhdHNSZXN1bHQucm93c1swXSxcbiAgICAgIGRhaWx5X3RyZW5kczogdHJlbmRzUmVzdWx0LnJvd3MsXG4gICAgICB0b3BfY29sbGVjdG9yczogdG9wQ29sbGVjdG9yc1Jlc3VsdC5yb3dzLFxuICAgICAgcGVyaW9kOiB7XG4gICAgICAgIHN0YXJ0X2RhdGU6IHN0YXJ0X2RhdGUgfHwgJ2FsbF90aW1lJyxcbiAgICAgICAgZW5kX2RhdGU6IGVuZF9kYXRlIHx8ICdub3cnLFxuICAgICAgICBkZWxpdmVyeV9wZXJzb25faWQ6IGRlbGl2ZXJ5X3BlcnNvbl9pZCB8fCAnYWxsJ1xuICAgICAgfVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignQ09EIHN0YXRzIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCBDT0Qgc3RhdGlzdGljcycsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDYpdit2LXYp9im2YrYp9iqINin2YTYr9mB2Lkg2YbZgtiv2KfZiycsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZXMgc3RhdGlzdGlxdWVzIENPRCdcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIEdldCB1c2VyJ3MgQ09EIG9yZGVycyAoZm9yIGN1c3RvbWVycylcbnJvdXRlci5nZXQoJy9teS1jb2Qtb3JkZXJzJywgYXV0aGVudGljYXRlVG9rZW4sIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHVzZXJfaWQgPSByZXEudXNlciEudXNlcl9pZDtcbiAgICBjb25zdCB7IHN0YXR1cyA9ICdhbGwnIH0gPSByZXEucXVlcnkgYXMgeyBzdGF0dXM/OiBzdHJpbmcgfTtcblxuICAgIGxldCB3aGVyZUNsYXVzZSA9ICdXSEVSRSBvLnVzZXJfaWQgPSAkMSBBTkQgby5wYXltZW50X21ldGhvZCA9IFxcJ2NvZFxcJyc7XG4gICAgbGV0IHF1ZXJ5UGFyYW1zOiBhbnlbXSA9IFt1c2VyX2lkXTtcblxuICAgIGlmIChzdGF0dXMgIT09ICdhbGwnKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHN0YXR1cyk7XG4gICAgICB3aGVyZUNsYXVzZSArPSBgIEFORCBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAkJHtxdWVyeVBhcmFtcy5sZW5ndGh9YDtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxVc2VyQ09ET3JkZXI+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgY29kLmNvbGxlY3Rpb25faWQsXG4gICAgICAgIGNvZC5hbW91bnRfdG9fY29sbGVjdCxcbiAgICAgICAgY29kLmNvbGxlY3RlZF9hbW91bnQsXG4gICAgICAgIGNvZC5jb2xsZWN0aW9uX3N0YXR1cyxcbiAgICAgICAgY29kLmNvbGxlY3RlZF9hdCxcbiAgICAgICAgby5vcmRlcl9pZCxcbiAgICAgICAgby5vcmRlcl9udW1iZXIsXG4gICAgICAgIG8udG90YWwsXG4gICAgICAgIG8ub3JkZXJfc3RhdHVzLFxuICAgICAgICBvLmNyZWF0ZWRfYXQgYXMgb3JkZXJfZGF0ZSxcbiAgICAgICAgby5kZWxpdmVyeV9hZGRyZXNzXG4gICAgICBGUk9NIGNvZF9jb2xsZWN0aW9ucyBjb2RcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gY29kLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgJHt3aGVyZUNsYXVzZX1cbiAgICAgIE9SREVSIEJZIG8uY3JlYXRlZF9hdCBERVNDXG4gICAgYCwgcXVlcnlQYXJhbXMpO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kX29yZGVyczogcmVzdWx0LnJvd3MsXG4gICAgICBzdW1tYXJ5OiB7XG4gICAgICAgIHRvdGFsX29yZGVyczogcmVzdWx0LnJvd3MubGVuZ3RoLFxuICAgICAgICBwZW5kaW5nX2Ftb3VudDogcmVzdWx0LnJvd3NcbiAgICAgICAgICAuZmlsdGVyKG9yZGVyID0+IG9yZGVyLmNvbGxlY3Rpb25fc3RhdHVzID09PSAncGVuZGluZycpXG4gICAgICAgICAgLnJlZHVjZSgoc3VtLCBvcmRlcikgPT4gc3VtICsgcGFyc2VGbG9hdChvcmRlci5hbW91bnRfdG9fY29sbGVjdC50b1N0cmluZygpIHx8ICcwJyksIDApLFxuICAgICAgICBjb2xsZWN0ZWRfYW1vdW50OiByZXN1bHQucm93c1xuICAgICAgICAgIC5maWx0ZXIob3JkZXIgPT4gb3JkZXIuY29sbGVjdGlvbl9zdGF0dXMgPT09ICdjb2xsZWN0ZWQnKVxuICAgICAgICAgIC5yZWR1Y2UoKHN1bSwgb3JkZXIpID0+IHN1bSArIHBhcnNlRmxvYXQob3JkZXIuY29sbGVjdGVkX2Ftb3VudD8udG9TdHJpbmcoKSB8fCAnMCcpLCAwKVxuICAgICAgfVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignVXNlciBDT0Qgb3JkZXJzIGZldGNoIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCBDT0Qgb3JkZXJzJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KzZhNioINi32YTYqNin2Kog2KfZhNiv2YHYuSDZhtmC2K/Yp9mLJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBjb21tYW5kZXMgQ09EJ1xuICAgIH0pO1xuICB9XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyOyJdfQ==