const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Get all products with filters
router.get('/', async (req, res) => {
  try {
    const {
      category,
      subcategory,
      search,
      page = 1,
      limit = 20,
      sort = 'name_ar',
      order = 'ASC',
      min_price,
      max_price,
      in_stock = 'true'
    } = req.query;

    const language = req.language || 'ar';
    const offset = (page - 1) * limit;

    // Build dynamic query
    let whereConditions = ['p.is_active = true'];
    let queryParams = [];
    let paramCount = 0;

    // Category filter
    if (category) {
      paramCount++;
      whereConditions.push(`c.name_en ILIKE $${paramCount}`);
      queryParams.push(`%${category}%`);
    }

    // Subcategory filter
    if (subcategory) {
      paramCount++;
      whereConditions.push(`s.name_en ILIKE $${paramCount}`);
      queryParams.push(`%${subcategory}%`);
    }

    // Search filter
    if (search) {
      paramCount++;
      whereConditions.push(`(
        p.name_${language} ILIKE $${paramCount} OR 
        p.description_${language} ILIKE $${paramCount} OR
        p.tags ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    // Price range filters
    if (min_price) {
      paramCount++;
      whereConditions.push(`p.price >= $${paramCount}`);
      queryParams.push(parseFloat(min_price));
    }

    if (max_price) {
      paramCount++;
      whereConditions.push(`p.price <= $${paramCount}`);
      queryParams.push(parseFloat(max_price));
    }

    // Stock filter
    if (in_stock === 'true') {
      whereConditions.push('p.stock_quantity > 0');
    }

    // Age restriction filter (hide vape products for underage users)
    // Note: In real app, you'd check user's verified age
    const includeVape = true; // TODO: Implement age verification
    if (!includeVape) {
      whereConditions.push('p.requires_age_verification = false');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Validate sort column
    const allowedSortColumns = ['name_ar', 'name_fr', 'name_en', 'price', 'created_at', 'stock_quantity'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'name_ar';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Main query
    const query = `
      SELECT 
        p.product_id,
        p.name_ar,
        p.name_fr,
        p.name_en,
        p.description_ar,
        p.description_fr,
        p.description_en,
        p.price,
        p.compare_price,
        p.stock_quantity,
        p.low_stock_threshold,
        p.requires_age_verification,
        p.is_featured,
        p.tags,
        p.created_at,
        c.name_${language} as category_name,
        s.name_${language} as subcategory_name,
        (
          SELECT json_agg(
            json_build_object(
              'image_id', pi.image_id,
              'url', pi.url,
              'alt_text', pi.alt_text_${language},
              'is_primary', pi.is_primary,
              'sort_order', pi.sort_order
            ) ORDER BY pi.sort_order
          )
          FROM product_images pi 
          WHERE pi.product_id = p.product_id
        ) as images,
        (
          SELECT json_agg(
            json_build_object(
              'variant_id', pv.variant_id,
              'variant_type', pv.variant_type,
              'variant_value', pv.variant_value,
              'price_modifier', pv.price_modifier,
              'stock_quantity', pv.stock_quantity
            )
          )
          FROM product_variants pv 
          WHERE pv.product_id = p.product_id AND pv.is_active = true
        ) as variants
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN subcategories s ON p.subcategory_id = s.subcategory_id
      ${whereClause}
      ORDER BY p.${sortColumn} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, queryParams);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN subcategories s ON p.subcategory_id = s.subcategory_id
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    res.json({
      products: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / limit),
        has_next: parseInt(page) * parseInt(limit) < total,
        has_prev: parseInt(page) > 1
      },
      filters: {
        category,
        subcategory,
        search,
        min_price,
        max_price,
        in_stock,
        sort: sortColumn,
        order: sortOrder
      }
    });

  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      error_ar: 'فشل في جلب المنتجات',
      error_fr: 'Échec de récupération des produits'
    });
  }
});

// Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const language = req.language || 'ar';

    const result = await db.query(`
      SELECT 
        p.product_id,
        p.name_ar,
        p.name_fr,
        p.name_en,
        p.description_ar,
        p.description_fr,
        p.description_en,
        p.price,
        p.compare_price,
        p.stock_quantity,
        p.low_stock_threshold,
        p.requires_age_verification,
        p.is_featured,
        p.tags,
        p.created_at,
        p.updated_at,
        c.category_id,
        c.name_${language} as category_name,
        s.subcategory_id,
        s.name_${language} as subcategory_name,
        (
          SELECT json_agg(
            json_build_object(
              'image_id', pi.image_id,
              'url', pi.url,
              'alt_text', pi.alt_text_${language},
              'is_primary', pi.is_primary,
              'sort_order', pi.sort_order
            ) ORDER BY pi.sort_order
          )
          FROM product_images pi 
          WHERE pi.product_id = p.product_id
        ) as images,
        (
          SELECT json_agg(
            json_build_object(
              'variant_id', pv.variant_id,
              'variant_type', pv.variant_type,
              'variant_value', pv.variant_value,
              'price_modifier', pv.price_modifier,
              'stock_quantity', pv.stock_quantity
            )
          )
          FROM product_variants pv 
          WHERE pv.product_id = p.product_id AND pv.is_active = true
        ) as variants,
        (
          SELECT ROUND(AVG(rating), 2) as avg_rating,
                 COUNT(*) as review_count
          FROM reviews 
          WHERE product_id = p.product_id AND is_approved = true
        ) as rating_info
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN subcategories s ON p.subcategory_id = s.subcategory_id
      WHERE p.product_id = $1 AND p.is_active = true
    `, [productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Product not found',
        error_ar: 'المنتج غير موجود',
        error_fr: 'Produit non trouvé'
      });
    }

    const product = result.rows[0];

    // Get reviews for this product
    const reviewsResult = await db.query(`
      SELECT 
        r.review_id,
        r.rating,
        r.comment,
        r.created_at,
        u.name as reviewer_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.user_id
      WHERE r.product_id = $1 AND r.is_approved = true
      ORDER BY r.created_at DESC
      LIMIT 10
    `, [productId]);

    product.reviews = reviewsResult.rows;

    res.json({ product });

  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch product',
      error_ar: 'فشل في جلب المنتج',
      error_fr: 'Échec de récupération du produit'
    });
  }
});

// Get categories
router.get('/categories/list', async (req, res) => {
  try {
    const language = req.language || 'ar';
    
    const result = await db.query(`
      SELECT 
        c.category_id,
        c.name_${language} as name,
        c.description_${language} as description,
        c.icon,
        c.sort_order,
        (
          SELECT json_agg(
            json_build_object(
              'subcategory_id', s.subcategory_id,
              'name', s.name_${language},
              'description', s.description_${language},
              'sort_order', s.sort_order
            ) ORDER BY s.sort_order
          )
          FROM subcategories s 
          WHERE s.category_id = c.category_id AND s.is_active = true
        ) as subcategories,
        (
          SELECT COUNT(*) 
          FROM products p 
          WHERE p.category_id = c.category_id AND p.is_active = true
        ) as product_count
      FROM categories c
      WHERE c.is_active = true
      ORDER BY c.sort_order, c.name_${language}
    `);

    res.json({
      categories: result.rows
    });

  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch categories',
      error_ar: 'فشل في جلب الفئات',
      error_fr: 'Échec de récupération des catégories'
    });
  }
});

// Search products (with Arabic text search support)
router.get('/search/advanced', async (req, res) => {
  try {
    const { q, category, price_min, price_max, sort = 'relevance' } = req.query;
    const language = req.language || 'ar';

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters',
        error_ar: 'يجب أن يكون استعلام البحث على الأقل حرفين',
        error_fr: 'La requête de recherche doit comporter au moins 2 caractères'
      });
    }

    let searchQuery = `
      SELECT 
        p.product_id,
        p.name_${language} as name,
        p.description_${language} as description,
        p.price,
        p.compare_price,
        p.stock_quantity,
        p.requires_age_verification,
        c.name_${language} as category_name,
        (
          SELECT pi.url 
          FROM product_images pi 
          WHERE pi.product_id = p.product_id AND pi.is_primary = true
          LIMIT 1
        ) as primary_image,
        ts_rank(search_vector_${language}, plainto_tsquery('arabic', $1)) as relevance
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.is_active = true 
        AND p.search_vector_${language} @@ plainto_tsquery('arabic', $1)
    `;

    const queryParams = [q.trim()];
    let paramCount = 1;

    // Add category filter
    if (category) {
      paramCount++;
      searchQuery += ` AND c.name_en ILIKE $${paramCount}`;
      queryParams.push(`%${category}%`);
    }

    // Add price filters
    if (price_min) {
      paramCount++;
      searchQuery += ` AND p.price >= $${paramCount}`;
      queryParams.push(parseFloat(price_min));
    }

    if (price_max) {
      paramCount++;
      searchQuery += ` AND p.price <= $${paramCount}`;
      queryParams.push(parseFloat(price_max));
    }

    // Add sorting
    switch (sort) {
      case 'price_low':
        searchQuery += ' ORDER BY p.price ASC';
        break;
      case 'price_high':
        searchQuery += ' ORDER BY p.price DESC';
        break;
      case 'newest':
        searchQuery += ' ORDER BY p.created_at DESC';
        break;
      case 'name':
        searchQuery += ` ORDER BY p.name_${language} ASC`;
        break;
      default: // relevance
        searchQuery += ' ORDER BY relevance DESC, p.name_' + language + ' ASC';
    }

    searchQuery += ' LIMIT 50';

    const result = await db.query(searchQuery, queryParams);

    res.json({
      results: result.rows,
      query: q,
      total: result.rows.length,
      filters: {
        category,
        price_min,
        price_max,
        sort
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      error_ar: 'فشل البحث',
      error_fr: 'Échec de la recherche'
    });
  }
});

// Get featured products
router.get('/featured/list', async (req, res) => {
  try {
    const language = req.language || 'ar';
    const limit = req.query.limit || 10;

    const result = await db.query(`
      SELECT 
        p.product_id,
        p.name_${language} as name,
        p.description_${language} as description,
        p.price,
        p.compare_price,
        p.stock_quantity,
        c.name_${language} as category_name,
        (
          SELECT pi.url 
          FROM product_images pi 
          WHERE pi.product_id = p.product_id AND pi.is_primary = true
          LIMIT 1
        ) as primary_image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.is_active = true AND p.is_featured = true AND p.stock_quantity > 0
      ORDER BY p.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    res.json({
      featured_products: result.rows
    });

  } catch (error) {
    console.error('Featured products fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch featured products',
      error_ar: 'فشل في جلب المنتجات المميزة',
      error_fr: 'Échec de récupération des produits en vedette'
    });
  }
});

module.exports = router;