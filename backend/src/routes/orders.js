const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Validation rules
const validateCreateOrder = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Order must contain at least one item'),
  body('items.*.product_id')
    .isUUID()
    .withMessage('Invalid product ID'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('items.*.variant_id')
    .optional()
    .isUUID()
    .withMessage('Invalid variant ID'),
  body('delivery_address.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude'),
  body('delivery_address.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude'),
  body('delivery_address.address')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be 5-200 characters'),
  body('payment_method')
    .isIn(['cod', 'card'])
    .withMessage('Payment method must be cod or card'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// Create new order
router.post('/', authenticateToken, validateCreateOrder, async (req, res) => {
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
      const availableStock = item.variant_id ? product.variant_stock : product.stock_quantity;
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
      const priceModifier = parseFloat(product.price_modifier || 0);
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
    const deliveryFee = parseFloat(process.env.DEFAULT_DELIVERY_FEE || 15.00);
    const freeDeliveryThreshold = parseFloat(process.env.FREE_DELIVERY_THRESHOLD || 200.00);
    const finalDeliveryFee = subtotal >= freeDeliveryThreshold ? 0 : deliveryFee;

    // Calculate total
    const total = subtotal + finalDeliveryFee;

    // Check COD limits
    if (payment_method === 'cod') {
      const maxCodAmount = parseFloat(process.env.MAX_COD_AMOUNT || 500.00);
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
      } else {
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

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order creation error:', error);
    res.status(500).json({
      error: 'Failed to create order',
      error_ar: 'فشل في إنشاء الطلب',
      error_fr: 'Échec de création de commande'
    });
  } finally {
    client.release();
  }
});

// Get user's orders
router.get('/my-orders', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
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

    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    res.json({
      orders: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      error_ar: 'فشل في جلب الطلبات',
      error_fr: 'Échec de récupération des commandes'
    });
  }
});

// Get order by ID
router.get('/:order_id', authenticateToken, async (req, res) => {
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

  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch order',
      error_ar: 'فشل في جلب الطلب',
      error_fr: 'Échec de récupération de commande'
    });
  }
});

// Cancel order (only if status is pending)
router.patch('/:order_id/cancel', authenticateToken, async (req, res) => {
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
      } else {
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

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order cancellation error:', error);
    res.status(500).json({
      error: 'Failed to cancel order',
      error_ar: 'فشل في إلغاء الطلب',
      error_fr: 'Échec d\'annulation de commande'
    });
  } finally {
    client.release();
  }
});

module.exports = router;