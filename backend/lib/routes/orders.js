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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3JkZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3JvdXRlcy9vcmRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHNEQUFxRDtBQUNyRCx5REFBMkQ7QUFDM0QsdURBQXlDO0FBQ3pDLGlDQUEyQztBQUUzQyxNQUFNLE1BQU0sR0FBRyxpQkFBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBNEZoQyxtQkFBbUI7QUFDbkIsTUFBTSxtQkFBbUIsR0FBRztJQUMxQixJQUFBLHdCQUFJLEVBQUMsT0FBTyxDQUFDO1NBQ1YsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1NBQ25CLFdBQVcsQ0FBQyxzQ0FBc0MsQ0FBQztJQUN0RCxJQUFBLHdCQUFJLEVBQUMsb0JBQW9CLENBQUM7U0FDdkIsTUFBTSxFQUFFO1NBQ1IsV0FBVyxDQUFDLG9CQUFvQixDQUFDO0lBQ3BDLElBQUEsd0JBQUksRUFBQyxrQkFBa0IsQ0FBQztTQUNyQixLQUFLLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUM7U0FDakIsV0FBVyxDQUFDLDZCQUE2QixDQUFDO0lBQzdDLElBQUEsd0JBQUksRUFBQyxvQkFBb0IsQ0FBQztTQUN2QixRQUFRLEVBQUU7U0FDVixNQUFNLEVBQUU7U0FDUixXQUFXLENBQUMsb0JBQW9CLENBQUM7SUFDcEMsSUFBQSx3QkFBSSxFQUFDLDJCQUEyQixDQUFDO1NBQzlCLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDOUIsV0FBVyxDQUFDLGtCQUFrQixDQUFDO0lBQ2xDLElBQUEsd0JBQUksRUFBQyw0QkFBNEIsQ0FBQztTQUMvQixPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO1NBQ2hD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VUFBVSxFQUFFLHNCQUFzQjtZQUNsQyxVQUFVLEVBQUUsOEJBQThCO1NBQzNDLENBQUMsQ0FBQztJQUVMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQy9CLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsS0FBSyxFQUFFLHdCQUF3QjtZQUMvQixRQUFRLEVBQUUsb0JBQW9CO1lBQzlCLFFBQVEsRUFBRSxpQ0FBaUM7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztZQUFTLENBQUM7UUFDVCxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbkIsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDO0FBRUgsa0JBQWUsTUFBTSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MsIHsgUmVxdWVzdCwgUmVzcG9uc2UgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IGJvZHksIHZhbGlkYXRpb25SZXN1bHQgfSBmcm9tICdleHByZXNzLXZhbGlkYXRvcic7XG5pbXBvcnQgKiBhcyBkYiBmcm9tICcuLi9jb25maWcvZGF0YWJhc2UnO1xuaW1wb3J0IHsgYXV0aGVudGljYXRlVG9rZW4gfSBmcm9tICcuL2F1dGgnO1xuXG5jb25zdCByb3V0ZXIgPSBleHByZXNzLlJvdXRlcigpO1xuXG4vLyBUeXBlIGRlZmluaXRpb25zXG5pbnRlcmZhY2UgT3JkZXJJdGVtIHtcbiAgcHJvZHVjdF9pZDogc3RyaW5nO1xuICB2YXJpYW50X2lkPzogc3RyaW5nO1xuICBxdWFudGl0eTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgRGVsaXZlcnlBZGRyZXNzIHtcbiAgbGF0aXR1ZGU6IG51bWJlcjtcbiAgbG9uZ2l0dWRlOiBudW1iZXI7XG4gIGFkZHJlc3M6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENyZWF0ZU9yZGVyUmVxdWVzdCB7XG4gIGl0ZW1zOiBPcmRlckl0ZW1bXTtcbiAgZGVsaXZlcnlfYWRkcmVzczogRGVsaXZlcnlBZGRyZXNzO1xuICBwYXltZW50X21ldGhvZDogJ2NvZCcgfCAnY2FyZCc7XG4gIG5vdGVzPzogc3RyaW5nO1xuICBkZWxpdmVyeV9pbnN0cnVjdGlvbnM/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBQcm9kdWN0RGV0YWlscyB7XG4gIHByb2R1Y3RfaWQ6IHN0cmluZztcbiAgbmFtZV9hcjogc3RyaW5nO1xuICBwcmljZTogc3RyaW5nO1xuICBzdG9ja19xdWFudGl0eTogbnVtYmVyO1xuICByZXF1aXJlc19hZ2VfdmVyaWZpY2F0aW9uOiBib29sZWFuO1xuICB2YXJpYW50X2lkPzogc3RyaW5nO1xuICB2YXJpYW50X3ZhbHVlPzogc3RyaW5nO1xuICBwcmljZV9tb2RpZmllcj86IHN0cmluZztcbiAgdmFyaWFudF9zdG9jaz86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFByb2Nlc3NlZE9yZGVySXRlbSB7XG4gIHByb2R1Y3RfaWQ6IHN0cmluZztcbiAgdmFyaWFudF9pZD86IHN0cmluZztcbiAgcXVhbnRpdHk6IG51bWJlcjtcbiAgdW5pdF9wcmljZTogbnVtYmVyO1xuICB0b3RhbF9wcmljZTogbnVtYmVyO1xuICBwcm9kdWN0X25hbWU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE9yZGVyIHtcbiAgb3JkZXJfaWQ6IHN0cmluZztcbiAgb3JkZXJfbnVtYmVyOiBzdHJpbmc7XG4gIHVzZXJfaWQ6IHN0cmluZztcbiAgc3VidG90YWw6IG51bWJlcjtcbiAgZGVsaXZlcnlfZmVlOiBudW1iZXI7XG4gIHRvdGFsOiBudW1iZXI7XG4gIHBheW1lbnRfbWV0aG9kOiAnY29kJyB8ICdjYXJkJztcbiAgcGF5bWVudF9zdGF0dXM6ICdwZW5kaW5nJyB8ICdjb21wbGV0ZWQnIHwgJ2ZhaWxlZCcgfCAnY2FuY2VsbGVkJztcbiAgb3JkZXJfc3RhdHVzOiAncGVuZGluZycgfCAnY29uZmlybWVkJyB8ICdwcm9jZXNzaW5nJyB8ICdzaGlwcGVkJyB8ICdkZWxpdmVyZWQnIHwgJ2NhbmNlbGxlZCc7XG4gIGRlbGl2ZXJ5X2xhdGl0dWRlOiBudW1iZXI7XG4gIGRlbGl2ZXJ5X2xvbmdpdHVkZTogbnVtYmVyO1xuICBkZWxpdmVyeV9hZGRyZXNzOiBzdHJpbmc7XG4gIGRlbGl2ZXJ5X2luc3RydWN0aW9ucz86IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG4gIGNyZWF0ZWRfYXQ6IHN0cmluZztcbiAgdXBkYXRlZF9hdDogc3RyaW5nO1xuICBpdGVtcz86IE9yZGVySXRlbVdpdGhEZXRhaWxzW107XG4gIGNvZF9zdGF0dXM/OiBzdHJpbmc7XG4gIGNvbGxlY3RlZF9hbW91bnQ/OiBudW1iZXI7XG4gIGNvbGxlY3RlZF9hdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE9yZGVySXRlbVdpdGhEZXRhaWxzIHtcbiAgaXRlbV9pZDogc3RyaW5nO1xuICBwcm9kdWN0X2lkOiBzdHJpbmc7XG4gIHZhcmlhbnRfaWQ/OiBzdHJpbmc7XG4gIHF1YW50aXR5OiBudW1iZXI7XG4gIHVuaXRfcHJpY2U6IG51bWJlcjtcbiAgdG90YWxfcHJpY2U6IG51bWJlcjtcbiAgcHJvZHVjdF9uYW1lOiBzdHJpbmc7XG4gIHZhcmlhbnRfdmFsdWU/OiBzdHJpbmc7XG4gIHByb2R1Y3RfaW1hZ2U/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBPcmRlckZpbHRlcnMge1xuICBwYWdlPzogc3RyaW5nO1xuICBsaW1pdD86IHN0cmluZztcbiAgc3RhdHVzPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGFnaW5hdGlvbkluZm8ge1xuICBwYWdlOiBudW1iZXI7XG4gIGxpbWl0OiBudW1iZXI7XG4gIHRvdGFsOiBudW1iZXI7XG4gIHBhZ2VzOiBudW1iZXI7XG59XG5cbi8vIFZhbGlkYXRpb24gcnVsZXNcbmNvbnN0IHZhbGlkYXRlQ3JlYXRlT3JkZXIgPSBbXG4gIGJvZHkoJ2l0ZW1zJylcbiAgICAuaXNBcnJheSh7IG1pbjogMSB9KVxuICAgIC53aXRoTWVzc2FnZSgnT3JkZXIgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBpdGVtJyksXG4gIGJvZHkoJ2l0ZW1zLioucHJvZHVjdF9pZCcpXG4gICAgLmlzVVVJRCgpXG4gICAgLndpdGhNZXNzYWdlKCdJbnZhbGlkIHByb2R1Y3QgSUQnKSxcbiAgYm9keSgnaXRlbXMuKi5xdWFudGl0eScpXG4gICAgLmlzSW50KHsgbWluOiAxIH0pXG4gICAgLndpdGhNZXNzYWdlKCdRdWFudGl0eSBtdXN0IGJlIGF0IGxlYXN0IDEnKSxcbiAgYm9keSgnaXRlbXMuKi52YXJpYW50X2lkJylcbiAgICAub3B0aW9uYWwoKVxuICAgIC5pc1VVSUQoKVxuICAgIC53aXRoTWVzc2FnZSgnSW52YWxpZCB2YXJpYW50IElEJyksXG4gIGJvZHkoJ2RlbGl2ZXJ5X2FkZHJlc3MubGF0aXR1ZGUnKVxuICAgIC5pc0Zsb2F0KHsgbWluOiAtOTAsIG1heDogOTAgfSlcbiAgICAud2l0aE1lc3NhZ2UoJ0ludmFsaWQgbGF0aXR1ZGUnKSxcbiAgYm9keSgnZGVsaXZlcnlfYWRkcmVzcy5sb25naXR1ZGUnKVxuICAgIC5pc0Zsb2F0KHsgbWluOiAtMTgwLCBtYXg6IDE4MCB9KVxuICAgIC53aXRoTWVzc2FnZSgnSW52YWxpZCBsb25naXR1ZGUnKSxcbiAgYm9keSgnZGVsaXZlcnlfYWRkcmVzcy5hZGRyZXNzJylcbiAgICAuaXNMZW5ndGgoeyBtaW46IDUsIG1heDogMjAwIH0pXG4gICAgLndpdGhNZXNzYWdlKCdBZGRyZXNzIG11c3QgYmUgNS0yMDAgY2hhcmFjdGVycycpLFxuICBib2R5KCdwYXltZW50X21ldGhvZCcpXG4gICAgLmlzSW4oWydjb2QnLCAnY2FyZCddKVxuICAgIC53aXRoTWVzc2FnZSgnUGF5bWVudCBtZXRob2QgbXVzdCBiZSBjb2Qgb3IgY2FyZCcpLFxuICBib2R5KCdub3RlcycpXG4gICAgLm9wdGlvbmFsKClcbiAgICAuaXNMZW5ndGgoeyBtYXg6IDUwMCB9KVxuICAgIC53aXRoTWVzc2FnZSgnTm90ZXMgY2Fubm90IGV4Y2VlZCA1MDAgY2hhcmFjdGVycycpXG5dO1xuXG4vLyBDcmVhdGUgbmV3IG9yZGVyXG5yb3V0ZXIucG9zdCgnLycsIGF1dGhlbnRpY2F0ZVRva2VuLCB2YWxpZGF0ZUNyZWF0ZU9yZGVyLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgY29uc3QgY2xpZW50ID0gYXdhaXQgZGIucG9vbC5jb25uZWN0KCk7XG4gIFxuICB0cnkge1xuICAgIGNvbnN0IGVycm9ycyA9IHZhbGlkYXRpb25SZXN1bHQocmVxKTtcbiAgICBpZiAoIWVycm9ycy5pc0VtcHR5KCkpIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnVmFsaWRhdGlvbiBmYWlsZWQnLFxuICAgICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINin2YTYqtit2YLZgiDZhdmGINin2YTYqNmK2KfZhtin2KonLFxuICAgICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSBsYSB2YWxpZGF0aW9uJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3JzLmFycmF5KClcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnQkVHSU4nKTtcblxuICAgIGNvbnN0IHsgaXRlbXMsIGRlbGl2ZXJ5X2FkZHJlc3MsIHBheW1lbnRfbWV0aG9kLCBub3RlcywgZGVsaXZlcnlfaW5zdHJ1Y3Rpb25zIH0gPSByZXEuYm9keSBhcyBDcmVhdGVPcmRlclJlcXVlc3Q7XG4gICAgY29uc3QgdXNlcl9pZCA9IHJlcS51c2VyIS51c2VyX2lkO1xuXG4gICAgLy8gQ2FsY3VsYXRlIG9yZGVyIHRvdGFsc1xuICAgIGxldCBzdWJ0b3RhbCA9IDA7XG4gICAgY29uc3Qgb3JkZXJJdGVtczogUHJvY2Vzc2VkT3JkZXJJdGVtW10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgLy8gR2V0IHByb2R1Y3QgZGV0YWlsc1xuICAgICAgY29uc3QgcHJvZHVjdFF1ZXJ5ID0gYXdhaXQgY2xpZW50LnF1ZXJ5PFByb2R1Y3REZXRhaWxzPihgXG4gICAgICAgIFNFTEVDVCBcbiAgICAgICAgICBwLnByb2R1Y3RfaWQsIFxuICAgICAgICAgIHAubmFtZV9hciwgXG4gICAgICAgICAgcC5wcmljZSwgXG4gICAgICAgICAgcC5zdG9ja19xdWFudGl0eSxcbiAgICAgICAgICBwLnJlcXVpcmVzX2FnZV92ZXJpZmljYXRpb24sXG4gICAgICAgICAgcHYudmFyaWFudF9pZCxcbiAgICAgICAgICBwdi52YXJpYW50X3ZhbHVlLFxuICAgICAgICAgIHB2LnByaWNlX21vZGlmaWVyLFxuICAgICAgICAgIHB2LnN0b2NrX3F1YW50aXR5IGFzIHZhcmlhbnRfc3RvY2tcbiAgICAgICAgRlJPTSBwcm9kdWN0cyBwXG4gICAgICAgIExFRlQgSk9JTiBwcm9kdWN0X3ZhcmlhbnRzIHB2IE9OIHAucHJvZHVjdF9pZCA9IHB2LnByb2R1Y3RfaWQgQU5EIHB2LnZhcmlhbnRfaWQgPSAkMlxuICAgICAgICBXSEVSRSBwLnByb2R1Y3RfaWQgPSAkMSBBTkQgcC5pc19hY3RpdmUgPSB0cnVlXG4gICAgICBgLCBbaXRlbS5wcm9kdWN0X2lkLCBpdGVtLnZhcmlhbnRfaWQgfHwgbnVsbF0pO1xuXG4gICAgICBpZiAocHJvZHVjdFF1ZXJ5LnJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogYFByb2R1Y3QgJHtpdGVtLnByb2R1Y3RfaWR9IG5vdCBmb3VuZGAsXG4gICAgICAgICAgZXJyb3JfYXI6IGDYp9mE2YXZhtiq2KwgJHtpdGVtLnByb2R1Y3RfaWR9INi62YrYsSDZhdmI2KzZiNivYCxcbiAgICAgICAgICBlcnJvcl9mcjogYFByb2R1aXQgJHtpdGVtLnByb2R1Y3RfaWR9IG5vbiB0cm91dsOpYFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcHJvZHVjdCA9IHByb2R1Y3RRdWVyeS5yb3dzWzBdO1xuICAgICAgXG4gICAgICAvLyBDaGVjayBzdG9jayBhdmFpbGFiaWxpdHlcbiAgICAgIGNvbnN0IGF2YWlsYWJsZVN0b2NrID0gaXRlbS52YXJpYW50X2lkID8gKHByb2R1Y3QudmFyaWFudF9zdG9jayB8fCAwKSA6IHByb2R1Y3Quc3RvY2tfcXVhbnRpdHk7XG4gICAgICBpZiAoYXZhaWxhYmxlU3RvY2sgPCBpdGVtLnF1YW50aXR5KSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogYEluc3VmZmljaWVudCBzdG9jayBmb3IgJHtwcm9kdWN0Lm5hbWVfYXJ9YCxcbiAgICAgICAgICBlcnJvcl9hcjogYNmF2K7YstmI2YYg2LrZitixINmD2KfZgdmKINmE2YTZhdmG2KrYrCAke3Byb2R1Y3QubmFtZV9hcn1gLFxuICAgICAgICAgIGVycm9yX2ZyOiBgU3RvY2sgaW5zdWZmaXNhbnQgcG91ciAke3Byb2R1Y3QubmFtZV9hcn1gLFxuICAgICAgICAgIGF2YWlsYWJsZTogYXZhaWxhYmxlU3RvY2ssXG4gICAgICAgICAgcmVxdWVzdGVkOiBpdGVtLnF1YW50aXR5XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBDYWxjdWxhdGUgaXRlbSBwcmljZVxuICAgICAgY29uc3QgYmFzZVByaWNlID0gcGFyc2VGbG9hdChwcm9kdWN0LnByaWNlKTtcbiAgICAgIGNvbnN0IHByaWNlTW9kaWZpZXIgPSBwYXJzZUZsb2F0KHByb2R1Y3QucHJpY2VfbW9kaWZpZXIgfHwgJzAnKTtcbiAgICAgIGNvbnN0IHVuaXRQcmljZSA9IGJhc2VQcmljZSArIHByaWNlTW9kaWZpZXI7XG4gICAgICBjb25zdCBpdGVtVG90YWwgPSB1bml0UHJpY2UgKiBpdGVtLnF1YW50aXR5O1xuXG4gICAgICBzdWJ0b3RhbCArPSBpdGVtVG90YWw7XG5cbiAgICAgIG9yZGVySXRlbXMucHVzaCh7XG4gICAgICAgIHByb2R1Y3RfaWQ6IGl0ZW0ucHJvZHVjdF9pZCxcbiAgICAgICAgdmFyaWFudF9pZDogaXRlbS52YXJpYW50X2lkLFxuICAgICAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcbiAgICAgICAgdW5pdF9wcmljZTogdW5pdFByaWNlLFxuICAgICAgICB0b3RhbF9wcmljZTogaXRlbVRvdGFsLFxuICAgICAgICBwcm9kdWN0X25hbWU6IHByb2R1Y3QubmFtZV9hclxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ2FsY3VsYXRlIGRlbGl2ZXJ5IGZlZVxuICAgIGNvbnN0IGRlbGl2ZXJ5RmVlID0gcGFyc2VGbG9hdChwcm9jZXNzLmVudi5ERUZBVUxUX0RFTElWRVJZX0ZFRSB8fCAnMTUuMDAnKTtcbiAgICBjb25zdCBmcmVlRGVsaXZlcnlUaHJlc2hvbGQgPSBwYXJzZUZsb2F0KHByb2Nlc3MuZW52LkZSRUVfREVMSVZFUllfVEhSRVNIT0xEIHx8ICcyMDAuMDAnKTtcbiAgICBjb25zdCBmaW5hbERlbGl2ZXJ5RmVlID0gc3VidG90YWwgPj0gZnJlZURlbGl2ZXJ5VGhyZXNob2xkID8gMCA6IGRlbGl2ZXJ5RmVlO1xuXG4gICAgLy8gQ2FsY3VsYXRlIHRvdGFsXG4gICAgY29uc3QgdG90YWwgPSBzdWJ0b3RhbCArIGZpbmFsRGVsaXZlcnlGZWU7XG5cbiAgICAvLyBDaGVjayBDT0QgbGltaXRzXG4gICAgaWYgKHBheW1lbnRfbWV0aG9kID09PSAnY29kJykge1xuICAgICAgY29uc3QgbWF4Q29kQW1vdW50ID0gcGFyc2VGbG9hdChwcm9jZXNzLmVudi5NQVhfQ09EX0FNT1VOVCB8fCAnNTAwLjAwJyk7XG4gICAgICBpZiAodG90YWwgPiBtYXhDb2RBbW91bnQpIHtcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBgQ09EIG9yZGVycyBjYW5ub3QgZXhjZWVkICR7bWF4Q29kQW1vdW50fSBNQURgLFxuICAgICAgICAgIGVycm9yX2FyOiBg2LfZhNio2KfYqiDYp9mE2K/Zgdi5INmG2YLYr9in2Ysg2YTYpyDZitmF2YPZhiDYo9mGINiq2KrYrNin2YjYsiAke21heENvZEFtb3VudH0g2K/YsdmH2YVgLFxuICAgICAgICAgIGVycm9yX2ZyOiBgTGVzIGNvbW1hbmRlcyBDT0QgbmUgcGV1dmVudCBwYXMgZMOpcGFzc2VyICR7bWF4Q29kQW1vdW50fSBNQURgLFxuICAgICAgICAgIG1heF9hbW91bnQ6IG1heENvZEFtb3VudCxcbiAgICAgICAgICBvcmRlcl90b3RhbDogdG90YWxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIG9yZGVyXG4gICAgY29uc3Qgb3JkZXJSZXN1bHQgPSBhd2FpdCBjbGllbnQucXVlcnk8T3JkZXI+KGBcbiAgICAgIElOU0VSVCBJTlRPIG9yZGVycyAoXG4gICAgICAgIHVzZXJfaWQsIFxuICAgICAgICBvcmRlcl9udW1iZXIsXG4gICAgICAgIHN1YnRvdGFsLCBcbiAgICAgICAgZGVsaXZlcnlfZmVlLCBcbiAgICAgICAgdG90YWwsIFxuICAgICAgICBwYXltZW50X21ldGhvZCxcbiAgICAgICAgcGF5bWVudF9zdGF0dXMsXG4gICAgICAgIG9yZGVyX3N0YXR1cyxcbiAgICAgICAgZGVsaXZlcnlfbGF0aXR1ZGUsXG4gICAgICAgIGRlbGl2ZXJ5X2xvbmdpdHVkZSxcbiAgICAgICAgZGVsaXZlcnlfYWRkcmVzcyxcbiAgICAgICAgZGVsaXZlcnlfaW5zdHJ1Y3Rpb25zLFxuICAgICAgICBub3Rlc1xuICAgICAgKSBWQUxVRVMgKFxuICAgICAgICAkMSwgXG4gICAgICAgIENPTkNBVCgnT1JELScsIEVYVFJBQ1QoWUVBUiBGUk9NIE5PVygpKSwgJy0nLCBMUEFEKG5leHR2YWwoJ29yZGVyX251bWJlcl9zZXEnKTo6dGV4dCwgNiwgJzAnKSksXG4gICAgICAgICQyLCAkMywgJDQsICQ1LCAkNiwgJDcsICQ4LCAkOSwgJDEwLCAkMTEsICQxMlxuICAgICAgKSBSRVRVUk5JTkcgKlxuICAgIGAsIFtcbiAgICAgIHVzZXJfaWQsXG4gICAgICBzdWJ0b3RhbCxcbiAgICAgIGZpbmFsRGVsaXZlcnlGZWUsXG4gICAgICB0b3RhbCxcbiAgICAgIHBheW1lbnRfbWV0aG9kLFxuICAgICAgcGF5bWVudF9tZXRob2QgPT09ICdjb2QnID8gJ3BlbmRpbmcnIDogJ3BlbmRpbmcnLFxuICAgICAgJ3BlbmRpbmcnLFxuICAgICAgZGVsaXZlcnlfYWRkcmVzcy5sYXRpdHVkZSxcbiAgICAgIGRlbGl2ZXJ5X2FkZHJlc3MubG9uZ2l0dWRlLFxuICAgICAgZGVsaXZlcnlfYWRkcmVzcy5hZGRyZXNzLFxuICAgICAgZGVsaXZlcnlfaW5zdHJ1Y3Rpb25zIHx8IG51bGwsXG4gICAgICBub3RlcyB8fCBudWxsXG4gICAgXSk7XG5cbiAgICBjb25zdCBvcmRlciA9IG9yZGVyUmVzdWx0LnJvd3NbMF07XG5cbiAgICAvLyBDcmVhdGUgb3JkZXIgaXRlbXNcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygb3JkZXJJdGVtcykge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgSU5TRVJUIElOVE8gb3JkZXJfaXRlbXMgKFxuICAgICAgICAgIG9yZGVyX2lkLCBcbiAgICAgICAgICBwcm9kdWN0X2lkLCBcbiAgICAgICAgICB2YXJpYW50X2lkLCBcbiAgICAgICAgICBxdWFudGl0eSwgXG4gICAgICAgICAgdW5pdF9wcmljZSwgXG4gICAgICAgICAgdG90YWxfcHJpY2VcbiAgICAgICAgKSBWQUxVRVMgKCQxLCAkMiwgJDMsICQ0LCAkNSwgJDYpXG4gICAgICBgLCBbXG4gICAgICAgIG9yZGVyLm9yZGVyX2lkLFxuICAgICAgICBpdGVtLnByb2R1Y3RfaWQsXG4gICAgICAgIGl0ZW0udmFyaWFudF9pZCxcbiAgICAgICAgaXRlbS5xdWFudGl0eSxcbiAgICAgICAgaXRlbS51bml0X3ByaWNlLFxuICAgICAgICBpdGVtLnRvdGFsX3ByaWNlXG4gICAgICBdKTtcblxuICAgICAgLy8gVXBkYXRlIHN0b2NrXG4gICAgICBpZiAoaXRlbS52YXJpYW50X2lkKSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgICAgVVBEQVRFIHByb2R1Y3RfdmFyaWFudHMgXG4gICAgICAgICAgU0VUIHN0b2NrX3F1YW50aXR5ID0gc3RvY2tfcXVhbnRpdHkgLSAkMSBcbiAgICAgICAgICBXSEVSRSB2YXJpYW50X2lkID0gJDJcbiAgICAgICAgYCwgW2l0ZW0ucXVhbnRpdHksIGl0ZW0udmFyaWFudF9pZF0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgICBVUERBVEUgcHJvZHVjdHMgXG4gICAgICAgICAgU0VUIHN0b2NrX3F1YW50aXR5ID0gc3RvY2tfcXVhbnRpdHkgLSAkMSBcbiAgICAgICAgICBXSEVSRSBwcm9kdWN0X2lkID0gJDJcbiAgICAgICAgYCwgW2l0ZW0ucXVhbnRpdHksIGl0ZW0ucHJvZHVjdF9pZF0pO1xuICAgICAgfVxuXG4gICAgICAvLyBSZWNvcmQgaW52ZW50b3J5IG1vdmVtZW50XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgICBJTlNFUlQgSU5UTyBpbnZlbnRvcnlfbW92ZW1lbnRzIChcbiAgICAgICAgICBwcm9kdWN0X2lkLCBcbiAgICAgICAgICB2YXJpYW50X2lkLCBcbiAgICAgICAgICBtb3ZlbWVudF90eXBlLCBcbiAgICAgICAgICBxdWFudGl0eSwgXG4gICAgICAgICAgcmVmZXJlbmNlX3R5cGUsIFxuICAgICAgICAgIHJlZmVyZW5jZV9pZCwgXG4gICAgICAgICAgbm90ZXNcbiAgICAgICAgKSBWQUxVRVMgKCQxLCAkMiwgJ3NhbGUnLCAkMywgJ29yZGVyJywgJDQsICQ1KVxuICAgICAgYCwgW1xuICAgICAgICBpdGVtLnByb2R1Y3RfaWQsXG4gICAgICAgIGl0ZW0udmFyaWFudF9pZCxcbiAgICAgICAgLWl0ZW0ucXVhbnRpdHksIC8vIE5lZ2F0aXZlIGZvciBzYWxlXG4gICAgICAgIG9yZGVyLm9yZGVyX2lkLFxuICAgICAgICBgT3JkZXIgJHtvcmRlci5vcmRlcl9udW1iZXJ9YFxuICAgICAgXSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIENPRCBjb2xsZWN0aW9uIHJlY29yZCBpZiBuZWVkZWRcbiAgICBpZiAocGF5bWVudF9tZXRob2QgPT09ICdjb2QnKSB7XG4gICAgICBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgICBJTlNFUlQgSU5UTyBjb2RfY29sbGVjdGlvbnMgKFxuICAgICAgICAgIG9yZGVyX2lkLCBcbiAgICAgICAgICBhbW91bnRfdG9fY29sbGVjdCwgXG4gICAgICAgICAgY29sbGVjdGlvbl9zdGF0dXNcbiAgICAgICAgKSBWQUxVRVMgKCQxLCAkMiwgJ3BlbmRpbmcnKVxuICAgICAgYCwgW29yZGVyLm9yZGVyX2lkLCB0b3RhbF0pO1xuICAgIH1cblxuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnQ09NTUlUJyk7XG5cbiAgICAvLyBGZXRjaCBjb21wbGV0ZSBvcmRlciBkZXRhaWxzXG4gICAgY29uc3QgY29tcGxldGVPcmRlciA9IGF3YWl0IGRiLnF1ZXJ5PE9yZGVyPihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIG8uKixcbiAgICAgICAganNvbl9hZ2coXG4gICAgICAgICAganNvbl9idWlsZF9vYmplY3QoXG4gICAgICAgICAgICAnaXRlbV9pZCcsIG9pLml0ZW1faWQsXG4gICAgICAgICAgICAncHJvZHVjdF9pZCcsIG9pLnByb2R1Y3RfaWQsXG4gICAgICAgICAgICAndmFyaWFudF9pZCcsIG9pLnZhcmlhbnRfaWQsXG4gICAgICAgICAgICAncXVhbnRpdHknLCBvaS5xdWFudGl0eSxcbiAgICAgICAgICAgICd1bml0X3ByaWNlJywgb2kudW5pdF9wcmljZSxcbiAgICAgICAgICAgICd0b3RhbF9wcmljZScsIG9pLnRvdGFsX3ByaWNlLFxuICAgICAgICAgICAgJ3Byb2R1Y3RfbmFtZScsIHAubmFtZV9hclxuICAgICAgICAgIClcbiAgICAgICAgKSBhcyBpdGVtc1xuICAgICAgRlJPTSBvcmRlcnMgb1xuICAgICAgTEVGVCBKT0lOIG9yZGVyX2l0ZW1zIG9pIE9OIG8ub3JkZXJfaWQgPSBvaS5vcmRlcl9pZFxuICAgICAgTEVGVCBKT0lOIHByb2R1Y3RzIHAgT04gb2kucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZFxuICAgICAgV0hFUkUgby5vcmRlcl9pZCA9ICQxXG4gICAgICBHUk9VUCBCWSBvLm9yZGVyX2lkXG4gICAgYCwgW29yZGVyLm9yZGVyX2lkXSk7XG5cbiAgICByZXMuc3RhdHVzKDIwMSkuanNvbih7XG4gICAgICBtZXNzYWdlOiAnT3JkZXIgY3JlYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgbWVzc2FnZV9hcjogJ9iq2YUg2KXZhti02KfYoSDYp9mE2LfZhNioINio2YbYrNin2K0nLFxuICAgICAgbWVzc2FnZV9mcjogJ0NvbW1hbmRlIGNyw6nDqWUgYXZlYyBzdWNjw6hzJyxcbiAgICAgIG9yZGVyOiBjb21wbGV0ZU9yZGVyLnJvd3NbMF1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICBjb25zb2xlLmVycm9yKCdPcmRlciBjcmVhdGlvbiBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gY3JlYXRlIG9yZGVyJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KXZhti02KfYoSDYp9mE2LfZhNioJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIGNyw6lhdGlvbiBkZSBjb21tYW5kZSdcbiAgICB9KTtcbiAgfSBmaW5hbGx5IHtcbiAgICBjbGllbnQucmVsZWFzZSgpO1xuICB9XG59KTtcblxuLy8gR2V0IHVzZXIncyBvcmRlcnNcbnJvdXRlci5nZXQoJy9teS1vcmRlcnMnLCBhdXRoZW50aWNhdGVUb2tlbiwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBwYWdlID0gJzEnLCBsaW1pdCA9ICcxMCcsIHN0YXR1cyB9ID0gcmVxLnF1ZXJ5IGFzIE9yZGVyRmlsdGVycztcbiAgICBjb25zdCBvZmZzZXQgPSAocGFyc2VJbnQocGFnZSkgLSAxKSAqIHBhcnNlSW50KGxpbWl0KTtcbiAgICBjb25zdCB1c2VyX2lkID0gcmVxLnVzZXIhLnVzZXJfaWQ7XG5cbiAgICBsZXQgd2hlcmVDbGF1c2UgPSAnV0hFUkUgby51c2VyX2lkID0gJDEnO1xuICAgIGxldCBxdWVyeVBhcmFtczogYW55W10gPSBbdXNlcl9pZF07XG5cbiAgICBpZiAoc3RhdHVzKSB7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHN0YXR1cyk7XG4gICAgICB3aGVyZUNsYXVzZSArPSBgIEFORCBvLm9yZGVyX3N0YXR1cyA9ICQke3F1ZXJ5UGFyYW1zLmxlbmd0aH1gO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBvLm9yZGVyX2lkLFxuICAgICAgICBvLm9yZGVyX251bWJlcixcbiAgICAgICAgby5zdWJ0b3RhbCxcbiAgICAgICAgby5kZWxpdmVyeV9mZWUsXG4gICAgICAgIG8udG90YWwsXG4gICAgICAgIG8ucGF5bWVudF9tZXRob2QsXG4gICAgICAgIG8ucGF5bWVudF9zdGF0dXMsXG4gICAgICAgIG8ub3JkZXJfc3RhdHVzLFxuICAgICAgICBvLmRlbGl2ZXJ5X2FkZHJlc3MsXG4gICAgICAgIG8uY3JlYXRlZF9hdCxcbiAgICAgICAgby51cGRhdGVkX2F0LFxuICAgICAgICBqc29uX2FnZyhcbiAgICAgICAgICBqc29uX2J1aWxkX29iamVjdChcbiAgICAgICAgICAgICdpdGVtX2lkJywgb2kuaXRlbV9pZCxcbiAgICAgICAgICAgICdwcm9kdWN0X2lkJywgb2kucHJvZHVjdF9pZCxcbiAgICAgICAgICAgICdxdWFudGl0eScsIG9pLnF1YW50aXR5LFxuICAgICAgICAgICAgJ3VuaXRfcHJpY2UnLCBvaS51bml0X3ByaWNlLFxuICAgICAgICAgICAgJ3RvdGFsX3ByaWNlJywgb2kudG90YWxfcHJpY2UsXG4gICAgICAgICAgICAncHJvZHVjdF9uYW1lJywgcC5uYW1lX2FyLFxuICAgICAgICAgICAgJ3Byb2R1Y3RfaW1hZ2UnLCAoXG4gICAgICAgICAgICAgIFNFTEVDVCBwaS51cmwgXG4gICAgICAgICAgICAgIEZST00gcHJvZHVjdF9pbWFnZXMgcGkgXG4gICAgICAgICAgICAgIFdIRVJFIHBpLnByb2R1Y3RfaWQgPSBwLnByb2R1Y3RfaWQgQU5EIHBpLmlzX3ByaW1hcnkgPSB0cnVlIFxuICAgICAgICAgICAgICBMSU1JVCAxXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICApIGFzIGl0ZW1zXG4gICAgICBGUk9NIG9yZGVycyBvXG4gICAgICBMRUZUIEpPSU4gb3JkZXJfaXRlbXMgb2kgT04gby5vcmRlcl9pZCA9IG9pLm9yZGVyX2lkXG4gICAgICBMRUZUIEpPSU4gcHJvZHVjdHMgcCBPTiBvaS5wcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkXG4gICAgICAke3doZXJlQ2xhdXNlfVxuICAgICAgR1JPVVAgQlkgby5vcmRlcl9pZFxuICAgICAgT1JERVIgQlkgby5jcmVhdGVkX2F0IERFU0NcbiAgICAgIExJTUlUICQke3F1ZXJ5UGFyYW1zLmxlbmd0aCArIDF9IE9GRlNFVCAkJHtxdWVyeVBhcmFtcy5sZW5ndGggKyAyfVxuICAgIGA7XG5cbiAgICBxdWVyeVBhcmFtcy5wdXNoKHBhcnNlSW50KGxpbWl0KSwgb2Zmc2V0KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PE9yZGVyPihxdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgLy8gR2V0IHRvdGFsIGNvdW50XG4gICAgY29uc3QgY291bnRRdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBDT1VOVCgqKSBhcyB0b3RhbFxuICAgICAgRlJPTSBvcmRlcnMgb1xuICAgICAgJHt3aGVyZUNsYXVzZX1cbiAgICBgO1xuXG4gICAgY29uc3QgY291bnRSZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTx7dG90YWw6IHN0cmluZ30+KGNvdW50UXVlcnksIHF1ZXJ5UGFyYW1zLnNsaWNlKDAsIC0yKSk7XG4gICAgY29uc3QgdG90YWwgPSBwYXJzZUludChjb3VudFJlc3VsdC5yb3dzWzBdLnRvdGFsKTtcblxuICAgIGNvbnN0IHBhZ2luYXRpb246IFBhZ2luYXRpb25JbmZvID0ge1xuICAgICAgcGFnZTogcGFyc2VJbnQocGFnZSksXG4gICAgICBsaW1pdDogcGFyc2VJbnQobGltaXQpLFxuICAgICAgdG90YWw6IHRvdGFsLFxuICAgICAgcGFnZXM6IE1hdGguY2VpbCh0b3RhbCAvIHBhcnNlSW50KGxpbWl0KSlcbiAgICB9O1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgb3JkZXJzOiByZXN1bHQucm93cyxcbiAgICAgIHBhZ2luYXRpb25cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ09yZGVycyBmZXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggb3JkZXJzJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KzZhNioINin2YTYt9mE2KjYp9iqJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBjb21tYW5kZXMnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgb3JkZXIgYnkgSURcbnJvdXRlci5nZXQoJy86b3JkZXJfaWQnLCBhdXRoZW50aWNhdGVUb2tlbiwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBvcmRlcl9pZCB9ID0gcmVxLnBhcmFtcztcbiAgICBjb25zdCB1c2VyX2lkID0gcmVxLnVzZXIhLnVzZXJfaWQ7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxPcmRlcj4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBvLiosXG4gICAgICAgIGpzb25fYWdnKFxuICAgICAgICAgIGpzb25fYnVpbGRfb2JqZWN0KFxuICAgICAgICAgICAgJ2l0ZW1faWQnLCBvaS5pdGVtX2lkLFxuICAgICAgICAgICAgJ3Byb2R1Y3RfaWQnLCBvaS5wcm9kdWN0X2lkLFxuICAgICAgICAgICAgJ3ZhcmlhbnRfaWQnLCBvaS52YXJpYW50X2lkLFxuICAgICAgICAgICAgJ3F1YW50aXR5Jywgb2kucXVhbnRpdHksXG4gICAgICAgICAgICAndW5pdF9wcmljZScsIG9pLnVuaXRfcHJpY2UsXG4gICAgICAgICAgICAndG90YWxfcHJpY2UnLCBvaS50b3RhbF9wcmljZSxcbiAgICAgICAgICAgICdwcm9kdWN0X25hbWUnLCBwLm5hbWVfYXIsXG4gICAgICAgICAgICAndmFyaWFudF92YWx1ZScsIHB2LnZhcmlhbnRfdmFsdWVcbiAgICAgICAgICApXG4gICAgICAgICkgYXMgaXRlbXMsXG4gICAgICAgIGNvZC5jb2xsZWN0aW9uX3N0YXR1cyBhcyBjb2Rfc3RhdHVzLFxuICAgICAgICBjb2QuY29sbGVjdGVkX2Ftb3VudCxcbiAgICAgICAgY29kLmNvbGxlY3RlZF9hdFxuICAgICAgRlJPTSBvcmRlcnMgb1xuICAgICAgTEVGVCBKT0lOIG9yZGVyX2l0ZW1zIG9pIE9OIG8ub3JkZXJfaWQgPSBvaS5vcmRlcl9pZFxuICAgICAgTEVGVCBKT0lOIHByb2R1Y3RzIHAgT04gb2kucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZFxuICAgICAgTEVGVCBKT0lOIHByb2R1Y3RfdmFyaWFudHMgcHYgT04gb2kudmFyaWFudF9pZCA9IHB2LnZhcmlhbnRfaWRcbiAgICAgIExFRlQgSk9JTiBjb2RfY29sbGVjdGlvbnMgY29kIE9OIG8ub3JkZXJfaWQgPSBjb2Qub3JkZXJfaWRcbiAgICAgIFdIRVJFIG8ub3JkZXJfaWQgPSAkMSBBTkQgby51c2VyX2lkID0gJDJcbiAgICAgIEdST1VQIEJZIG8ub3JkZXJfaWQsIGNvZC5jb2xsZWN0aW9uX2lkXG4gICAgYCwgW29yZGVyX2lkLCB1c2VyX2lkXSk7XG5cbiAgICBpZiAocmVzdWx0LnJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xuICAgICAgICBlcnJvcjogJ09yZGVyIG5vdCBmb3VuZCcsXG4gICAgICAgIGVycm9yX2FyOiAn2KfZhNi32YTYqCDYutmK2LEg2YXZiNis2YjYrycsXG4gICAgICAgIGVycm9yX2ZyOiAnQ29tbWFuZGUgbm9uIHRyb3V2w6llJ1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmVzLmpzb24oe1xuICAgICAgb3JkZXI6IHJlc3VsdC5yb3dzWzBdXG4gICAgfSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdPcmRlciBmZXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggb3JkZXInLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYrNmE2Kgg2KfZhNi32YTYqCcsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZSBjb21tYW5kZSdcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIENhbmNlbCBvcmRlciAob25seSBpZiBzdGF0dXMgaXMgcGVuZGluZylcbnJvdXRlci5wYXRjaCgnLzpvcmRlcl9pZC9jYW5jZWwnLCBhdXRoZW50aWNhdGVUb2tlbiwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gIGNvbnN0IGNsaWVudCA9IGF3YWl0IGRiLnBvb2wuY29ubmVjdCgpO1xuICBcbiAgdHJ5IHtcbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ0JFR0lOJyk7XG5cbiAgICBjb25zdCB7IG9yZGVyX2lkIH0gPSByZXEucGFyYW1zO1xuICAgIGNvbnN0IHVzZXJfaWQgPSByZXEudXNlciEudXNlcl9pZDtcblxuICAgIC8vIENoZWNrIGlmIG9yZGVyIGV4aXN0cyBhbmQgYmVsb25ncyB0byB1c2VyXG4gICAgY29uc3Qgb3JkZXJDaGVjayA9IGF3YWl0IGNsaWVudC5xdWVyeTx7b3JkZXJfaWQ6IHN0cmluZywgb3JkZXJfc3RhdHVzOiBzdHJpbmcsIHBheW1lbnRfbWV0aG9kOiBzdHJpbmd9PihgXG4gICAgICBTRUxFQ1Qgb3JkZXJfaWQsIG9yZGVyX3N0YXR1cywgcGF5bWVudF9tZXRob2RcbiAgICAgIEZST00gb3JkZXJzIFxuICAgICAgV0hFUkUgb3JkZXJfaWQgPSAkMSBBTkQgdXNlcl9pZCA9ICQyXG4gICAgYCwgW29yZGVyX2lkLCB1c2VyX2lkXSk7XG5cbiAgICBpZiAob3JkZXJDaGVjay5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdPcmRlciBub3QgZm91bmQnLFxuICAgICAgICBlcnJvcl9hcjogJ9in2YTYt9mE2Kgg2LrZitixINmF2YjYrNmI2K8nLFxuICAgICAgICBlcnJvcl9mcjogJ0NvbW1hbmRlIG5vbiB0cm91dsOpZSdcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG9yZGVyID0gb3JkZXJDaGVjay5yb3dzWzBdO1xuXG4gICAgLy8gQ2hlY2sgaWYgb3JkZXIgY2FuIGJlIGNhbmNlbGxlZFxuICAgIGlmICghWydwZW5kaW5nJywgJ2NvbmZpcm1lZCddLmluY2x1ZGVzKG9yZGVyLm9yZGVyX3N0YXR1cykpIHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnT3JkZXIgY2Fubm90IGJlIGNhbmNlbGxlZCcsXG4gICAgICAgIGVycm9yX2FyOiAn2YTYpyDZitmF2YPZhiDYpdmE2LrYp9ihINin2YTYt9mE2KgnLFxuICAgICAgICBlcnJvcl9mcjogJ0xhIGNvbW1hbmRlIG5lIHBldXQgcGFzIMOqdHJlIGFubnVsw6llJyxcbiAgICAgICAgY3VycmVudF9zdGF0dXM6IG9yZGVyLm9yZGVyX3N0YXR1c1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gR2V0IG9yZGVyIGl0ZW1zIHRvIHJlc3RvcmUgc3RvY2tcbiAgICBjb25zdCBpdGVtc1Jlc3VsdCA9IGF3YWl0IGNsaWVudC5xdWVyeTx7cHJvZHVjdF9pZDogc3RyaW5nLCB2YXJpYW50X2lkOiBzdHJpbmcgfCBudWxsLCBxdWFudGl0eTogbnVtYmVyfT4oYFxuICAgICAgU0VMRUNUIG9pLnByb2R1Y3RfaWQsIG9pLnZhcmlhbnRfaWQsIG9pLnF1YW50aXR5XG4gICAgICBGUk9NIG9yZGVyX2l0ZW1zIG9pXG4gICAgICBXSEVSRSBvaS5vcmRlcl9pZCA9ICQxXG4gICAgYCwgW29yZGVyX2lkXSk7XG5cbiAgICAvLyBSZXN0b3JlIHN0b2NrIGZvciBlYWNoIGl0ZW1cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXNSZXN1bHQucm93cykge1xuICAgICAgaWYgKGl0ZW0udmFyaWFudF9pZCkge1xuICAgICAgICBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgICAgIFVQREFURSBwcm9kdWN0X3ZhcmlhbnRzIFxuICAgICAgICAgIFNFVCBzdG9ja19xdWFudGl0eSA9IHN0b2NrX3F1YW50aXR5ICsgJDEgXG4gICAgICAgICAgV0hFUkUgdmFyaWFudF9pZCA9ICQyXG4gICAgICAgIGAsIFtpdGVtLnF1YW50aXR5LCBpdGVtLnZhcmlhbnRfaWRdKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgICAgVVBEQVRFIHByb2R1Y3RzIFxuICAgICAgICAgIFNFVCBzdG9ja19xdWFudGl0eSA9IHN0b2NrX3F1YW50aXR5ICsgJDEgXG4gICAgICAgICAgV0hFUkUgcHJvZHVjdF9pZCA9ICQyXG4gICAgICAgIGAsIFtpdGVtLnF1YW50aXR5LCBpdGVtLnByb2R1Y3RfaWRdKTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVjb3JkIGludmVudG9yeSBtb3ZlbWVudFxuICAgICAgYXdhaXQgY2xpZW50LnF1ZXJ5KGBcbiAgICAgICAgSU5TRVJUIElOVE8gaW52ZW50b3J5X21vdmVtZW50cyAoXG4gICAgICAgICAgcHJvZHVjdF9pZCwgXG4gICAgICAgICAgdmFyaWFudF9pZCwgXG4gICAgICAgICAgbW92ZW1lbnRfdHlwZSwgXG4gICAgICAgICAgcXVhbnRpdHksIFxuICAgICAgICAgIHJlZmVyZW5jZV90eXBlLCBcbiAgICAgICAgICByZWZlcmVuY2VfaWQsIFxuICAgICAgICAgIG5vdGVzXG4gICAgICAgICkgVkFMVUVTICgkMSwgJDIsICdyZXR1cm4nLCAkMywgJ29yZGVyX2NhbmNlbGxhdGlvbicsICQ0LCAkNSlcbiAgICAgIGAsIFtcbiAgICAgICAgaXRlbS5wcm9kdWN0X2lkLFxuICAgICAgICBpdGVtLnZhcmlhbnRfaWQsXG4gICAgICAgIGl0ZW0ucXVhbnRpdHksIC8vIFBvc2l0aXZlIGZvciByZXR1cm5cbiAgICAgICAgb3JkZXJfaWQsXG4gICAgICAgICdPcmRlciBjYW5jZWxsZWQgLSBzdG9jayByZXN0b3JlZCdcbiAgICAgIF0pO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBvcmRlciBzdGF0dXNcbiAgICBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgVVBEQVRFIG9yZGVycyBcbiAgICAgIFNFVCBcbiAgICAgICAgb3JkZXJfc3RhdHVzID0gJ2NhbmNlbGxlZCcsXG4gICAgICAgIHBheW1lbnRfc3RhdHVzID0gJ2NhbmNlbGxlZCcsXG4gICAgICAgIHVwZGF0ZWRfYXQgPSBOT1coKVxuICAgICAgV0hFUkUgb3JkZXJfaWQgPSAkMVxuICAgIGAsIFtvcmRlcl9pZF0pO1xuXG4gICAgLy8gVXBkYXRlIENPRCBjb2xsZWN0aW9uIGlmIGV4aXN0c1xuICAgIGlmIChvcmRlci5wYXltZW50X21ldGhvZCA9PT0gJ2NvZCcpIHtcbiAgICAgIGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICAgIFVQREFURSBjb2RfY29sbGVjdGlvbnMgXG4gICAgICAgIFNFVCBjb2xsZWN0aW9uX3N0YXR1cyA9ICdjYW5jZWxsZWQnXG4gICAgICAgIFdIRVJFIG9yZGVyX2lkID0gJDFcbiAgICAgIGAsIFtvcmRlcl9pZF0pO1xuICAgIH1cblxuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnQ09NTUlUJyk7XG5cbiAgICByZXMuanNvbih7XG4gICAgICBtZXNzYWdlOiAnT3JkZXIgY2FuY2VsbGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICBtZXNzYWdlX2FyOiAn2KrZhSDYpdmE2LrYp9ihINin2YTYt9mE2Kgg2KjZhtis2KfYrScsXG4gICAgICBtZXNzYWdlX2ZyOiAnQ29tbWFuZGUgYW5udWzDqWUgYXZlYyBzdWNjw6hzJ1xuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdST0xMQkFDSycpO1xuICAgIGNvbnNvbGUuZXJyb3IoJ09yZGVyIGNhbmNlbGxhdGlvbiBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gY2FuY2VsIG9yZGVyJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KXZhNi62KfYoSDYp9mE2LfZhNioJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRcXCdhbm51bGF0aW9uIGRlIGNvbW1hbmRlJ1xuICAgIH0pO1xuICB9IGZpbmFsbHkge1xuICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gIH1cbn0pO1xuXG5leHBvcnQgZGVmYXVsdCByb3V0ZXI7Il19