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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3JvdXRlcy9jb2QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxzREFBcUQ7QUFDckQseURBQTJEO0FBQzNELHVEQUF5QztBQUN6QyxpQ0FBMkM7QUFFM0MsTUFBTSxNQUFNLEdBQUcsaUJBQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQXFHaEMsd0JBQXdCO0FBQ3hCLE1BQU0scUJBQXFCLEdBQUc7SUFDNUIsSUFBQSx3QkFBSSxFQUFDLFVBQVUsQ0FBQztTQUNiLE1BQU0sRUFBRTtTQUNSLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQztJQUNsQyxJQUFBLHdCQUFJLEVBQUMsa0JBQWtCLENBQUM7U0FDckIsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1NBQ25CLFdBQVcsQ0FBQyw0Q0FBNEMsQ0FBQztJQUM1RCxJQUFBLHdCQUFJLEVBQUMsZ0JBQWdCLENBQUM7U0FDbkIsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLGtCQUFrQixDQUFDLENBQUM7U0FDbEMsV0FBVyxDQUFDLGlEQUFpRCxDQUFDO0lBQ2pFLElBQUEsd0JBQUksRUFBQyxPQUFPLENBQUM7U0FDVixRQUFRLEVBQUU7U0FDVixRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7U0FDdEIsV0FBVyxDQUFDLG9DQUFvQyxDQUFDO0NBQ3JELENBQUM7QUFFRix5REFBeUQ7QUFDekQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsd0JBQWlCLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQTRCLEVBQUU7SUFDNUcsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLE1BQU0sR0FBRyxTQUFTLEVBQUUsSUFBSSxHQUFHLEdBQUcsRUFBRSxLQUFLLEdBQUcsSUFBSSxFQUFFLGtCQUFrQixFQUFF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S0FBSyxDQUFDLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUMxRjtTQUNGLENBQUMsQ0FBQztJQUVMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUsNEJBQTRCO1lBQ25DLFFBQVEsRUFBRSw4QkFBOEI7WUFDeEMsUUFBUSxFQUFFLHlDQUF5QztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZXhwcmVzcywgeyBSZXF1ZXN0LCBSZXNwb25zZSB9IGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHsgYm9keSwgdmFsaWRhdGlvblJlc3VsdCB9IGZyb20gJ2V4cHJlc3MtdmFsaWRhdG9yJztcbmltcG9ydCAqIGFzIGRiIGZyb20gJy4uL2NvbmZpZy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBhdXRoZW50aWNhdGVUb2tlbiB9IGZyb20gJy4vYXV0aCc7XG5cbmNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG5cbi8vIFR5cGUgZGVmaW5pdGlvbnNcbmludGVyZmFjZSBDT0RDb2xsZWN0aW9uIHtcbiAgY29sbGVjdGlvbl9pZDogc3RyaW5nO1xuICBvcmRlcl9pZDogc3RyaW5nO1xuICBhbW91bnRfdG9fY29sbGVjdDogbnVtYmVyO1xuICBjb2xsZWN0ZWRfYW1vdW50PzogbnVtYmVyO1xuICBjb2xsZWN0aW9uX3N0YXR1czogJ3BlbmRpbmcnIHwgJ2NvbGxlY3RlZCcgfCAnY2FuY2VsbGVkJztcbiAgcGF5bWVudF9tZXRob2Q/OiAnY2FzaCcgfCAnY2FyZF9vbl9kZWxpdmVyeSc7XG4gIGNvbGxlY3RlZF9hdD86IHN0cmluZztcbiAgY29sbGVjdGVkX2J5Pzogc3RyaW5nO1xuICBub3Rlcz86IHN0cmluZztcbiAgb3JkZXJfbnVtYmVyOiBzdHJpbmc7XG4gIG9yZGVyX3RvdGFsOiBudW1iZXI7XG4gIGRlbGl2ZXJ5X2FkZHJlc3M6IHN0cmluZztcbiAgZGVsaXZlcnlfbGF0aXR1ZGU6IG51bWJlcjtcbiAgZGVsaXZlcnlfbG9uZ2l0dWRlOiBudW1iZXI7XG4gIG9yZGVyX3N0YXR1czogc3RyaW5nO1xuICBvcmRlcl9jcmVhdGVkX2F0OiBzdHJpbmc7XG4gIGN1c3RvbWVyX25hbWU6IHN0cmluZztcbiAgY3VzdG9tZXJfcGhvbmU6IHN0cmluZztcbiAgZGVsaXZlcnlfcGVyc29uX25hbWU/OiBzdHJpbmc7XG4gIGRlbGl2ZXJ5X3BlcnNvbl9waG9uZT86IHN0cmluZztcbiAgb3JkZXJfaXRlbXM/OiBPcmRlckl0ZW1bXTtcbiAgY29sbGVjdGVkX2J5X25hbWU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBPcmRlckl0ZW0ge1xuICBpdGVtX2lkOiBzdHJpbmc7XG4gIHByb2R1Y3RfbmFtZTogc3RyaW5nO1xuICBxdWFudGl0eTogbnVtYmVyO1xuICB1bml0X3ByaWNlOiBudW1iZXI7XG4gIHRvdGFsX3ByaWNlOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDT0RDb2xsZWN0aW9uUmVxdWVzdCB7XG4gIG9yZGVyX2lkOiBzdHJpbmc7XG4gIGNvbGxlY3RlZF9hbW91bnQ6IG51bWJlcjtcbiAgcGF5bWVudF9tZXRob2Q6ICdjYXNoJyB8ICdjYXJkX29uX2RlbGl2ZXJ5JztcbiAgbm90ZXM/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDT0RGaWx0ZXJzIHtcbiAgc3RhdHVzPzogc3RyaW5nO1xuICBwYWdlPzogc3RyaW5nO1xuICBsaW1pdD86IHN0cmluZztcbiAgZGVsaXZlcnlfcGVyc29uX2lkPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ09EU3RhdHMge1xuICBwZW5kaW5nX2NvbGxlY3Rpb25zOiBudW1iZXI7XG4gIGNvbXBsZXRlZF9jb2xsZWN0aW9uczogbnVtYmVyO1xuICBjYW5jZWxsZWRfY29sbGVjdGlvbnM6IG51bWJlcjtcbiAgcGVuZGluZ19hbW91bnQ6IG51bWJlcjtcbiAgY29sbGVjdGVkX2Ftb3VudDogbnVtYmVyO1xuICBhdmdfY29sbGVjdGlvbl9hbW91bnQ6IG51bWJlcjtcbiAgY2FzaF9wYXltZW50czogbnVtYmVyO1xuICBjYXJkX3BheW1lbnRzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBEYWlseVRyZW5kIHtcbiAgY29sbGVjdGlvbl9kYXRlOiBzdHJpbmc7XG4gIGNvbGxlY3Rpb25zX2NvdW50OiBudW1iZXI7XG4gIGRhaWx5X3RvdGFsOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBUb3BDb2xsZWN0b3Ige1xuICB1c2VyX2lkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgY29sbGVjdGlvbnNfY291bnQ6IG51bWJlcjtcbiAgdG90YWxfY29sbGVjdGVkOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTdGF0c0ZpbHRlcnMge1xuICBzdGFydF9kYXRlPzogc3RyaW5nO1xuICBlbmRfZGF0ZT86IHN0cmluZztcbiAgZGVsaXZlcnlfcGVyc29uX2lkPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGFnaW5hdGlvbkluZm8ge1xuICBwYWdlOiBudW1iZXI7XG4gIGxpbWl0OiBudW1iZXI7XG4gIHRvdGFsOiBudW1iZXI7XG4gIHBhZ2VzOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBVc2VyQ09ET3JkZXIge1xuICBjb2xsZWN0aW9uX2lkOiBzdHJpbmc7XG4gIGFtb3VudF90b19jb2xsZWN0OiBudW1iZXI7XG4gIGNvbGxlY3RlZF9hbW91bnQ/OiBudW1iZXI7XG4gIGNvbGxlY3Rpb25fc3RhdHVzOiAncGVuZGluZycgfCAnY29sbGVjdGVkJyB8ICdjYW5jZWxsZWQnO1xuICBjb2xsZWN0ZWRfYXQ/OiBzdHJpbmc7XG4gIG9yZGVyX2lkOiBzdHJpbmc7XG4gIG9yZGVyX251bWJlcjogc3RyaW5nO1xuICB0b3RhbDogbnVtYmVyO1xuICBvcmRlcl9zdGF0dXM6IHN0cmluZztcbiAgb3JkZXJfZGF0ZTogc3RyaW5nO1xuICBkZWxpdmVyeV9hZGRyZXNzOiBzdHJpbmc7XG59XG5cbi8vIFZhbGlkYXRpb24gbWlkZGxld2FyZVxuY29uc3QgdmFsaWRhdGVDT0RDb2xsZWN0aW9uID0gW1xuICBib2R5KCdvcmRlcl9pZCcpXG4gICAgLmlzVVVJRCgpXG4gICAgLndpdGhNZXNzYWdlKCdJbnZhbGlkIG9yZGVyIElEJyksXG4gIGJvZHkoJ2NvbGxlY3RlZF9hbW91bnQnKVxuICAgIC5pc0Zsb2F0KHsgbWluOiAwIH0pXG4gICAgLndpdGhNZXNzYWdlKCdDb2xsZWN0ZWQgYW1vdW50IG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKSxcbiAgYm9keSgncGF5bWVudF9tZXRob2QnKVxuICAgIC5pc0luKFsnY2FzaCcsICdjYXJkX29uX2RlbGl2ZXJ5J10pXG4gICAgLndpdGhNZXNzYWdlKCdQYXltZW50IG1ldGhvZCBtdXN0IGJlIGNhc2ggb3IgY2FyZF9vbl9kZWxpdmVyeScpLFxuICBib2R5KCdub3RlcycpXG4gICAgLm9wdGlvbmFsKClcbiAgICAuaXNMZW5ndGgoeyBtYXg6IDUwMCB9KVxuICAgIC53aXRoTWVzc2FnZSgnTm90ZXMgY2Fubm90IGV4Y2VlZCA1MDAgY2hhcmFjdGVycycpXG5dO1xuXG4vLyBHZXQgYWxsIENPRCBjb2xsZWN0aW9ucyAoZm9yIGRlbGl2ZXJ5IHBlcnNvbm5lbC9hZG1pbilcbnJvdXRlci5nZXQoJy9jb2xsZWN0aW9ucycsIGF1dGhlbnRpY2F0ZVRva2VuLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHN0YXR1cyA9ICdwZW5kaW5nJywgcGFnZSA9ICcxJywgbGltaXQgPSAnMjAnLCBkZWxpdmVyeV9wZXJzb25faWQgfSA9IHJlcS5xdWVyeSBhcyBDT0RGaWx0ZXJzO1xuICAgIGNvbnN0IG9mZnNldCA9IChwYXJzZUludChwYWdlKSAtIDEpICogcGFyc2VJbnQobGltaXQpO1xuXG4gICAgbGV0IHdoZXJlQ29uZGl0aW9ucyA9IFsnY29kLmNvbGxlY3Rpb25fc3RhdHVzID0gJDEnXTtcbiAgICBsZXQgcXVlcnlQYXJhbXM6IGFueVtdID0gW3N0YXR1c107XG4gICAgbGV0IHBhcmFtQ291bnQgPSAxO1xuXG4gICAgLy8gRmlsdGVyIGJ5IGRlbGl2ZXJ5IHBlcnNvbiBpZiBzcGVjaWZpZWRcbiAgICBpZiAoZGVsaXZlcnlfcGVyc29uX2lkKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgby5hc3NpZ25lZF9kZWxpdmVyeV9wZXJzb24gPSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChkZWxpdmVyeV9wZXJzb25faWQpO1xuICAgIH1cblxuICAgIC8vIE9ubHkgc2hvdyBvcmRlcnMgdGhhdCBhcmUgcmVhZHkgZm9yIGRlbGl2ZXJ5IG9yIG91dCBmb3IgZGVsaXZlcnlcbiAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgby5vcmRlcl9zdGF0dXMgSU4gKCdyZWFkeV9mb3JfcGlja3VwJywgJ291dF9mb3JfZGVsaXZlcnknKWApO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPSB3aGVyZUNvbmRpdGlvbnMuam9pbignIEFORCAnKTtcblxuICAgIGNvbnN0IHF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBjb2QuY29sbGVjdGlvbl9pZCxcbiAgICAgICAgY29kLm9yZGVyX2lkLFxuICAgICAgICBjb2QuYW1vdW50X3RvX2NvbGxlY3QsXG4gICAgICAgIGNvZC5jb2xsZWN0ZWRfYW1vdW50LFxuICAgICAgICBjb2QuY29sbGVjdGlvbl9zdGF0dXMsXG4gICAgICAgIGNvZC5wYXltZW50X21ldGhvZCBhcyBhY3R1YWxfcGF5bWVudF9tZXRob2QsXG4gICAgICAgIGNvZC5jb2xsZWN0ZWRfYXQsXG4gICAgICAgIGNvZC5ub3RlcyBhcyBjb2xsZWN0aW9uX25vdGVzLFxuICAgICAgICBvLm9yZGVyX251bWJlcixcbiAgICAgICAgby50b3RhbCBhcyBvcmRlcl90b3RhbCxcbiAgICAgICAgby5kZWxpdmVyeV9hZGRyZXNzLFxuICAgICAgICBvLmRlbGl2ZXJ5X2xhdGl0dWRlLFxuICAgICAgICBvLmRlbGl2ZXJ5X2xvbmdpdHVkZSxcbiAgICAgICAgby5vcmRlcl9zdGF0dXMsXG4gICAgICAgIG8uY3JlYXRlZF9hdCBhcyBvcmRlcl9jcmVhdGVkX2F0LFxuICAgICAgICB1Lm5hbWUgYXMgY3VzdG9tZXJfbmFtZSxcbiAgICAgICAgdS5waG9uZSBhcyBjdXN0b21lcl9waG9uZSxcbiAgICAgICAgZHAubmFtZSBhcyBkZWxpdmVyeV9wZXJzb25fbmFtZVxuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgIEpPSU4gdXNlcnMgdSBPTiBvLnVzZXJfaWQgPSB1LnVzZXJfaWRcbiAgICAgIExFRlQgSk9JTiB1c2VycyBkcCBPTiBvLmFzc2lnbmVkX2RlbGl2ZXJ5X3BlcnNvbiA9IGRwLnVzZXJfaWRcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9XG4gICAgICBPUkRFUiBCWSBvLmNyZWF0ZWRfYXQgREVTQ1xuICAgICAgTElNSVQgJCR7cGFyYW1Db3VudCArIDF9IE9GRlNFVCAkJHtwYXJhbUNvdW50ICsgMn1cbiAgICBgO1xuXG4gICAgcXVlcnlQYXJhbXMucHVzaChwYXJzZUludChsaW1pdCksIG9mZnNldCk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxDT0RDb2xsZWN0aW9uPihxdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgLy8gR2V0IHRvdGFsIGNvdW50XG4gICAgY29uc3QgY291bnRRdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBDT1VOVCgqKSBhcyB0b3RhbFxuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9XG4gICAgYDtcblxuICAgIGNvbnN0IGNvdW50UmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8e3RvdGFsOiBzdHJpbmd9Pihjb3VudFF1ZXJ5LCBxdWVyeVBhcmFtcy5zbGljZSgwLCAtMikpO1xuICAgIGNvbnN0IHRvdGFsID0gcGFyc2VJbnQoY291bnRSZXN1bHQucm93c1swXS50b3RhbCk7XG5cbiAgICBjb25zdCBwYWdpbmF0aW9uOiBQYWdpbmF0aW9uSW5mbyA9IHtcbiAgICAgIHBhZ2U6IHBhcnNlSW50KHBhZ2UpLFxuICAgICAgbGltaXQ6IHBhcnNlSW50KGxpbWl0KSxcbiAgICAgIHRvdGFsOiB0b3RhbCxcbiAgICAgIHBhZ2VzOiBNYXRoLmNlaWwodG90YWwgLyBwYXJzZUludChsaW1pdCkpXG4gICAgfTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvbGxlY3Rpb25zOiByZXN1bHQucm93cyxcbiAgICAgIHBhZ2luYXRpb24sXG4gICAgICBzdW1tYXJ5OiB7XG4gICAgICAgIHN0YXR1czogc3RhdHVzLFxuICAgICAgICB0b3RhbF9hbW91bnQ6IHJlc3VsdC5yb3dzLnJlZHVjZSgoc3VtLCBjb2wpID0+IHN1bSArIHBhcnNlRmxvYXQoY29sLmFtb3VudF90b19jb2xsZWN0LnRvU3RyaW5nKCkgfHwgJzAnKSwgMClcbiAgICAgIH1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NPRCBjb2xsZWN0aW9ucyBmZXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggQ09EIGNvbGxlY3Rpb25zJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KzZhNioINmF2KzZhdmI2LnYp9iqINin2YTYr9mB2Lkg2YbZgtiv2KfZiycsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZXMgY29sbGVjdGVzIENPRCdcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIEdldCBzaW5nbGUgQ09EIGNvbGxlY3Rpb24gZGV0YWlsc1xucm91dGVyLmdldCgnL2NvbGxlY3Rpb25zLzpjb2xsZWN0aW9uX2lkJywgYXV0aGVudGljYXRlVG9rZW4sIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgY29sbGVjdGlvbl9pZCB9ID0gcmVxLnBhcmFtcztcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PENPRENvbGxlY3Rpb24+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgY29kLiosXG4gICAgICAgIG8ub3JkZXJfbnVtYmVyLFxuICAgICAgICBvLnRvdGFsIGFzIG9yZGVyX3RvdGFsLFxuICAgICAgICBvLnN1YnRvdGFsLFxuICAgICAgICBvLmRlbGl2ZXJ5X2ZlZSxcbiAgICAgICAgby5kZWxpdmVyeV9hZGRyZXNzLFxuICAgICAgICBvLmRlbGl2ZXJ5X2xhdGl0dWRlLFxuICAgICAgICBvLmRlbGl2ZXJ5X2xvbmdpdHVkZSxcbiAgICAgICAgby5kZWxpdmVyeV9pbnN0cnVjdGlvbnMsXG4gICAgICAgIG8ub3JkZXJfc3RhdHVzLFxuICAgICAgICBvLmNyZWF0ZWRfYXQgYXMgb3JkZXJfY3JlYXRlZF9hdCxcbiAgICAgICAgdS5uYW1lIGFzIGN1c3RvbWVyX25hbWUsXG4gICAgICAgIHUucGhvbmUgYXMgY3VzdG9tZXJfcGhvbmUsXG4gICAgICAgIGRwLm5hbWUgYXMgZGVsaXZlcnlfcGVyc29uX25hbWUsXG4gICAgICAgIGRwLnBob25lIGFzIGRlbGl2ZXJ5X3BlcnNvbl9waG9uZSxcbiAgICAgICAganNvbl9hZ2coXG4gICAgICAgICAganNvbl9idWlsZF9vYmplY3QoXG4gICAgICAgICAgICAnaXRlbV9pZCcsIG9pLml0ZW1faWQsXG4gICAgICAgICAgICAncHJvZHVjdF9uYW1lJywgcC5uYW1lX2FyLFxuICAgICAgICAgICAgJ3F1YW50aXR5Jywgb2kucXVhbnRpdHksXG4gICAgICAgICAgICAndW5pdF9wcmljZScsIG9pLnVuaXRfcHJpY2UsXG4gICAgICAgICAgICAndG90YWxfcHJpY2UnLCBvaS50b3RhbF9wcmljZVxuICAgICAgICAgIClcbiAgICAgICAgKSBhcyBvcmRlcl9pdGVtc1xuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgIEpPSU4gdXNlcnMgdSBPTiBvLnVzZXJfaWQgPSB1LnVzZXJfaWRcbiAgICAgIExFRlQgSk9JTiB1c2VycyBkcCBPTiBvLmFzc2lnbmVkX2RlbGl2ZXJ5X3BlcnNvbiA9IGRwLnVzZXJfaWRcbiAgICAgIExFRlQgSk9JTiBvcmRlcl9pdGVtcyBvaSBPTiBvLm9yZGVyX2lkID0gb2kub3JkZXJfaWRcbiAgICAgIExFRlQgSk9JTiBwcm9kdWN0cyBwIE9OIG9pLnByb2R1Y3RfaWQgPSBwLnByb2R1Y3RfaWRcbiAgICAgIFdIRVJFIGNvZC5jb2xsZWN0aW9uX2lkID0gJDFcbiAgICAgIEdST1VQIEJZIGNvZC5jb2xsZWN0aW9uX2lkLCBvLm9yZGVyX2lkLCB1LnVzZXJfaWQsIGRwLnVzZXJfaWRcbiAgICBgLCBbY29sbGVjdGlvbl9pZF0pO1xuXG4gICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdDT0QgY29sbGVjdGlvbiBub3QgZm91bmQnLFxuICAgICAgICBlcnJvcl9hcjogJ9mF2KzZhdmI2LnYqSDYp9mE2K/Zgdi5INmG2YLYr9in2Ysg2LrZitixINmF2YjYrNmI2K/YqScsXG4gICAgICAgIGVycm9yX2ZyOiAnQ29sbGVjdGlvbiBDT0Qgbm9uIHRyb3V2w6llJ1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmVzLmpzb24oe1xuICAgICAgY29sbGVjdGlvbjogcmVzdWx0LnJvd3NbMF1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NPRCBjb2xsZWN0aW9uIGZldGNoIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCBDT0QgY29sbGVjdGlvbicsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDZhdis2YXZiNi52Kkg2KfZhNiv2YHYuSDZhtmC2K/Yp9mLJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlIGxhIGNvbGxlY3Rpb24gQ09EJ1xuICAgIH0pO1xuICB9XG59KTtcblxuLy8gTWFyayBDT0QgYXMgY29sbGVjdGVkIChmb3IgZGVsaXZlcnkgcGVyc29ubmVsKVxucm91dGVyLnBvc3QoJy9jb2xsZWN0aW9ucy86Y29sbGVjdGlvbl9pZC9jb2xsZWN0JywgYXV0aGVudGljYXRlVG9rZW4sIHZhbGlkYXRlQ09EQ29sbGVjdGlvbiwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIGNvbnN0IGNsaWVudCA9IGF3YWl0IGRiLnBvb2wuY29ubmVjdCgpO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zdCBlcnJvcnMgPSB2YWxpZGF0aW9uUmVzdWx0KHJlcSk7XG4gICAgaWYgKCFlcnJvcnMuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ1ZhbGlkYXRpb24gZmFpbGVkJyxcbiAgICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYp9mE2KrYrdmC2YIg2YXZhiDYp9mE2KjZitin2YbYp9iqJyxcbiAgICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgbGEgdmFsaWRhdGlvbicsXG4gICAgICAgIGRldGFpbHM6IGVycm9ycy5hcnJheSgpXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0JFR0lOJyk7XG5cbiAgICBjb25zdCB7IGNvbGxlY3Rpb25faWQgfSA9IHJlcS5wYXJhbXM7XG4gICAgY29uc3QgeyBjb2xsZWN0ZWRfYW1vdW50LCBwYXltZW50X21ldGhvZCwgbm90ZXMgfSA9IHJlcS5ib2R5IGFzIENPRENvbGxlY3Rpb25SZXF1ZXN0O1xuICAgIGNvbnN0IGNvbGxlY3Rvcl9pZCA9IHJlcS51c2VyIS51c2VyX2lkO1xuXG4gICAgLy8gQ2hlY2sgaWYgY29sbGVjdGlvbiBleGlzdHMgYW5kIGlzIHBlbmRpbmdcbiAgICBjb25zdCBjb2xsZWN0aW9uQ2hlY2sgPSBhd2FpdCBjbGllbnQucXVlcnk8e1xuICAgICAgY29sbGVjdGlvbl9pZDogc3RyaW5nO1xuICAgICAgb3JkZXJfaWQ6IHN0cmluZztcbiAgICAgIGFtb3VudF90b19jb2xsZWN0OiBzdHJpbmc7XG4gICAgICBjb2xsZWN0aW9uX3N0YXR1czogc3RyaW5nO1xuICAgICAgb3JkZXJfc3RhdHVzOiBzdHJpbmc7XG4gICAgICB0b3RhbDogc3RyaW5nO1xuICAgIH0+KGBcbiAgICAgIFNFTEVDVCBjb2QuKiwgby5vcmRlcl9zdGF0dXMsIG8udG90YWxcbiAgICAgIEZST00gY29kX2NvbGxlY3Rpb25zIGNvZFxuICAgICAgSk9JTiBvcmRlcnMgbyBPTiBjb2Qub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICBXSEVSRSBjb2QuY29sbGVjdGlvbl9pZCA9ICQxXG4gICAgYCwgW2NvbGxlY3Rpb25faWRdKTtcblxuICAgIGlmIChjb2xsZWN0aW9uQ2hlY2sucm93cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnQ09EIGNvbGxlY3Rpb24gbm90IGZvdW5kJyxcbiAgICAgICAgZXJyb3JfYXI6ICfZhdis2YXZiNi52Kkg2KfZhNiv2YHYuSDZhtmC2K/Yp9mLINi62YrYsSDZhdmI2KzZiNiv2KknLFxuICAgICAgICBlcnJvcl9mcjogJ0NvbGxlY3Rpb24gQ09EIG5vbiB0cm91dsOpZSdcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbGxlY3Rpb24gPSBjb2xsZWN0aW9uQ2hlY2sucm93c1swXTtcblxuICAgIGlmIChjb2xsZWN0aW9uLmNvbGxlY3Rpb25fc3RhdHVzICE9PSAncGVuZGluZycpIHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnQ09EIGNvbGxlY3Rpb24gYWxyZWFkeSBwcm9jZXNzZWQnLFxuICAgICAgICBlcnJvcl9hcjogJ9iq2YUg2YXYudin2YTYrNipINin2YTYr9mB2Lkg2YbZgtiv2KfZiyDYqNin2YTZgdi52YQnLFxuICAgICAgICBlcnJvcl9mcjogJ0NvbGxlY3Rpb24gQ09EIGTDqWrDoCB0cmFpdMOpZScsXG4gICAgICAgIGN1cnJlbnRfc3RhdHVzOiBjb2xsZWN0aW9uLmNvbGxlY3Rpb25fc3RhdHVzXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBjb2xsZWN0ZWQgYW1vdW50XG4gICAgY29uc3QgZXhwZWN0ZWRBbW91bnQgPSBwYXJzZUZsb2F0KGNvbGxlY3Rpb24uYW1vdW50X3RvX2NvbGxlY3QpO1xuICAgIGNvbnN0IGFjdHVhbEFtb3VudCA9IHBhcnNlRmxvYXQoY29sbGVjdGVkX2Ftb3VudC50b1N0cmluZygpKTtcblxuICAgIGlmIChNYXRoLmFicyhleHBlY3RlZEFtb3VudCAtIGFjdHVhbEFtb3VudCkgPiAwLjAxKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJyk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0NvbGxlY3RlZCBhbW91bnQgZG9lcyBub3QgbWF0Y2ggZXhwZWN0ZWQgYW1vdW50JyxcbiAgICAgICAgZXJyb3JfYXI6ICfYp9mE2YXYqNmE2Log2KfZhNmF2K3YtdmEINmE2Kcg2YrYt9in2KjZgiDYp9mE2YXYqNmE2Log2KfZhNmF2KrZiNmC2LknLFxuICAgICAgICBlcnJvcl9mcjogJ0xlIG1vbnRhbnQgY29sbGVjdMOpIG5lIGNvcnJlc3BvbmQgcGFzIGF1IG1vbnRhbnQgYXR0ZW5kdScsXG4gICAgICAgIGV4cGVjdGVkOiBleHBlY3RlZEFtb3VudCxcbiAgICAgICAgY29sbGVjdGVkOiBhY3R1YWxBbW91bnRcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBDT0QgY29sbGVjdGlvblxuICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICBVUERBVEUgY29kX2NvbGxlY3Rpb25zIFxuICAgICAgU0VUIFxuICAgICAgICBjb2xsZWN0ZWRfYW1vdW50ID0gJDEsXG4gICAgICAgIHBheW1lbnRfbWV0aG9kID0gJDIsXG4gICAgICAgIGNvbGxlY3Rpb25fc3RhdHVzID0gJ2NvbGxlY3RlZCcsXG4gICAgICAgIGNvbGxlY3RlZF9hdCA9IE5PVygpLFxuICAgICAgICBjb2xsZWN0ZWRfYnkgPSAkMyxcbiAgICAgICAgbm90ZXMgPSAkNFxuICAgICAgV0hFUkUgY29sbGVjdGlvbl9pZCA9ICQ1XG4gICAgYCwgW2NvbGxlY3RlZF9hbW91bnQsIHBheW1lbnRfbWV0aG9kLCBjb2xsZWN0b3JfaWQsIG5vdGVzLCBjb2xsZWN0aW9uX2lkXSk7XG5cbiAgICAvLyBVcGRhdGUgb3JkZXIgc3RhdHVzIGFuZCBwYXltZW50IHN0YXR1c1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICBVUERBVEUgb3JkZXJzIFxuICAgICAgU0VUIFxuICAgICAgICBvcmRlcl9zdGF0dXMgPSAnZGVsaXZlcmVkJyxcbiAgICAgICAgcGF5bWVudF9zdGF0dXMgPSAncGFpZCcsXG4gICAgICAgIGRlbGl2ZXJlZF9hdCA9IE5PVygpLFxuICAgICAgICB1cGRhdGVkX2F0ID0gTk9XKClcbiAgICAgIFdIRVJFIG9yZGVyX2lkID0gJDFcbiAgICBgLCBbY29sbGVjdGlvbi5vcmRlcl9pZF0pO1xuXG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdDT01NSVQnKTtcblxuICAgIC8vIEZldGNoIHVwZGF0ZWQgY29sbGVjdGlvbiBkZXRhaWxzXG4gICAgY29uc3QgdXBkYXRlZENvbGxlY3Rpb24gPSBhd2FpdCBkYi5xdWVyeTxDT0RDb2xsZWN0aW9uPihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIGNvZC4qLFxuICAgICAgICBvLm9yZGVyX251bWJlcixcbiAgICAgICAgdS5uYW1lIGFzIGN1c3RvbWVyX25hbWUsXG4gICAgICAgIGNvbGxlY3Rvci5uYW1lIGFzIGNvbGxlY3RlZF9ieV9uYW1lXG4gICAgICBGUk9NIGNvZF9jb2xsZWN0aW9ucyBjb2RcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gY29kLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgSk9JTiB1c2VycyB1IE9OIG8udXNlcl9pZCA9IHUudXNlcl9pZFxuICAgICAgTEVGVCBKT0lOIHVzZXJzIGNvbGxlY3RvciBPTiBjb2QuY29sbGVjdGVkX2J5ID0gY29sbGVjdG9yLnVzZXJfaWRcbiAgICAgIFdIRVJFIGNvZC5jb2xsZWN0aW9uX2lkID0gJDFcbiAgICBgLCBbY29sbGVjdGlvbl9pZF0pO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgbWVzc2FnZTogJ0NPRCBjb2xsZWN0aW9uIHJlY29yZGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICBtZXNzYWdlX2FyOiAn2KrZhSDYqtiz2KzZitmEINin2YTYr9mB2Lkg2YbZgtiv2KfZiyDYqNmG2KzYp9itJyxcbiAgICAgIG1lc3NhZ2VfZnI6ICdDb2xsZWN0aW9uIENPRCBlbnJlZ2lzdHLDqWUgYXZlYyBzdWNjw6hzJyxcbiAgICAgIGNvbGxlY3Rpb246IHVwZGF0ZWRDb2xsZWN0aW9uLnJvd3NbMF1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICBjb25zb2xlLmVycm9yKCdDT0QgY29sbGVjdGlvbiBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gcmVjb3JkIENPRCBjb2xsZWN0aW9uJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KrYs9is2YrZhCDYp9mE2K/Zgdi5INmG2YLYr9in2YsnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZFxcJ2VucmVnaXN0cmVtZW50IGRlIGxhIGNvbGxlY3Rpb24gQ09EJ1xuICAgIH0pO1xuICB9IGZpbmFsbHkge1xuICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgQ09EIGNvbGxlY3Rpb24gc3RhdGlzdGljcyAoZm9yIGFkbWluL21hbmFnZXJzKVxucm91dGVyLmdldCgnL3N0YXRzL3N1bW1hcnknLCBhdXRoZW50aWNhdGVUb2tlbiwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBzdGFydF9kYXRlLCBlbmRfZGF0ZSwgZGVsaXZlcnlfcGVyc29uX2lkIH0gPSByZXEucXVlcnkgYXMgU3RhdHNGaWx0ZXJzO1xuICAgIFxuICAgIGxldCB3aGVyZUNvbmRpdGlvbnMgPSBbJzE9MSddO1xuICAgIGxldCBxdWVyeVBhcmFtczogYW55W10gPSBbXTtcbiAgICBsZXQgcGFyYW1Db3VudCA9IDA7XG5cbiAgICAvLyBEYXRlIHJhbmdlIGZpbHRlclxuICAgIGlmIChzdGFydF9kYXRlKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgY29kLmNvbGxlY3RlZF9hdCA+PSAkJHtwYXJhbUNvdW50fWApO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChzdGFydF9kYXRlKTtcbiAgICB9XG5cbiAgICBpZiAoZW5kX2RhdGUpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBjb2QuY29sbGVjdGVkX2F0IDw9ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKGVuZF9kYXRlKTtcbiAgICB9XG5cbiAgICAvLyBEZWxpdmVyeSBwZXJzb24gZmlsdGVyXG4gICAgaWYgKGRlbGl2ZXJ5X3BlcnNvbl9pZCkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYG8uYXNzaWduZWRfZGVsaXZlcnlfcGVyc29uID0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goZGVsaXZlcnlfcGVyc29uX2lkKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlQ29uZGl0aW9ucy5qb2luKCcgQU5EICcpO1xuXG4gICAgY29uc3Qgc3RhdHNRdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAncGVuZGluZycpIGFzIHBlbmRpbmdfY29sbGVjdGlvbnMsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgY29kLmNvbGxlY3Rpb25fc3RhdHVzID0gJ2NvbGxlY3RlZCcpIGFzIGNvbXBsZXRlZF9jb2xsZWN0aW9ucyxcbiAgICAgICAgQ09VTlQoKikgRklMVEVSIChXSEVSRSBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAnY2FuY2VsbGVkJykgYXMgY2FuY2VsbGVkX2NvbGxlY3Rpb25zLFxuICAgICAgICBDT0FMRVNDRShTVU0oY29kLmFtb3VudF90b19jb2xsZWN0KSBGSUxURVIgKFdIRVJFIGNvZC5jb2xsZWN0aW9uX3N0YXR1cyA9ICdwZW5kaW5nJyksIDApIGFzIHBlbmRpbmdfYW1vdW50LFxuICAgICAgICBDT0FMRVNDRShTVU0oY29kLmNvbGxlY3RlZF9hbW91bnQpIEZJTFRFUiAoV0hFUkUgY29kLmNvbGxlY3Rpb25fc3RhdHVzID0gJ2NvbGxlY3RlZCcpLCAwKSBhcyBjb2xsZWN0ZWRfYW1vdW50LFxuICAgICAgICBDT0FMRVNDRShBVkcoY29kLmNvbGxlY3RlZF9hbW91bnQpIEZJTFRFUiAoV0hFUkUgY29kLmNvbGxlY3Rpb25fc3RhdHVzID0gJ2NvbGxlY3RlZCcpLCAwKSBhcyBhdmdfY29sbGVjdGlvbl9hbW91bnQsXG4gICAgICAgIENPVU5UKCopIEZJTFRFUiAoV0hFUkUgY29kLnBheW1lbnRfbWV0aG9kID0gJ2Nhc2gnKSBhcyBjYXNoX3BheW1lbnRzLFxuICAgICAgICBDT1VOVCgqKSBGSUxURVIgKFdIRVJFIGNvZC5wYXltZW50X21ldGhvZCA9ICdjYXJkX29uX2RlbGl2ZXJ5JykgYXMgY2FyZF9wYXltZW50c1xuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9XG4gICAgYDtcblxuICAgIGNvbnN0IHN0YXRzUmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8Q09EU3RhdHM+KHN0YXRzUXVlcnksIHF1ZXJ5UGFyYW1zKTtcblxuICAgIC8vIEdldCBkYWlseSBjb2xsZWN0aW9uIHRyZW5kc1xuICAgIGNvbnN0IHRyZW5kc1F1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBEQVRFKGNvZC5jb2xsZWN0ZWRfYXQpIGFzIGNvbGxlY3Rpb25fZGF0ZSxcbiAgICAgICAgQ09VTlQoKikgYXMgY29sbGVjdGlvbnNfY291bnQsXG4gICAgICAgIFNVTShjb2QuY29sbGVjdGVkX2Ftb3VudCkgYXMgZGFpbHlfdG90YWxcbiAgICAgIEZST00gY29kX2NvbGxlY3Rpb25zIGNvZFxuICAgICAgSk9JTiBvcmRlcnMgbyBPTiBjb2Qub3JkZXJfaWQgPSBvLm9yZGVyX2lkXG4gICAgICBXSEVSRSAke3doZXJlQ2xhdXNlfSBBTkQgY29kLmNvbGxlY3Rpb25fc3RhdHVzID0gJ2NvbGxlY3RlZCdcbiAgICAgIEdST1VQIEJZIERBVEUoY29kLmNvbGxlY3RlZF9hdClcbiAgICAgIE9SREVSIEJZIGNvbGxlY3Rpb25fZGF0ZSBERVNDXG4gICAgICBMSU1JVCAzMFxuICAgIGA7XG5cbiAgICBjb25zdCB0cmVuZHNSZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxEYWlseVRyZW5kPih0cmVuZHNRdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgLy8gR2V0IHRvcCBkZWxpdmVyeSBwZXJzb25zIGJ5IGNvbGxlY3Rpb25zXG4gICAgY29uc3QgdG9wQ29sbGVjdG9yc1F1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICB1LnVzZXJfaWQsXG4gICAgICAgIHUubmFtZSxcbiAgICAgICAgQ09VTlQoKikgYXMgY29sbGVjdGlvbnNfY291bnQsXG4gICAgICAgIFNVTShjb2QuY29sbGVjdGVkX2Ftb3VudCkgYXMgdG90YWxfY29sbGVjdGVkXG4gICAgICBGUk9NIGNvZF9jb2xsZWN0aW9ucyBjb2RcbiAgICAgIEpPSU4gb3JkZXJzIG8gT04gY29kLm9yZGVyX2lkID0gby5vcmRlcl9pZFxuICAgICAgSk9JTiB1c2VycyB1IE9OIGNvZC5jb2xsZWN0ZWRfYnkgPSB1LnVzZXJfaWRcbiAgICAgIFdIRVJFICR7d2hlcmVDbGF1c2V9IEFORCBjb2QuY29sbGVjdGlvbl9zdGF0dXMgPSAnY29sbGVjdGVkJ1xuICAgICAgR1JPVVAgQlkgdS51c2VyX2lkLCB1Lm5hbWVcbiAgICAgIE9SREVSIEJZIHRvdGFsX2NvbGxlY3RlZCBERVNDXG4gICAgICBMSU1JVCAxMFxuICAgIGA7XG5cbiAgICBjb25zdCB0b3BDb2xsZWN0b3JzUmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8VG9wQ29sbGVjdG9yPih0b3BDb2xsZWN0b3JzUXVlcnksIHF1ZXJ5UGFyYW1zKTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIHN1bW1hcnk6IHN0YXRzUmVzdWx0LnJvd3NbMF0sXG4gICAgICBkYWlseV90cmVuZHM6IHRyZW5kc1Jlc3VsdC5yb3dzLFxuICAgICAgdG9wX2NvbGxlY3RvcnM6IHRvcENvbGxlY3RvcnNSZXN1bHQucm93cyxcbiAgICAgIHBlcmlvZDoge1xuICAgICAgICBzdGFydF9kYXRlOiBzdGFydF9kYXRlIHx8ICdhbGxfdGltZScsXG4gICAgICAgIGVuZF9kYXRlOiBlbmRfZGF0ZSB8fCAnbm93JyxcbiAgICAgICAgZGVsaXZlcnlfcGVyc29uX2lkOiBkZWxpdmVyeV9wZXJzb25faWQgfHwgJ2FsbCdcbiAgICAgIH1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NPRCBzdGF0cyBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggQ09EIHN0YXRpc3RpY3MnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYrNmE2Kgg2KXYrdi12KfYptmK2KfYqiDYp9mE2K/Zgdi5INmG2YLYr9in2YsnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZGVzIHN0YXRpc3RpcXVlcyBDT0QnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgdXNlcidzIENPRCBvcmRlcnMgKGZvciBjdXN0b21lcnMpXG5yb3V0ZXIuZ2V0KCcvbXktY29kLW9yZGVycycsIGF1dGhlbnRpY2F0ZVRva2VuLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB1c2VyX2lkID0gcmVxLnVzZXIhLnVzZXJfaWQ7XG4gICAgY29uc3QgeyBzdGF0dXMgPSAnYWxsJyB9ID0gcmVxLnF1ZXJ5IGFzIHsgc3RhdHVzPzogc3RyaW5nIH07XG5cbiAgICBsZXQgd2hlcmVDbGF1c2UgPSAnV0hFUkUgby51c2VyX2lkID0gJDEgQU5EIG8ucGF5bWVudF9tZXRob2QgPSBcXCdjb2RcXCcnO1xuICAgIGxldCBxdWVyeVBhcmFtczogYW55W10gPSBbdXNlcl9pZF07XG5cbiAgICBpZiAoc3RhdHVzICE9PSAnYWxsJykge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChzdGF0dXMpO1xuICAgICAgd2hlcmVDbGF1c2UgKz0gYCBBTkQgY29kLmNvbGxlY3Rpb25fc3RhdHVzID0gJCR7cXVlcnlQYXJhbXMubGVuZ3RofWA7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8VXNlckNPRE9yZGVyPihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIGNvZC5jb2xsZWN0aW9uX2lkLFxuICAgICAgICBjb2QuYW1vdW50X3RvX2NvbGxlY3QsXG4gICAgICAgIGNvZC5jb2xsZWN0ZWRfYW1vdW50LFxuICAgICAgICBjb2QuY29sbGVjdGlvbl9zdGF0dXMsXG4gICAgICAgIGNvZC5jb2xsZWN0ZWRfYXQsXG4gICAgICAgIG8ub3JkZXJfaWQsXG4gICAgICAgIG8ub3JkZXJfbnVtYmVyLFxuICAgICAgICBvLnRvdGFsLFxuICAgICAgICBvLm9yZGVyX3N0YXR1cyxcbiAgICAgICAgby5jcmVhdGVkX2F0IGFzIG9yZGVyX2RhdGUsXG4gICAgICAgIG8uZGVsaXZlcnlfYWRkcmVzc1xuICAgICAgRlJPTSBjb2RfY29sbGVjdGlvbnMgY29kXG4gICAgICBKT0lOIG9yZGVycyBvIE9OIGNvZC5vcmRlcl9pZCA9IG8ub3JkZXJfaWRcbiAgICAgICR7d2hlcmVDbGF1c2V9XG4gICAgICBPUkRFUiBCWSBvLmNyZWF0ZWRfYXQgREVTQ1xuICAgIGAsIHF1ZXJ5UGFyYW1zKTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIGNvZF9vcmRlcnM6IHJlc3VsdC5yb3dzLFxuICAgICAgc3VtbWFyeToge1xuICAgICAgICB0b3RhbF9vcmRlcnM6IHJlc3VsdC5yb3dzLmxlbmd0aCxcbiAgICAgICAgcGVuZGluZ19hbW91bnQ6IHJlc3VsdC5yb3dzXG4gICAgICAgICAgLmZpbHRlcihvcmRlciA9PiBvcmRlci5jb2xsZWN0aW9uX3N0YXR1cyA9PT0gJ3BlbmRpbmcnKVxuICAgICAgICAgIC5yZWR1Y2UoKHN1bSwgb3JkZXIpID0+IHN1bSArIHBhcnNlRmxvYXQob3JkZXIuYW1vdW50X3RvX2NvbGxlY3QudG9TdHJpbmcoKSB8fCAnMCcpLCAwKSxcbiAgICAgICAgY29sbGVjdGVkX2Ftb3VudDogcmVzdWx0LnJvd3NcbiAgICAgICAgICAuZmlsdGVyKG9yZGVyID0+IG9yZGVyLmNvbGxlY3Rpb25fc3RhdHVzID09PSAnY29sbGVjdGVkJylcbiAgICAgICAgICAucmVkdWNlKChzdW0sIG9yZGVyKSA9PiBzdW0gKyBwYXJzZUZsb2F0KG9yZGVyLmNvbGxlY3RlZF9hbW91bnQ/LnRvU3RyaW5nKCkgfHwgJzAnKSwgMClcbiAgICAgIH1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1VzZXIgQ09EIG9yZGVycyBmZXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggQ09EIG9yZGVycycsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDYt9mE2KjYp9iqINin2YTYr9mB2Lkg2YbZgtiv2KfZiycsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZXMgY29tbWFuZGVzIENPRCdcbiAgICB9KTtcbiAgfVxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IHJvdXRlcjsiXX0=