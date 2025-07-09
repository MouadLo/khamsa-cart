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
// Validation rules
const validateCreateOrder = [
    (0, express_validator_1.body)('items')
        .isArray({ min: 1 })
        .withMessage('Order must contain at least one item'),
    (0, express_validator_1.body)('items.*.product_id')
        .isUUID()
        .withMessage('Invalid product ID'),
    (0, express_validator_1.body)('items.*.quantity')
        .isInt({ min: 1 })
        .withMessage('Quantity must be at least 1'),
    (0, express_validator_1.body)('items.*.variant_id')
        .optional()
        .isUUID()
        .withMessage('Invalid variant ID'),
    (0, express_validator_1.body)('delivery_address.latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Invalid latitude'),
    (0, express_validator_1.body)('delivery_address.longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Invalid longitude'),
    (0, express_validator_1.body)('delivery_address.address')
        .isLength({ min: 5, max: 200 })
        .withMessage('Address must be 5-200 characters'),
    (0, express_validator_1.body)('payment_method')
        .isIn(['cod', 'card'])
        .withMessage('Payment method must be cod or card'),
    (0, express_validator_1.body)('notes')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Notes cannot exceed 500 characters')
];
// Create new order
router.post('/', auth_1.authenticateToken, validateCreateOrder, async (req, res) => {
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
        const { items, delivery_address, payment_method, notes, delivery_instructions } = req.body;
        const user_id = req.user.user_id;
        // Calculate order totals
        let subtotal = 0;
        const orderItems = [];
        for (const item of items) {
            // Get product details
            const productQuery = await client.query(`
        SELECT 
          p.product_id, 
          p.name_ar, 
          p.price, 
          p.stock_quantity,
          p.requires_age_verification,
          pv.variant_id,
          pv.variant_value,
          pv.price_modifier,
          pv.stock_quantity as variant_stock
        FROM products p
        LEFT JOIN product_variants pv ON p.product_id = pv.product_id AND pv.variant_id = $2
        WHERE p.product_id = $1 AND p.is_active = true
      `, [item.product_id, item.variant_id || null]);
            if (productQuery.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Product ${item.product_id} not found`,
                    error_ar: `المنتج ${item.product_id} غير موجود`,
                    error_fr: `Produit ${item.product_id} non trouvé`
                });
            }
            const product = productQuery.rows[0];
            // Check stock availability
            const availableStock = item.variant_id ? (product.variant_stock || 0) : product.stock_quantity;
            if (availableStock < item.quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Insufficient stock for ${product.name_ar}`,
                    error_ar: `مخزون غير كافي للمنتج ${product.name_ar}`,
                    error_fr: `Stock insuffisant pour ${product.name_ar}`,
                    available: availableStock,
                    requested: item.quantity
                });
            }
            // Calculate item price
            const basePrice = parseFloat(product.price);
            const priceModifier = parseFloat(product.price_modifier || '0');
            const unitPrice = basePrice + priceModifier;
            const itemTotal = unitPrice * item.quantity;
            subtotal += itemTotal;
            orderItems.push({
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: unitPrice,
                total_price: itemTotal,
                product_name: product.name_ar
            });
        }
        // Calculate delivery fee
        const deliveryFee = parseFloat(process.env.DEFAULT_DELIVERY_FEE || '15.00');
        const freeDeliveryThreshold = parseFloat(process.env.FREE_DELIVERY_THRESHOLD || '200.00');
        const finalDeliveryFee = subtotal >= freeDeliveryThreshold ? 0 : deliveryFee;
        // Calculate total
        const total = subtotal + finalDeliveryFee;
        // Check COD limits
        if (payment_method === 'cod') {
            const maxCodAmount = parseFloat(process.env.MAX_COD_AMOUNT || '500.00');
            if (total > maxCodAmount) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `COD orders cannot exceed ${maxCodAmount} MAD`,
                    error_ar: `طلبات الدفع نقداً لا يمكن أن تتجاوز ${maxCodAmount} درهم`,
                    error_fr: `Les commandes COD ne peuvent pas dépasser ${maxCodAmount} MAD`,
                    max_amount: maxCodAmount,
                    order_total: total
                });
            }
        }
        // Create order
        const orderResult = await client.query(`
      INSERT INTO orders (
        user_id, 
        order_number,
        subtotal, 
        delivery_fee, 
        total, 
        payment_method,
        payment_status,
        order_status,
        delivery_latitude,
        delivery_longitude,
        delivery_address,
        delivery_instructions,
        notes
      ) VALUES (
        $1, 
        CONCAT('ORD-', EXTRACT(YEAR FROM NOW()), '-', LPAD(nextval('order_number_seq')::text, 6, '0')),
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *
    `, [
            user_id,
            subtotal,
            finalDeliveryFee,
            total,
            payment_method,
            payment_method === 'cod' ? 'pending' : 'pending',
            'pending',
            delivery_address.latitude,
            delivery_address.longitude,
            delivery_address.address,
            delivery_instructions || null,
            notes || null
        ]);
        const order = orderResult.rows[0];
        // Create order items
        for (const item of orderItems) {
            await client.query(`
        INSERT INTO order_items (
          order_id, 
          product_id, 
          variant_id, 
          quantity, 
          unit_price, 
          total_price
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
                order.order_id,
                item.product_id,
                item.variant_id,
                item.quantity,
                item.unit_price,
                item.total_price
            ]);
            // Update stock
            if (item.variant_id) {
                await client.query(`
          UPDATE product_variants 
          SET stock_quantity = stock_quantity - $1 
          WHERE variant_id = $2
        `, [item.quantity, item.variant_id]);
            }
            else {
                await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity - $1 
          WHERE product_id = $2
        `, [item.quantity, item.product_id]);
            }
            // Record inventory movement
            await client.query(`
        INSERT INTO inventory_movements (
          product_id, 
          variant_id, 
          movement_type, 
          quantity, 
          reference_type, 
          reference_id, 
          notes
        ) VALUES ($1, $2, 'sale', $3, 'order', $4, $5)
      `, [
                item.product_id,
                item.variant_id,
                -item.quantity, // Negative for sale
                order.order_id,
                `Order ${order.order_number}`
            ]);
        }
        // Create COD collection record if needed
        if (payment_method === 'cod') {
            await client.query(`
        INSERT INTO cod_collections (
          order_id, 
          amount_to_collect, 
          collection_status
        ) VALUES ($1, $2, 'pending')
      `, [order.order_id, total]);
        }
        await client.query('COMMIT');
        // Fetch complete order details
        const completeOrder = await db.query(`
      SELECT 
        o.*,
        json_agg(
          json_build_object(
            'item_id', oi.item_id,
            'product_id', oi.product_id,
            'variant_id', oi.variant_id,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'product_name', p.name_ar
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      WHERE o.order_id = $1
      GROUP BY o.order_id
    `, [order.order_id]);
        res.status(201).json({
            message: 'Order created successfully',
            message_ar: 'تم إنشاء الطلب بنجاح',
            message_fr: 'Commande créée avec succès',
            order: completeOrder.rows[0]
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Order creation error:', error);
        res.status(500).json({
            error: 'Failed to create order',
            error_ar: 'فشل في إنشاء الطلب',
            error_fr: 'Échec de création de commande'
        });
    }
    finally {
        client.release();
    }
});
// Get user's orders
router.get('/my-orders', auth_1.authenticateToken, async (req, res) => {
    try {
        const { page = '1', limit = '10', status } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const user_id = req.user.user_id;
        let whereClause = 'WHERE o.user_id = $1';
        let queryParams = [user_id];
        if (status) {
            queryParams.push(status);
            whereClause += ` AND o.order_status = $${queryParams.length}`;
        }
        const query = `
      SELECT 
        o.order_id,
        o.order_number,
        o.subtotal,
        o.delivery_fee,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.delivery_address,
        o.created_at,
        o.updated_at,
        json_agg(
          json_build_object(
            'item_id', oi.item_id,
            'product_id', oi.product_id,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'product_name', p.name_ar,
            'product_image', (
              SELECT pi.url 
              FROM product_images pi 
              WHERE pi.product_id = p.product_id AND pi.is_primary = true 
              LIMIT 1
            )
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      ${whereClause}
      GROUP BY o.order_id
      ORDER BY o.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
        queryParams.push(parseInt(limit), offset);
        const result = await db.query(query, queryParams);
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      ${whereClause}
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
        console.error('Orders fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch orders',
            error_ar: 'فشل في جلب الطلبات',
            error_fr: 'Échec de récupération des commandes'
        });
    }
});
// Get order by ID
router.get('/:order_id', auth_1.authenticateToken, async (req, res) => {
    try {
        const { order_id } = req.params;
        const user_id = req.user.user_id;
        const result = await db.query(`
      SELECT 
        o.*,
        json_agg(
          json_build_object(
            'item_id', oi.item_id,
            'product_id', oi.product_id,
            'variant_id', oi.variant_id,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price,
            'product_name', p.name_ar,
            'variant_value', pv.variant_value
          )
        ) as items,
        cod.collection_status as cod_status,
        cod.collected_amount,
        cod.collected_at
      FROM orders o
      LEFT JOIN order_items oi ON o.order_id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.product_id
      LEFT JOIN product_variants pv ON oi.variant_id = pv.variant_id
      LEFT JOIN cod_collections cod ON o.order_id = cod.order_id
      WHERE o.order_id = $1 AND o.user_id = $2
      GROUP BY o.order_id, cod.collection_id
    `, [order_id, user_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Order not found',
                error_ar: 'الطلب غير موجود',
                error_fr: 'Commande non trouvée'
            });
        }
        res.json({
            order: result.rows[0]
        });
    }
    catch (error) {
        console.error('Order fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch order',
            error_ar: 'فشل في جلب الطلب',
            error_fr: 'Échec de récupération de commande'
        });
    }
});
// Cancel order (only if status is pending)
router.patch('/:order_id/cancel', auth_1.authenticateToken, async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { order_id } = req.params;
        const user_id = req.user.user_id;
        // Check if order exists and belongs to user
        const orderCheck = await client.query(`
      SELECT order_id, order_status, payment_method
      FROM orders 
      WHERE order_id = $1 AND user_id = $2
    `, [order_id, user_id]);
        if (orderCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'Order not found',
                error_ar: 'الطلب غير موجود',
                error_fr: 'Commande non trouvée'
            });
        }
        const order = orderCheck.rows[0];
        // Check if order can be cancelled
        if (!['pending', 'confirmed'].includes(order.order_status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Order cannot be cancelled',
                error_ar: 'لا يمكن إلغاء الطلب',
                error_fr: 'La commande ne peut pas être annulée',
                current_status: order.order_status
            });
        }
        // Get order items to restore stock
        const itemsResult = await client.query(`
      SELECT oi.product_id, oi.variant_id, oi.quantity
      FROM order_items oi
      WHERE oi.order_id = $1
    `, [order_id]);
        // Restore stock for each item
        for (const item of itemsResult.rows) {
            if (item.variant_id) {
                await client.query(`
          UPDATE product_variants 
          SET stock_quantity = stock_quantity + $1 
          WHERE variant_id = $2
        `, [item.quantity, item.variant_id]);
            }
            else {
                await client.query(`
          UPDATE products 
          SET stock_quantity = stock_quantity + $1 
          WHERE product_id = $2
        `, [item.quantity, item.product_id]);
            }
            // Record inventory movement
            await client.query(`
        INSERT INTO inventory_movements (
          product_id, 
          variant_id, 
          movement_type, 
          quantity, 
          reference_type, 
          reference_id, 
          notes
        ) VALUES ($1, $2, 'return', $3, 'order_cancellation', $4, $5)
      `, [
                item.product_id,
                item.variant_id,
                item.quantity, // Positive for return
                order_id,
                'Order cancelled - stock restored'
            ]);
        }
        // Update order status
        await client.query(`
      UPDATE orders 
      SET 
        order_status = 'cancelled',
        payment_status = 'cancelled',
        updated_at = NOW()
      WHERE order_id = $1
    `, [order_id]);
        // Update COD collection if exists
        if (order.payment_method === 'cod') {
            await client.query(`
        UPDATE cod_collections 
        SET collection_status = 'cancelled'
        WHERE order_id = $1
      `, [order_id]);
        }
        await client.query('COMMIT');
        res.json({
            message: 'Order cancelled successfully',
            message_ar: 'تم إلغاء الطلب بنجاح',
            message_fr: 'Commande annulée avec succès'
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Order cancellation error:', error);
        res.status(500).json({
            error: 'Failed to cancel order',
            error_ar: 'فشل في إلغاء الطلب',
            error_fr: 'Échec d\'annulation de commande'
        });
    }
    finally {
        client.release();
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3JvdXRlcy9vcmRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxzREFBcUQ7QUFDckQseURBQTJEO0FBQzNELHVEQUF5QztBQUN6QyxpQ0FBMkM7QUFFM0MsTUFBTSxNQUFNLEdBQUcsaUJBQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQTRGaEMsbUJBQW1CO0FBQ25CLE1BQU0sbUJBQW1CLEdBQUc7SUFDMUIsSUFBQSx3QkFBSSxFQUFDLE9BQU8sQ0FBQztTQUNWLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQztTQUNuQixXQUFXLENBQUMsc0NBQXNDLENBQUM7SUFDdEQsSUFBQSx3QkFBSSxFQUFDLG9CQUFvQixDQUFDO1NBQ3ZCLE1BQU0sRUFBRTtTQUNSLFdBQVcsQ0FBQyxvQkFBb0IsQ0FBQztJQUNwQyxJQUFBLHdCQUFJLEVBQUMsa0JBQWtCLENBQUM7U0FDckIsS0FBSyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1NBQ2pCLFdBQVcsQ0FBQyw2QkFBNkIsQ0FBQztJQUM3QyxJQUFBLHdCQUFJLEVBQUMsb0JBQW9CLENBQUM7U0FDdkIsUUFBUSxFQUFFO1NBQ1YsTUFBTSxFQUFFO1NBQ1IsV0FBVyxDQUFDLG9CQUFvQixDQUFDO0lBQ3BDLElBQUEsd0JBQUksRUFBQywyQkFBMkIsQ0FBQztTQUM5QixPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQzlCLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQztJQUNsQyxJQUFBLHdCQUFJLEVBQUMsNEJBQTRCLENBQUM7U0FDL0IsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUs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QThCO1lBQ3ZDLFVBQVUsRUFBRSxzQkFBc0I7WUFDbEMsVUFBVSxFQUFFLDhCQUE4QjtTQUMzQyxDQUFDLENBQUM7SUFFTCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvQixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSx3QkFBd0I7WUFDL0IsUUFBUSxFQUFFLG9CQUFvQjtZQUM5QixRQUFRLEVBQUUsaUNBQWlDO1NBQzVDLENBQUMsQ0FBQztJQUNMLENBQUM7WUFBUyxDQUFDO1FBQ1QsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILGtCQUFlLE1BQU0sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyBib2R5LCB2YWxpZGF0aW9uUmVzdWx0IH0gZnJvbSAnZXhwcmVzcy12YWxpZGF0b3InO1xuaW1wb3J0ICogYXMgZGIgZnJvbSAnLi4vY29uZmlnL2RhdGFiYXNlJztcbmltcG9ydCB7IGF1dGhlbnRpY2F0ZVRva2VuIH0gZnJvbSAnLi9hdXRoJztcblxuY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcblxuLy8gVHlwZSBkZWZpbml0aW9uc1xuaW50ZXJmYWNlIE9yZGVySXRlbSB7XG4gIHByb2R1Y3RfaWQ6IHN0cmluZztcbiAgdmFyaWFudF9pZD86IHN0cmluZztcbiAgcXVhbnRpdHk6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIERlbGl2ZXJ5QWRkcmVzcyB7XG4gIGxhdGl0dWRlOiBudW1iZXI7XG4gIGxvbmdpdHVkZTogbnVtYmVyO1xuICBhZGRyZXNzOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDcmVhdGVPcmRlclJlcXVlc3Qge1xuICBpdGVtczogT3JkZXJJdGVtW107XG4gIGRlbGl2ZXJ5X2FkZHJlc3M6IERlbGl2ZXJ5QWRkcmVzcztcbiAgcGF5bWVudF9tZXRob2Q6ICdjb2QnIHwgJ2NhcmQnO1xuICBub3Rlcz86IHN0cmluZztcbiAgZGVsaXZlcnlfaW5zdHJ1Y3Rpb25zPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUHJvZHVjdERldGFpbHMge1xuICBwcm9kdWN0X2lkOiBzdHJpbmc7XG4gIG5hbWVfYXI6IHN0cmluZztcbiAgcHJpY2U6IHN0cmluZztcbiAgc3RvY2tfcXVhbnRpdHk6IG51bWJlcjtcbiAgcmVxdWlyZXNfYWdlX3ZlcmlmaWNhdGlvbjogYm9vbGVhbjtcbiAgdmFyaWFudF9pZD86IHN0cmluZztcbiAgdmFyaWFudF92YWx1ZT86IHN0cmluZztcbiAgcHJpY2VfbW9kaWZpZXI/OiBzdHJpbmc7XG4gIHZhcmlhbnRfc3RvY2s/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQcm9jZXNzZWRPcmRlckl0ZW0ge1xuICBwcm9kdWN0X2lkOiBzdHJpbmc7XG4gIHZhcmlhbnRfaWQ/OiBzdHJpbmc7XG4gIHF1YW50aXR5OiBudW1iZXI7XG4gIHVuaXRfcHJpY2U6IG51bWJlcjtcbiAgdG90YWxfcHJpY2U6IG51bWJlcjtcbiAgcHJvZHVjdF9uYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBPcmRlciB7XG4gIG9yZGVyX2lkOiBzdHJpbmc7XG4gIG9yZGVyX251bWJlcjogc3RyaW5nO1xuICB1c2VyX2lkOiBzdHJpbmc7XG4gIHN1YnRvdGFsOiBudW1iZXI7XG4gIGRlbGl2ZXJ5X2ZlZTogbnVtYmVyO1xuICB0b3RhbDogbnVtYmVyO1xuICBwYXltZW50X21ldGhvZDogJ2NvZCcgfCAnY2FyZCc7XG4gIHBheW1lbnRfc3RhdHVzOiAncGVuZGluZycgfCAnY29tcGxldGVkJyB8ICdmYWlsZWQnIHwgJ2NhbmNlbGxlZCc7XG4gIG9yZGVyX3N0YXR1czogJ3BlbmRpbmcnIHwgJ2NvbmZpcm1lZCcgfCAncHJvY2Vzc2luZycgfCAnc2hpcHBlZCcgfCAnZGVsaXZlcmVkJyB8ICdjYW5jZWxsZWQnO1xuICBkZWxpdmVyeV9sYXRpdHVkZTogbnVtYmVyO1xuICBkZWxpdmVyeV9sb25naXR1ZGU6IG51bWJlcjtcbiAgZGVsaXZlcnlfYWRkcmVzczogc3RyaW5nO1xuICBkZWxpdmVyeV9pbnN0cnVjdGlvbnM/OiBzdHJpbmc7XG4gIG5vdGVzPzogc3RyaW5nO1xuICBjcmVhdGVkX2F0OiBzdHJpbmc7XG4gIHVwZGF0ZWRfYXQ6IHN0cmluZztcbiAgaXRlbXM/OiBPcmRlckl0ZW1XaXRoRGV0YWlsc1tdO1xuICBjb2Rfc3RhdHVzPzogc3RyaW5nO1xuICBjb2xsZWN0ZWRfYW1vdW50PzogbnVtYmVyO1xuICBjb2xsZWN0ZWRfYXQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBPcmRlckl0ZW1XaXRoRGV0YWlscyB7XG4gIGl0ZW1faWQ6IHN0cmluZztcbiAgcHJvZHVjdF9pZDogc3RyaW5nO1xuICB2YXJpYW50X2lkPzogc3RyaW5nO1xuICBxdWFudGl0eTogbnVtYmVyO1xuICB1bml0X3ByaWNlOiBudW1iZXI7XG4gIHRvdGFsX3ByaWNlOiBudW1iZXI7XG4gIHByb2R1Y3RfbmFtZTogc3RyaW5nO1xuICB2YXJpYW50X3ZhbHVlPzogc3RyaW5nO1xuICBwcm9kdWN0X2ltYWdlPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgT3JkZXJGaWx0ZXJzIHtcbiAgcGFnZT86IHN0cmluZztcbiAgbGltaXQ/OiBzdHJpbmc7XG4gIHN0YXR1cz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFBhZ2luYXRpb25JbmZvIHtcbiAgcGFnZTogbnVtYmVyO1xuICBsaW1pdDogbnVtYmVyO1xuICB0b3RhbDogbnVtYmVyO1xuICBwYWdlczogbnVtYmVyO1xufVxuXG4vLyBWYWxpZGF0aW9uIHJ1bGVzXG5jb25zdCB2YWxpZGF0ZUNyZWF0ZU9yZGVyID0gW1xuICBib2R5KCdpdGVtcycpXG4gICAgLmlzQXJyYXkoeyBtaW46IDEgfSlcbiAgICAud2l0aE1lc3NhZ2UoJ09yZGVyIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgaXRlbScpLFxuICBib2R5KCdpdGVtcy4qLnByb2R1Y3RfaWQnKVxuICAgIC5pc1VVSUQoKVxuICAgIC53aXRoTWVzc2FnZSgnSW52YWxpZCBwcm9kdWN0IElEJyksXG4gIGJvZHkoJ2l0ZW1zLioucXVhbnRpdHknKVxuICAgIC5pc0ludCh7IG1pbjogMSB9KVxuICAgIC53aXRoTWVzc2FnZSgnUXVhbnRpdHkgbXVzdCBiZSBhdCBsZWFzdCAxJyksXG4gIGJvZHkoJ2l0ZW1zLioudmFyaWFudF9pZCcpXG4gICAgLm9wdGlvbmFsKClcbiAgICAuaXNVVUlEKClcbiAgICAud2l0aE1lc3NhZ2UoJ0ludmFsaWQgdmFyaWFudCBJRCcpLFxuICBib2R5KCdkZWxpdmVyeV9hZGRyZXNzLmxhdGl0dWRlJylcbiAgICAuaXNGbG9hdCh7IG1pbjogLTkwLCBtYXg6IDkwIH0pXG4gICAgLndpdGhNZXNzYWdlKCdJbnZhbGlkIGxhdGl0dWRlJyksXG4gIGJvZHkoJ2RlbGl2ZXJ5X2FkZHJlc3MubG9uZ2l0dWRlJylcbiAgICAuaXNGbG9hdCh7IG1pbjogLTE4MCwgbWF4OiAxODAgfSlcbiAgICAud2l0aE1lc3NhZ2UoJ0ludmFsaWQgbG9uZ2l0dWRlJyksXG4gIGJvZHkoJ2RlbGl2ZXJ5X2FkZHJlc3MuYWRkcmVzcycpXG4gICAgLmlzTGVuZ3RoKHsgbWluOiA1LCBtYXg6IDIwMCB9KVxuICAgIC53aXRoTWVzc2FnZSgnQWRkcmVzcyBtdXN0IGJlIDUtMjAwIGNoYXJhY3RlcnMnKSxcbiAgYm9keSgncGF5bWVudF9tZXRob2QnKVxuICAgIC5pc0luKFsnY29kJywgJ2NhcmQnXSlcbiAgICAud2l0aE1lc3NhZ2UoJ1BheW1lbnQgbWV0aG9kIG11c3QgYmUgY29kIG9yIGNhcmQnKSxcbiAgYm9keSgnbm90ZXMnKVxuICAgIC5vcHRpb25hbCgpXG4gICAgLmlzTGVuZ3RoKHsgbWF4OiA1MDAgfSlcbiAgICAud2l0aE1lc3NhZ2UoJ05vdGVzIGNhbm5vdCBleGNlZWQgNTAwIGNoYXJhY3RlcnMnKVxuXTtcblxuLy8gQ3JlYXRlIG5ldyBvcmRlclxucm91dGVyLnBvc3QoJy8nLCBhdXRoZW50aWNhdGVUb2tlbiwgdmFsaWRhdGVDcmVhdGVPcmRlciwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIGNvbnN0IGNsaWVudCA9IGF3YWl0IGRiLnBvb2wuY29ubmVjdCgpO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zdCBlcnJvcnMgPSB2YWxpZGF0aW9uUmVzdWx0KHJlcSk7XG4gICAgaWYgKCFlcnJvcnMuaXNFbXB0eSgpKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ1ZhbGlkYXRpb24gZmFpbGVkJyxcbiAgICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYp9mE2KrYrdmC2YIg2YXZhiDYp9mE2KjZitin2YbYp9iqJyxcbiAgICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgbGEgdmFsaWRhdGlvbicsXG4gICAgICAgIGRldGFpbHM6IGVycm9ycy5hcnJheSgpXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0JFR0lOJyk7XG5cbiAgICBjb25zdCB7IGl0ZW1zLCBkZWxpdmVyeV9hZGRyZXNzLCBwYXltZW50X21ldGhvZCwgbm90ZXMsIGRlbGl2ZXJ5X2luc3RydWN0aW9ucyB9ID0gcmVxLmJvZHkgYXMgQ3JlYXRlT3JkZXJSZXF1ZXN0O1xuICAgIGNvbnN0IHVzZXJfaWQgPSByZXEudXNlciEudXNlcl9pZDtcblxuICAgIC8vIENhbGN1bGF0ZSBvcmRlciB0b3RhbHNcbiAgICBsZXQgc3VidG90YWwgPSAwO1xuICAgIGNvbnN0IG9yZGVySXRlbXM6IFByb2Nlc3NlZE9yZGVySXRlbVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgIC8vIEdldCBwcm9kdWN0IGRldGFpbHNcbiAgICAgIGNvbnN0IHByb2R1Y3RRdWVyeSA9IGF3YWl0IGNsaWVudC5xdWVyeTxQcm9kdWN0RGV0YWlscz4oYFxuICAgICAgICBTRUxFQ1QgXG4gICAgICAgICAgcC5wcm9kdWN0X2lkLCBcbiAgICAgICAgICBwLm5hbWVfYXIsIFxuICAgICAgICAgIHAucHJpY2UsIFxuICAgICAgICAgIHAuc3RvY2tfcXVhbnRpdHksXG4gICAgICAgICAgcC5yZXF1aXJlc19hZ2VfdmVyaWZpY2F0aW9uLFxuICAgICAgICAgIHB2LnZhcmlhbnRfaWQsXG4gICAgICAgICAgcHYudmFyaWFudF92YWx1ZSxcbiAgICAgICAgICBwdi5wcmljZV9tb2RpZmllcixcbiAgICAgICAgICBwdi5zdG9ja19xdWFudGl0eSBhcyB2YXJpYW50X3N0b2NrXG4gICAgICAgIEZST00gcHJvZHVjdHMgcFxuICAgICAgICBMRUZUIEpPSU4gcHJvZHVjdF92YXJpYW50cyBwdiBPTiBwLnByb2R1Y3RfaWQgPSBwdi5wcm9kdWN0X2lkIEFORCBwdi52YXJpYW50X2lkID0gJDJcbiAgICAgICAgV0hFUkUgcC5wcm9kdWN0X2lkID0gJDEgQU5EIHAuaXNfYWN0aXZlID0gdHJ1ZVxuICAgICAgYCwgW2l0ZW0ucHJvZHVjdF9pZCwgaXRlbS52YXJpYW50X2lkIHx8IG51bGxdKTtcblxuICAgICAgaWYgKHByb2R1Y3RRdWVyeS5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJyk7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6IGBQcm9kdWN0ICR7aXRlbS5wcm9kdWN0X2lkfSBub3QgZm91bmRgLFxuICAgICAgICAgIGVycm9yX2FyOiBg2KfZhNmF2YbYqtisICR7aXRlbS5wcm9kdWN0X2lkfSDYutmK2LEg2YXZiNis2YjYr2AsXG4gICAgICAgICAgZXJyb3JfZnI6IGBQcm9kdWl0ICR7aXRlbS5wcm9kdWN0X2lkfSBub24gdHJvdXbDqWBcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHByb2R1Y3QgPSBwcm9kdWN0UXVlcnkucm93c1swXTtcbiAgICAgIFxuICAgICAgLy8gQ2hlY2sgc3RvY2sgYXZhaWxhYmlsaXR5XG4gICAgICBjb25zdCBhdmFpbGFibGVTdG9jayA9IGl0ZW0udmFyaWFudF9pZCA/IChwcm9kdWN0LnZhcmlhbnRfc3RvY2sgfHwgMCkgOiBwcm9kdWN0LnN0b2NrX3F1YW50aXR5O1xuICAgICAgaWYgKGF2YWlsYWJsZVN0b2NrIDwgaXRlbS5xdWFudGl0eSkge1xuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJyk7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6IGBJbnN1ZmZpY2llbnQgc3RvY2sgZm9yICR7cHJvZHVjdC5uYW1lX2FyfWAsXG4gICAgICAgICAgZXJyb3JfYXI6IGDZhdiu2LLZiNmGINi62YrYsSDZg9in2YHZiiDZhNmE2YXZhtiq2KwgJHtwcm9kdWN0Lm5hbWVfYXJ9YCxcbiAgICAgICAgICBlcnJvcl9mcjogYFN0b2NrIGluc3VmZmlzYW50IHBvdXIgJHtwcm9kdWN0Lm5hbWVfYXJ9YCxcbiAgICAgICAgICBhdmFpbGFibGU6IGF2YWlsYWJsZVN0b2NrLFxuICAgICAgICAgIHJlcXVlc3RlZDogaXRlbS5xdWFudGl0eVxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2FsY3VsYXRlIGl0ZW0gcHJpY2VcbiAgICAgIGNvbnN0IGJhc2VQcmljZSA9IHBhcnNlRmxvYXQocHJvZHVjdC5wcmljZSk7XG4gICAgICBjb25zdCBwcmljZU1vZGlmaWVyID0gcGFyc2VGbG9hdChwcm9kdWN0LnByaWNlX21vZGlmaWVyIHx8ICcwJyk7XG4gICAgICBjb25zdCB1bml0UHJpY2UgPSBiYXNlUHJpY2UgKyBwcmljZU1vZGlmaWVyO1xuICAgICAgY29uc3QgaXRlbVRvdGFsID0gdW5pdFByaWNlICogaXRlbS5xdWFudGl0eTtcblxuICAgICAgc3VidG90YWwgKz0gaXRlbVRvdGFsO1xuXG4gICAgICBvcmRlckl0ZW1zLnB1c2goe1xuICAgICAgICBwcm9kdWN0X2lkOiBpdGVtLnByb2R1Y3RfaWQsXG4gICAgICAgIHZhcmlhbnRfaWQ6IGl0ZW0udmFyaWFudF9pZCxcbiAgICAgICAgcXVhbnRpdHk6IGl0ZW0ucXVhbnRpdHksXG4gICAgICAgIHVuaXRfcHJpY2U6IHVuaXRQcmljZSxcbiAgICAgICAgdG90YWxfcHJpY2U6IGl0ZW1Ub3RhbCxcbiAgICAgICAgcHJvZHVjdF9uYW1lOiBwcm9kdWN0Lm5hbWVfYXJcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENhbGN1bGF0ZSBkZWxpdmVyeSBmZWVcbiAgICBjb25zdCBkZWxpdmVyeUZlZSA9IHBhcnNlRmxvYXQocHJvY2Vzcy5lbnYuREVGQVVMVF9ERUxJVkVSWV9GRUUgfHwgJzE1LjAwJyk7XG4gICAgY29uc3QgZnJlZURlbGl2ZXJ5VGhyZXNob2xkID0gcGFyc2VGbG9hdChwcm9jZXNzLmVudi5GUkVFX0RFTElWRVJZX1RIUkVTSE9MRCB8fCAnMjAwLjAwJyk7XG4gICAgY29uc3QgZmluYWxEZWxpdmVyeUZlZSA9IHN1YnRvdGFsID49IGZyZWVEZWxpdmVyeVRocmVzaG9sZCA/IDAgOiBkZWxpdmVyeUZlZTtcblxuICAgIC8vIENhbGN1bGF0ZSB0b3RhbFxuICAgIGNvbnN0IHRvdGFsID0gc3VidG90YWwgKyBmaW5hbERlbGl2ZXJ5RmVlO1xuXG4gICAgLy8gQ2hlY2sgQ09EIGxpbWl0c1xuICAgIGlmIChwYXltZW50X21ldGhvZCA9PT0gJ2NvZCcpIHtcbiAgICAgIGNvbnN0IG1heENvZEFtb3VudCA9IHBhcnNlRmxvYXQocHJvY2Vzcy5lbnYuTUFYX0NPRF9BTU9VTlQgfHwgJzUwMC4wMCcpO1xuICAgICAgaWYgKHRvdGFsID4gbWF4Q29kQW1vdW50KSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogYENPRCBvcmRlcnMgY2Fubm90IGV4Y2VlZCAke21heENvZEFtb3VudH0gTUFEYCxcbiAgICAgICAgICBlcnJvcl9hcjogYNi32YTYqNin2Kog2KfZhNiv2YHYuSDZhtmC2K/Yp9mLINmE2Kcg2YrZhdmD2YYg2KPZhiDYqtiq2KzYp9mI2LIgJHttYXhDb2RBbW91bnR9INiv2LHZh9mFYCxcbiAgICAgICAgICBlcnJvcl9mcjogYExlcyBjb21tYW5kZXMgQ09EIG5lIHBldXZlbnQgcGFzIGTDqXBhc3NlciAke21heENvZEFtb3VudH0gTUFEYCxcbiAgICAgICAgICBtYXhfYW1vdW50OiBtYXhDb2RBbW91bnQsXG4gICAgICAgICAgb3JkZXJfdG90YWw6IHRvdGFsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENyZWF0ZSBvcmRlclxuICAgIGNvbnN0IG9yZGVyUmVzdWx0ID0gYXdhaXQgY2xpZW50LnF1ZXJ5PE9yZGVyPihgXG4gICAgICBJTlNFUlQgSU5UTyBvcmRlcnMgKFxuICAgICAgICB1c2VyX2lkLCBcbiAgICAgICAgb3JkZXJfbnVtYmVyLFxuICAgICAgICBzdWJ0b3RhbCwgXG4gICAgICAgIGRlbGl2ZXJ5X2ZlZSwgXG4gICAgICAgIHRvdGFsLCBcbiAgICAgICAgcGF5bWVudF9tZXRob2QsXG4gICAgICAgIHBheW1lbnRfc3RhdHVzLFxuICAgICAgICBvcmRlcl9zdGF0dXMsXG4gICAgICAgIGRlbGl2ZXJ5X2xhdGl0dWRlLFxuICAgICAgICBkZWxpdmVyeV9sb25naXR1ZGUsXG4gICAgICAgIGRlbGl2ZXJ5X2FkZHJlc3MsXG4gICAgICAgIGRlbGl2ZXJ5X2luc3RydWN0aW9ucyxcbiAgICAgICAgbm90ZXNcbiAgICAgICkgVkFMVUVTIChcbiAgICAgICAgJDEsIFxuICAgICAgICBDT05DQVQoJ09SRC0nLCBFWFRSQUNUKFlFQVIgRlJPTSBOT1coKSksICctJywgTFBBRChuZXh0dmFsKCdvcmRlcl9udW1iZXJfc2VxJyk6OnRleHQsIDYsICcwJykpLFxuICAgICAgICAkMiwgJDMsICQ0LCAkNSwgJDYsICQ3LCAkOCwgJDksICQxMCwgJDExLCAkMTJcbiAgICAgICkgUkVUVVJOSU5HICpcbiAgICBgLCBbXG4gICAgICB1c2VyX2lkLFxuICAgICAgc3VidG90YWwsXG4gICAgICBmaW5hbERlbGl2ZXJ5RmVlLFxuICAgICAgdG90YWwsXG4gICAgICBwYXltZW50X21ldGhvZCxcbiAgICAgIHBheW1lbnRfbWV0aG9kID09PSAnY29kJyA/ICdwZW5kaW5nJyA6ICdwZW5kaW5nJyxcbiAgICAgICdwZW5kaW5nJyxcbiAgICAgIGRlbGl2ZXJ5X2FkZHJlc3MubGF0aXR1ZGUsXG4gICAgICBkZWxpdmVyeV9hZGRyZXNzLmxvbmdpdHVkZSxcbiAgICAgIGRlbGl2ZXJ5X2FkZHJlc3MuYWRkcmVzcyxcbiAgICAgIGRlbGl2ZXJ5X2luc3RydWN0aW9ucyB8fCBudWxsLFxuICAgICAgbm90ZXMgfHwgbnVsbFxuICAgIF0pO1xuXG4gICAgY29uc3Qgb3JkZXIgPSBvcmRlclJlc3VsdC5yb3dzWzBdO1xuXG4gICAgLy8gQ3JlYXRlIG9yZGVyIGl0ZW1zXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIG9yZGVySXRlbXMpIHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgIElOU0VSVCBJTlRPIG9yZGVyX2l0ZW1zIChcbiAgICAgICAgICBvcmRlcl9pZCwgXG4gICAgICAgICAgcHJvZHVjdF9pZCwgXG4gICAgICAgICAgdmFyaWFudF9pZCwgXG4gICAgICAgICAgcXVhbnRpdHksIFxuICAgICAgICAgIHVuaXRfcHJpY2UsIFxuICAgICAgICAgIHRvdGFsX3ByaWNlXG4gICAgICAgICkgVkFMVUVTICgkMSwgJDIsICQzLCAkNCwgJDUsICQ2KVxuICAgICAgYCwgW1xuICAgICAgICBvcmRlci5vcmRlcl9pZCxcbiAgICAgICAgaXRlbS5wcm9kdWN0X2lkLFxuICAgICAgICBpdGVtLnZhcmlhbnRfaWQsXG4gICAgICAgIGl0ZW0ucXVhbnRpdHksXG4gICAgICAgIGl0ZW0udW5pdF9wcmljZSxcbiAgICAgICAgaXRlbS50b3RhbF9wcmljZVxuICAgICAgXSk7XG5cbiAgICAgIC8vIFVwZGF0ZSBzdG9ja1xuICAgICAgaWYgKGl0ZW0udmFyaWFudF9pZCkge1xuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgICAgIFVQREFURSBwcm9kdWN0X3ZhcmlhbnRzIFxuICAgICAgICAgIFNFVCBzdG9ja19xdWFudGl0eSA9IHN0b2NrX3F1YW50aXR5IC0gJDEgXG4gICAgICAgICAgV0hFUkUgdmFyaWFudF9pZCA9ICQyXG4gICAgICAgIGAsIFtpdGVtLnF1YW50aXR5LCBpdGVtLnZhcmlhbnRfaWRdKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgICAgVVBEQVRFIHByb2R1Y3RzIFxuICAgICAgICAgIFNFVCBzdG9ja19xdWFudGl0eSA9IHN0b2NrX3F1YW50aXR5IC0gJDEgXG4gICAgICAgICAgV0hFUkUgcHJvZHVjdF9pZCA9ICQyXG4gICAgICAgIGAsIFtpdGVtLnF1YW50aXR5LCBpdGVtLnByb2R1Y3RfaWRdKTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVjb3JkIGludmVudG9yeSBtb3ZlbWVudFxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgSU5TRVJUIElOVE8gaW52ZW50b3J5X21vdmVtZW50cyAoXG4gICAgICAgICAgcHJvZHVjdF9pZCwgXG4gICAgICAgICAgdmFyaWFudF9pZCwgXG4gICAgICAgICAgbW92ZW1lbnRfdHlwZSwgXG4gICAgICAgICAgcXVhbnRpdHksIFxuICAgICAgICAgIHJlZmVyZW5jZV90eXBlLCBcbiAgICAgICAgICByZWZlcmVuY2VfaWQsIFxuICAgICAgICAgIG5vdGVzXG4gICAgICAgICkgVkFMVUVTICgkMSwgJDIsICdzYWxlJywgJDMsICdvcmRlcicsICQ0LCAkNSlcbiAgICAgIGAsIFtcbiAgICAgICAgaXRlbS5wcm9kdWN0X2lkLFxuICAgICAgICBpdGVtLnZhcmlhbnRfaWQsXG4gICAgICAgIC1pdGVtLnF1YW50aXR5LCAvLyBOZWdhdGl2ZSBmb3Igc2FsZVxuICAgICAgICBvcmRlci5vcmRlcl9pZCxcbiAgICAgICAgYE9yZGVyICR7b3JkZXIub3JkZXJfbnVtYmVyfWBcbiAgICAgIF0pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBDT0QgY29sbGVjdGlvbiByZWNvcmQgaWYgbmVlZGVkXG4gICAgaWYgKHBheW1lbnRfbWV0aG9kID09PSAnY29kJykge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgSU5TRVJUIElOVE8gY29kX2NvbGxlY3Rpb25zIChcbiAgICAgICAgICBvcmRlcl9pZCwgXG4gICAgICAgICAgYW1vdW50X3RvX2NvbGxlY3QsIFxuICAgICAgICAgIGNvbGxlY3Rpb25fc3RhdHVzXG4gICAgICAgICkgVkFMVUVTICgkMSwgJDIsICdwZW5kaW5nJylcbiAgICAgIGAsIFtvcmRlci5vcmRlcl9pZCwgdG90YWxdKTtcbiAgICB9XG5cbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0NPTU1JVCcpO1xuXG4gICAgLy8gRmV0Y2ggY29tcGxldGUgb3JkZXIgZGV0YWlsc1xuICAgIGNvbnN0IGNvbXBsZXRlT3JkZXIgPSBhd2FpdCBkYi5xdWVyeTxPcmRlcj4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBvLiosXG4gICAgICAgIGpzb25fYWdnKFxuICAgICAgICAgIGpzb25fYnVpbGRfb2JqZWN0KFxuICAgICAgICAgICAgJ2l0ZW1faWQnLCBvaS5pdGVtX2lkLFxuICAgICAgICAgICAgJ3Byb2R1Y3RfaWQnLCBvaS5wcm9kdWN0X2lkLFxuICAgICAgICAgICAgJ3ZhcmlhbnRfaWQnLCBvaS52YXJpYW50X2lkLFxuICAgICAgICAgICAgJ3F1YW50aXR5Jywgb2kucXVhbnRpdHksXG4gICAgICAgICAgICAndW5pdF9wcmljZScsIG9pLnVuaXRfcHJpY2UsXG4gICAgICAgICAgICAndG90YWxfcHJpY2UnLCBvaS50b3RhbF9wcmljZSxcbiAgICAgICAgICAgICdwcm9kdWN0X25hbWUnLCBwLm5hbWVfYXJcbiAgICAgICAgICApXG4gICAgICAgICkgYXMgaXRlbXNcbiAgICAgIEZST00gb3JkZXJzIG9cbiAgICAgIExFRlQgSk9JTiBvcmRlcl9pdGVtcyBvaSBPTiBvLm9yZGVyX2lkID0gb2kub3JkZXJfaWRcbiAgICAgIExFRlQgSk9JTiBwcm9kdWN0cyBwIE9OIG9pLnByb2R1Y3RfaWQgPSBwLnByb2R1Y3RfaWRcbiAgICAgIFdIRVJFIG8ub3JkZXJfaWQgPSAkMVxuICAgICAgR1JPVVAgQlkgby5vcmRlcl9pZFxuICAgIGAsIFtvcmRlci5vcmRlcl9pZF0pO1xuXG4gICAgcmVzLnN0YXR1cygyMDEpLmpzb24oe1xuICAgICAgbWVzc2FnZTogJ09yZGVyIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgIG1lc3NhZ2VfYXI6ICfYqtmFINil2YbYtNin2KEg2KfZhNi32YTYqCDYqNmG2KzYp9itJyxcbiAgICAgIG1lc3NhZ2VfZnI6ICdDb21tYW5kZSBjcsOpw6llIGF2ZWMgc3VjY8OocycsXG4gICAgICBvcmRlcjogY29tcGxldGVPcmRlci5yb3dzWzBdXG4gICAgfSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJyk7XG4gICAgY29uc29sZS5lcnJvcignT3JkZXIgY3JlYXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGNyZWF0ZSBvcmRlcicsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINil2YbYtNin2KEg2KfZhNi32YTYqCcsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSBjcsOpYXRpb24gZGUgY29tbWFuZGUnXG4gICAgfSk7XG4gIH0gZmluYWxseSB7XG4gICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgfVxufSk7XG5cbi8vIEdldCB1c2VyJ3Mgb3JkZXJzXG5yb3V0ZXIuZ2V0KCcvbXktb3JkZXJzJywgYXV0aGVudGljYXRlVG9rZW4sIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgcGFnZSA9ICcxJywgbGltaXQgPSAnMTAnLCBzdGF0dXMgfSA9IHJlcS5xdWVyeSBhcyBPcmRlckZpbHRlcnM7XG4gICAgY29uc3Qgb2Zmc2V0ID0gKHBhcnNlSW50KHBhZ2UpIC0gMSkgKiBwYXJzZUludChsaW1pdCk7XG4gICAgY29uc3QgdXNlcl9pZCA9IHJlcS51c2VyIS51c2VyX2lkO1xuXG4gICAgbGV0IHdoZXJlQ2xhdXNlID0gJ1dIRVJFIG8udXNlcl9pZCA9ICQxJztcbiAgICBsZXQgcXVlcnlQYXJhbXM6IGFueVtdID0gW3VzZXJfaWRdO1xuXG4gICAgaWYgKHN0YXR1cykge1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChzdGF0dXMpO1xuICAgICAgd2hlcmVDbGF1c2UgKz0gYCBBTkQgby5vcmRlcl9zdGF0dXMgPSAkJHtxdWVyeVBhcmFtcy5sZW5ndGh9YDtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgby5vcmRlcl9pZCxcbiAgICAgICAgby5vcmRlcl9udW1iZXIsXG4gICAgICAgIG8uc3VidG90YWwsXG4gICAgICAgIG8uZGVsaXZlcnlfZmVlLFxuICAgICAgICBvLnRvdGFsLFxuICAgICAgICBvLnBheW1lbnRfbWV0aG9kLFxuICAgICAgICBvLnBheW1lbnRfc3RhdHVzLFxuICAgICAgICBvLm9yZGVyX3N0YXR1cyxcbiAgICAgICAgby5kZWxpdmVyeV9hZGRyZXNzLFxuICAgICAgICBvLmNyZWF0ZWRfYXQsXG4gICAgICAgIG8udXBkYXRlZF9hdCxcbiAgICAgICAganNvbl9hZ2coXG4gICAgICAgICAganNvbl9idWlsZF9vYmplY3QoXG4gICAgICAgICAgICAnaXRlbV9pZCcsIG9pLml0ZW1faWQsXG4gICAgICAgICAgICAncHJvZHVjdF9pZCcsIG9pLnByb2R1Y3RfaWQsXG4gICAgICAgICAgICAncXVhbnRpdHknLCBvaS5xdWFudGl0eSxcbiAgICAgICAgICAgICd1bml0X3ByaWNlJywgb2kudW5pdF9wcmljZSxcbiAgICAgICAgICAgICd0b3RhbF9wcmljZScsIG9pLnRvdGFsX3ByaWNlLFxuICAgICAgICAgICAgJ3Byb2R1Y3RfbmFtZScsIHAubmFtZV9hcixcbiAgICAgICAgICAgICdwcm9kdWN0X2ltYWdlJywgKFxuICAgICAgICAgICAgICBTRUxFQ1QgcGkudXJsIFxuICAgICAgICAgICAgICBGUk9NIHByb2R1Y3RfaW1hZ2VzIHBpIFxuICAgICAgICAgICAgICBXSEVSRSBwaS5wcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkIEFORCBwaS5pc19wcmltYXJ5ID0gdHJ1ZSBcbiAgICAgICAgICAgICAgTElNSVQgMVxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgKSBhcyBpdGVtc1xuICAgICAgRlJPTSBvcmRlcnMgb1xuICAgICAgTEVGVCBKT0lOIG9yZGVyX2l0ZW1zIG9pIE9OIG8ub3JkZXJfaWQgPSBvaS5vcmRlcl9pZFxuICAgICAgTEVGVCBKT0lOIHByb2R1Y3RzIHAgT04gb2kucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZFxuICAgICAgJHt3aGVyZUNsYXVzZX1cbiAgICAgIEdST1VQIEJZIG8ub3JkZXJfaWRcbiAgICAgIE9SREVSIEJZIG8uY3JlYXRlZF9hdCBERVNDXG4gICAgICBMSU1JVCAkJHtxdWVyeVBhcmFtcy5sZW5ndGggKyAxfSBPRkZTRVQgJCR7cXVlcnlQYXJhbXMubGVuZ3RoICsgMn1cbiAgICBgO1xuXG4gICAgcXVlcnlQYXJhbXMucHVzaChwYXJzZUludChsaW1pdCksIG9mZnNldCk7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxPcmRlcj4ocXVlcnksIHF1ZXJ5UGFyYW1zKTtcblxuICAgIC8vIEdldCB0b3RhbCBjb3VudFxuICAgIGNvbnN0IGNvdW50UXVlcnkgPSBgXG4gICAgICBTRUxFQ1QgQ09VTlQoKikgYXMgdG90YWxcbiAgICAgIEZST00gb3JkZXJzIG9cbiAgICAgICR7d2hlcmVDbGF1c2V9XG4gICAgYDtcblxuICAgIGNvbnN0IGNvdW50UmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8e3RvdGFsOiBzdHJpbmd9Pihjb3VudFF1ZXJ5LCBxdWVyeVBhcmFtcy5zbGljZSgwLCAtMikpO1xuICAgIGNvbnN0IHRvdGFsID0gcGFyc2VJbnQoY291bnRSZXN1bHQucm93c1swXS50b3RhbCk7XG5cbiAgICBjb25zdCBwYWdpbmF0aW9uOiBQYWdpbmF0aW9uSW5mbyA9IHtcbiAgICAgIHBhZ2U6IHBhcnNlSW50KHBhZ2UpLFxuICAgICAgbGltaXQ6IHBhcnNlSW50KGxpbWl0KSxcbiAgICAgIHRvdGFsOiB0b3RhbCxcbiAgICAgIHBhZ2VzOiBNYXRoLmNlaWwodG90YWwgLyBwYXJzZUludChsaW1pdCkpXG4gICAgfTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIG9yZGVyczogcmVzdWx0LnJvd3MsXG4gICAgICBwYWdpbmF0aW9uXG4gICAgfSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdPcmRlcnMgZmV0Y2ggZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoIG9yZGVycycsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDYp9mE2LfZhNio2KfYqicsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZXMgY29tbWFuZGVzJ1xuICAgIH0pO1xuICB9XG59KTtcblxuLy8gR2V0IG9yZGVyIGJ5IElEXG5yb3V0ZXIuZ2V0KCcvOm9yZGVyX2lkJywgYXV0aGVudGljYXRlVG9rZW4sIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgb3JkZXJfaWQgfSA9IHJlcS5wYXJhbXM7XG4gICAgY29uc3QgdXNlcl9pZCA9IHJlcS51c2VyIS51c2VyX2lkO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8T3JkZXI+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgby4qLFxuICAgICAgICBqc29uX2FnZyhcbiAgICAgICAgICBqc29uX2J1aWxkX29iamVjdChcbiAgICAgICAgICAgICdpdGVtX2lkJywgb2kuaXRlbV9pZCxcbiAgICAgICAgICAgICdwcm9kdWN0X2lkJywgb2kucHJvZHVjdF9pZCxcbiAgICAgICAgICAgICd2YXJpYW50X2lkJywgb2kudmFyaWFudF9pZCxcbiAgICAgICAgICAgICdxdWFudGl0eScsIG9pLnF1YW50aXR5LFxuICAgICAgICAgICAgJ3VuaXRfcHJpY2UnLCBvaS51bml0X3ByaWNlLFxuICAgICAgICAgICAgJ3RvdGFsX3ByaWNlJywgb2kudG90YWxfcHJpY2UsXG4gICAgICAgICAgICAncHJvZHVjdF9uYW1lJywgcC5uYW1lX2FyLFxuICAgICAgICAgICAgJ3ZhcmlhbnRfdmFsdWUnLCBwdi52YXJpYW50X3ZhbHVlXG4gICAgICAgICAgKVxuICAgICAgICApIGFzIGl0ZW1zLFxuICAgICAgICBjb2QuY29sbGVjdGlvbl9zdGF0dXMgYXMgY29kX3N0YXR1cyxcbiAgICAgICAgY29kLmNvbGxlY3RlZF9hbW91bnQsXG4gICAgICAgIGNvZC5jb2xsZWN0ZWRfYXRcbiAgICAgIEZST00gb3JkZXJzIG9cbiAgICAgIExFRlQgSk9JTiBvcmRlcl9pdGVtcyBvaSBPTiBvLm9yZGVyX2lkID0gb2kub3JkZXJfaWRcbiAgICAgIExFRlQgSk9JTiBwcm9kdWN0cyBwIE9OIG9pLnByb2R1Y3RfaWQgPSBwLnByb2R1Y3RfaWRcbiAgICAgIExFRlQgSk9JTiBwcm9kdWN0X3ZhcmlhbnRzIHB2IE9OIG9pLnZhcmlhbnRfaWQgPSBwdi52YXJpYW50X2lkXG4gICAgICBMRUZUIEpPSU4gY29kX2NvbGxlY3Rpb25zIGNvZCBPTiBvLm9yZGVyX2lkID0gY29kLm9yZGVyX2lkXG4gICAgICBXSEVSRSBvLm9yZGVyX2lkID0gJDEgQU5EIG8udXNlcl9pZCA9ICQyXG4gICAgICBHUk9VUCBCWSBvLm9yZGVyX2lkLCBjb2QuY29sbGVjdGlvbl9pZFxuICAgIGAsIFtvcmRlcl9pZCwgdXNlcl9pZF0pO1xuXG4gICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdPcmRlciBub3QgZm91bmQnLFxuICAgICAgICBlcnJvcl9hcjogJ9in2YTYt9mE2Kgg2LrZitixINmF2YjYrNmI2K8nLFxuICAgICAgICBlcnJvcl9mcjogJ0NvbW1hbmRlIG5vbiB0cm91dsOpZSdcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJlcy5qc29uKHtcbiAgICAgIG9yZGVyOiByZXN1bHQucm93c1swXVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignT3JkZXIgZmV0Y2ggZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoIG9yZGVyJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KzZhNioINin2YTYt9mE2KgnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZGUgY29tbWFuZGUnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBDYW5jZWwgb3JkZXIgKG9ubHkgaWYgc3RhdHVzIGlzIHBlbmRpbmcpXG5yb3V0ZXIucGF0Y2goJy86b3JkZXJfaWQvY2FuY2VsJywgYXV0aGVudGljYXRlVG9rZW4sIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICBjb25zdCBjbGllbnQgPSBhd2FpdCBkYi5wb29sLmNvbm5lY3QoKTtcbiAgXG4gIHRyeSB7XG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdCRUdJTicpO1xuXG4gICAgY29uc3QgeyBvcmRlcl9pZCB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCB1c2VyX2lkID0gcmVxLnVzZXIhLnVzZXJfaWQ7XG5cbiAgICAvLyBDaGVjayBpZiBvcmRlciBleGlzdHMgYW5kIGJlbG9uZ3MgdG8gdXNlclxuICAgIGNvbnN0IG9yZGVyQ2hlY2sgPSBhd2FpdCBjbGllbnQucXVlcnk8e29yZGVyX2lkOiBzdHJpbmcsIG9yZGVyX3N0YXR1czogc3RyaW5nLCBwYXltZW50X21ldGhvZDogc3RyaW5nfT4oYFxuICAgICAgU0VMRUNUIG9yZGVyX2lkLCBvcmRlcl9zdGF0dXMsIHBheW1lbnRfbWV0aG9kXG4gICAgICBGUk9NIG9yZGVycyBcbiAgICAgIFdIRVJFIG9yZGVyX2lkID0gJDEgQU5EIHVzZXJfaWQgPSAkMlxuICAgIGAsIFtvcmRlcl9pZCwgdXNlcl9pZF0pO1xuXG4gICAgaWYgKG9yZGVyQ2hlY2sucm93cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnT3JkZXIgbm90IGZvdW5kJyxcbiAgICAgICAgZXJyb3JfYXI6ICfYp9mE2LfZhNioINi62YrYsSDZhdmI2KzZiNivJyxcbiAgICAgICAgZXJyb3JfZnI6ICdDb21tYW5kZSBub24gdHJvdXbDqWUnXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBvcmRlciA9IG9yZGVyQ2hlY2sucm93c1swXTtcblxuICAgIC8vIENoZWNrIGlmIG9yZGVyIGNhbiBiZSBjYW5jZWxsZWRcbiAgICBpZiAoIVsncGVuZGluZycsICdjb25maXJtZWQnXS5pbmNsdWRlcyhvcmRlci5vcmRlcl9zdGF0dXMpKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJyk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ09yZGVyIGNhbm5vdCBiZSBjYW5jZWxsZWQnLFxuICAgICAgICBlcnJvcl9hcjogJ9mE2Kcg2YrZhdmD2YYg2KXZhNi62KfYoSDYp9mE2LfZhNioJyxcbiAgICAgICAgZXJyb3JfZnI6ICdMYSBjb21tYW5kZSBuZSBwZXV0IHBhcyDDqnRyZSBhbm51bMOpZScsXG4gICAgICAgIGN1cnJlbnRfc3RhdHVzOiBvcmRlci5vcmRlcl9zdGF0dXNcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdldCBvcmRlciBpdGVtcyB0byByZXN0b3JlIHN0b2NrXG4gICAgY29uc3QgaXRlbXNSZXN1bHQgPSBhd2FpdCBjbGllbnQucXVlcnk8e3Byb2R1Y3RfaWQ6IHN0cmluZywgdmFyaWFudF9pZDogc3RyaW5nIHwgbnVsbCwgcXVhbnRpdHk6IG51bWJlcn0+KGBcbiAgICAgIFNFTEVDVCBvaS5wcm9kdWN0X2lkLCBvaS52YXJpYW50X2lkLCBvaS5xdWFudGl0eVxuICAgICAgRlJPTSBvcmRlcl9pdGVtcyBvaVxuICAgICAgV0hFUkUgb2kub3JkZXJfaWQgPSAkMVxuICAgIGAsIFtvcmRlcl9pZF0pO1xuXG4gICAgLy8gUmVzdG9yZSBzdG9jayBmb3IgZWFjaCBpdGVtXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zUmVzdWx0LnJvd3MpIHtcbiAgICAgIGlmIChpdGVtLnZhcmlhbnRfaWQpIHtcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgICBVUERBVEUgcHJvZHVjdF92YXJpYW50cyBcbiAgICAgICAgICBTRVQgc3RvY2tfcXVhbnRpdHkgPSBzdG9ja19xdWFudGl0eSArICQxIFxuICAgICAgICAgIFdIRVJFIHZhcmlhbnRfaWQgPSAkMlxuICAgICAgICBgLCBbaXRlbS5xdWFudGl0eSwgaXRlbS52YXJpYW50X2lkXSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgICAgIFVQREFURSBwcm9kdWN0cyBcbiAgICAgICAgICBTRVQgc3RvY2tfcXVhbnRpdHkgPSBzdG9ja19xdWFudGl0eSArICQxIFxuICAgICAgICAgIFdIRVJFIHByb2R1Y3RfaWQgPSAkMlxuICAgICAgICBgLCBbaXRlbS5xdWFudGl0eSwgaXRlbS5wcm9kdWN0X2lkXSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFJlY29yZCBpbnZlbnRvcnkgbW92ZW1lbnRcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgIElOU0VSVCBJTlRPIGludmVudG9yeV9tb3ZlbWVudHMgKFxuICAgICAgICAgIHByb2R1Y3RfaWQsIFxuICAgICAgICAgIHZhcmlhbnRfaWQsIFxuICAgICAgICAgIG1vdmVtZW50X3R5cGUsIFxuICAgICAgICAgIHF1YW50aXR5LCBcbiAgICAgICAgICByZWZlcmVuY2VfdHlwZSwgXG4gICAgICAgICAgcmVmZXJlbmNlX2lkLCBcbiAgICAgICAgICBub3Rlc1xuICAgICAgICApIFZBTFVFUyAoJDEsICQyLCAncmV0dXJuJywgJDMsICdvcmRlcl9jYW5jZWxsYXRpb24nLCAkNCwgJDUpXG4gICAgICBgLCBbXG4gICAgICAgIGl0ZW0ucHJvZHVjdF9pZCxcbiAgICAgICAgaXRlbS52YXJpYW50X2lkLFxuICAgICAgICBpdGVtLnF1YW50aXR5LCAvLyBQb3NpdGl2ZSBmb3IgcmV0dXJuXG4gICAgICAgIG9yZGVyX2lkLFxuICAgICAgICAnT3JkZXIgY2FuY2VsbGVkIC0gc3RvY2sgcmVzdG9yZWQnXG4gICAgICBdKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgb3JkZXIgc3RhdHVzXG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgIFVQREFURSBvcmRlcnMgXG4gICAgICBTRVQgXG4gICAgICAgIG9yZGVyX3N0YXR1cyA9ICdjYW5jZWxsZWQnLFxuICAgICAgICBwYXltZW50X3N0YXR1cyA9ICdjYW5jZWxsZWQnLFxuICAgICAgICB1cGRhdGVkX2F0ID0gTk9XKClcbiAgICAgIFdIRVJFIG9yZGVyX2lkID0gJDFcbiAgICBgLCBbb3JkZXJfaWRdKTtcblxuICAgIC8vIFVwZGF0ZSBDT0QgY29sbGVjdGlvbiBpZiBleGlzdHNcbiAgICBpZiAob3JkZXIucGF5bWVudF9tZXRob2QgPT09ICdjb2QnKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgICBVUERBVEUgY29kX2NvbGxlY3Rpb25zIFxuICAgICAgICBTRVQgY29sbGVjdGlvbl9zdGF0dXMgPSAnY2FuY2VsbGVkJ1xuICAgICAgICBXSEVSRSBvcmRlcl9pZCA9ICQxXG4gICAgICBgLCBbb3JkZXJfaWRdKTtcbiAgICB9XG5cbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0NPTU1JVCcpO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgbWVzc2FnZTogJ09yZGVyIGNhbmNlbGxlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgbWVzc2FnZV9hcjogJ9iq2YUg2KXZhNi62KfYoSDYp9mE2LfZhNioINio2YbYrNin2K0nLFxuICAgICAgbWVzc2FnZV9mcjogJ0NvbW1hbmRlIGFubnVsw6llIGF2ZWMgc3VjY8OocydcbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICBjb25zb2xlLmVycm9yKCdPcmRlciBjYW5jZWxsYXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGNhbmNlbCBvcmRlcicsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINil2YTYutin2KEg2KfZhNi32YTYqCcsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkXFwnYW5udWxhdGlvbiBkZSBjb21tYW5kZSdcbiAgICB9KTtcbiAgfSBmaW5hbGx5IHtcbiAgICBjbGllbnQucmVsZWFzZSgpO1xuICB9XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyOyJdfQ==