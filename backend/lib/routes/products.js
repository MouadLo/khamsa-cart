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
const router = express_1.default.Router();
// Get all products with filters
router.get('/', async (req, res) => {
    try {
        const { category, subcategory, search, page = '1', limit = '20', sort = 'name_ar', order = 'ASC', min_price, max_price, in_stock = 'true' } = req.query;
        const language = req.language || 'ar';
        const offset = (parseInt(page) - 1) * parseInt(limit);
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
        queryParams.push(parseInt(limit), offset);
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
        const pagination = {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total,
            pages: Math.ceil(total / parseInt(limit)),
            has_next: parseInt(page) * parseInt(limit) < total,
            has_prev: parseInt(page) > 1
        };
        res.json({
            products: result.rows,
            pagination,
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
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
    `, [limit]);
        res.json({
            featured_products: result.rows
        });
    }
    catch (error) {
        console.error('Featured products fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch featured products',
            error_ar: 'فشل في جلب المنتجات المميزة',
            error_fr: 'Échec de récupération des produits en vedette'
        });
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcm91dGVzL3Byb2R1Y3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsc0RBQXFEO0FBRXJELHVEQUF5QztBQUd6QyxNQUFNLE1BQU0sR0FBRyxpQkFBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBMkdoQyxnQ0FBZ0M7QUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQUUsRUFBRTtJQUNwRCxJQUFJLENBQUM7UUFDSCxNQUFNLEVBQ0osUUFBUSxFQUNSLFdBQVcsRUFDWCxNQUFNLEVBQ04sSUFBSSxHQUFHLEdBQUcsRUFDVixLQUFLLEdBQUcsSUFBSSxFQUNaLElBQUksR0FBRyxTQUFTLEVBQ2hCLEtBQUssR0FBRyxLQUFLLEVBQ2IsU0FBUyxFQUNULFNBQVMsRUFDVCxRQUFRLEdBQUcsTUFBTSxFQUNsQixHQUFHLEdBQUcsQ0FBQyxLQUF1QixDQUFDO1FBRWhDLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDO1FBQ3RDLE1BQU0sTUFBTSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUV0RCxzQkFBc0I7UUFDdEIsSUFBSSxlQUFlLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQzdDLElBQUksV0FBVyxHQUFVLEVBQUUsQ0FBQztRQUM1QixJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFFbkIsa0JBQWtCO1FBQ2xCLElBQUksUUFBUSxFQUFFLENBQUM7WUFDYixVQUFVLEVBQUUsQ0FBQztZQUNiLGVBQWUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDdkQsV0FB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LDZCQUE2QjtZQUN2QyxRQUFRLEVBQUUsK0NBQStDO1NBQzFELENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILGtCQUFlLE1BQU0sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyBib2R5LCBxdWVyeSwgdmFsaWRhdGlvblJlc3VsdCB9IGZyb20gJ2V4cHJlc3MtdmFsaWRhdG9yJztcbmltcG9ydCAqIGFzIGRiIGZyb20gJy4uL2NvbmZpZy9kYXRhYmFzZSc7XG5pbXBvcnQgeyBhdXRoZW50aWNhdGVUb2tlbiB9IGZyb20gJy4vYXV0aCc7XG5cbmNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG5cbi8vIFR5cGUgZGVmaW5pdGlvbnNcbmludGVyZmFjZSBQcm9kdWN0RmlsdGVycyB7XG4gIGNhdGVnb3J5Pzogc3RyaW5nO1xuICBzdWJjYXRlZ29yeT86IHN0cmluZztcbiAgc2VhcmNoPzogc3RyaW5nO1xuICBwYWdlPzogc3RyaW5nO1xuICBsaW1pdD86IHN0cmluZztcbiAgc29ydD86IHN0cmluZztcbiAgb3JkZXI/OiBzdHJpbmc7XG4gIG1pbl9wcmljZT86IHN0cmluZztcbiAgbWF4X3ByaWNlPzogc3RyaW5nO1xuICBpbl9zdG9jaz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFByb2R1Y3RJbWFnZSB7XG4gIGltYWdlX2lkOiBudW1iZXI7XG4gIHVybDogc3RyaW5nO1xuICBhbHRfdGV4dDogc3RyaW5nO1xuICBpc19wcmltYXJ5OiBib29sZWFuO1xuICBzb3J0X29yZGVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQcm9kdWN0VmFyaWFudCB7XG4gIHZhcmlhbnRfaWQ6IG51bWJlcjtcbiAgdmFyaWFudF90eXBlOiBzdHJpbmc7XG4gIHZhcmlhbnRfdmFsdWU6IHN0cmluZztcbiAgcHJpY2VfbW9kaWZpZXI6IG51bWJlcjtcbiAgc3RvY2tfcXVhbnRpdHk6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFByb2R1Y3Qge1xuICBwcm9kdWN0X2lkOiBudW1iZXI7XG4gIG5hbWVfYXI6IHN0cmluZztcbiAgbmFtZV9mcjogc3RyaW5nO1xuICBuYW1lX2VuOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2FyOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2ZyOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2VuOiBzdHJpbmc7XG4gIHByaWNlOiBudW1iZXI7XG4gIGNvbXBhcmVfcHJpY2U6IG51bWJlcjtcbiAgc3RvY2tfcXVhbnRpdHk6IG51bWJlcjtcbiAgbG93X3N0b2NrX3RocmVzaG9sZDogbnVtYmVyO1xuICByZXF1aXJlc19hZ2VfdmVyaWZpY2F0aW9uOiBib29sZWFuO1xuICBpc19mZWF0dXJlZDogYm9vbGVhbjtcbiAgdGFnczogc3RyaW5nO1xuICBjcmVhdGVkX2F0OiBzdHJpbmc7XG4gIHVwZGF0ZWRfYXQ/OiBzdHJpbmc7XG4gIGNhdGVnb3J5X25hbWU6IHN0cmluZztcbiAgc3ViY2F0ZWdvcnlfbmFtZTogc3RyaW5nO1xuICBpbWFnZXM6IFByb2R1Y3RJbWFnZVtdO1xuICB2YXJpYW50czogUHJvZHVjdFZhcmlhbnRbXTtcbiAgcmF0aW5nX2luZm8/OiB7XG4gICAgYXZnX3JhdGluZzogbnVtYmVyO1xuICAgIHJldmlld19jb3VudDogbnVtYmVyO1xuICB9O1xuICByZXZpZXdzPzogUmV2aWV3W107XG59XG5cbmludGVyZmFjZSBSZXZpZXcge1xuICByZXZpZXdfaWQ6IG51bWJlcjtcbiAgcmF0aW5nOiBudW1iZXI7XG4gIGNvbW1lbnQ6IHN0cmluZztcbiAgY3JlYXRlZF9hdDogc3RyaW5nO1xuICByZXZpZXdlcl9uYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDYXRlZ29yeSB7XG4gIGNhdGVnb3J5X2lkOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgaWNvbjogc3RyaW5nO1xuICBzb3J0X29yZGVyOiBudW1iZXI7XG4gIHN1YmNhdGVnb3JpZXM6IFN1YmNhdGVnb3J5W107XG4gIHByb2R1Y3RfY291bnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFN1YmNhdGVnb3J5IHtcbiAgc3ViY2F0ZWdvcnlfaWQ6IG51bWJlcjtcbiAgbmFtZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBzb3J0X29yZGVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQYWdpbmF0aW9uSW5mbyB7XG4gIHBhZ2U6IG51bWJlcjtcbiAgbGltaXQ6IG51bWJlcjtcbiAgdG90YWw6IG51bWJlcjtcbiAgcGFnZXM6IG51bWJlcjtcbiAgaGFzX25leHQ6IGJvb2xlYW47XG4gIGhhc19wcmV2OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgU2VhcmNoUmVzdWx0IHtcbiAgcHJvZHVjdF9pZDogbnVtYmVyO1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHByaWNlOiBudW1iZXI7XG4gIGNvbXBhcmVfcHJpY2U6IG51bWJlcjtcbiAgc3RvY2tfcXVhbnRpdHk6IG51bWJlcjtcbiAgcmVxdWlyZXNfYWdlX3ZlcmlmaWNhdGlvbjogYm9vbGVhbjtcbiAgY2F0ZWdvcnlfbmFtZTogc3RyaW5nO1xuICBwcmltYXJ5X2ltYWdlOiBzdHJpbmc7XG4gIHJlbGV2YW5jZTogbnVtYmVyO1xufVxuXG4vLyBHZXQgYWxsIHByb2R1Y3RzIHdpdGggZmlsdGVyc1xucm91dGVyLmdldCgnLycsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7XG4gICAgICBjYXRlZ29yeSxcbiAgICAgIHN1YmNhdGVnb3J5LFxuICAgICAgc2VhcmNoLFxuICAgICAgcGFnZSA9ICcxJyxcbiAgICAgIGxpbWl0ID0gJzIwJyxcbiAgICAgIHNvcnQgPSAnbmFtZV9hcicsXG4gICAgICBvcmRlciA9ICdBU0MnLFxuICAgICAgbWluX3ByaWNlLFxuICAgICAgbWF4X3ByaWNlLFxuICAgICAgaW5fc3RvY2sgPSAndHJ1ZSdcbiAgICB9ID0gcmVxLnF1ZXJ5IGFzIFByb2R1Y3RGaWx0ZXJzO1xuXG4gICAgY29uc3QgbGFuZ3VhZ2UgPSByZXEubGFuZ3VhZ2UgfHwgJ2FyJztcbiAgICBjb25zdCBvZmZzZXQgPSAocGFyc2VJbnQocGFnZSkgLSAxKSAqIHBhcnNlSW50KGxpbWl0KTtcblxuICAgIC8vIEJ1aWxkIGR5bmFtaWMgcXVlcnlcbiAgICBsZXQgd2hlcmVDb25kaXRpb25zID0gWydwLmlzX2FjdGl2ZSA9IHRydWUnXTtcbiAgICBsZXQgcXVlcnlQYXJhbXM6IGFueVtdID0gW107XG4gICAgbGV0IHBhcmFtQ291bnQgPSAwO1xuXG4gICAgLy8gQ2F0ZWdvcnkgZmlsdGVyXG4gICAgaWYgKGNhdGVnb3J5KSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgYy5uYW1lX2VuIElMSUtFICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKGAlJHtjYXRlZ29yeX0lYCk7XG4gICAgfVxuXG4gICAgLy8gU3ViY2F0ZWdvcnkgZmlsdGVyXG4gICAgaWYgKHN1YmNhdGVnb3J5KSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgcy5uYW1lX2VuIElMSUtFICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKGAlJHtzdWJjYXRlZ29yeX0lYCk7XG4gICAgfVxuXG4gICAgLy8gU2VhcmNoIGZpbHRlclxuICAgIGlmIChzZWFyY2gpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGAoXG4gICAgICAgIHAubmFtZV8ke2xhbmd1YWdlfSBJTElLRSAkJHtwYXJhbUNvdW50fSBPUiBcbiAgICAgICAgcC5kZXNjcmlwdGlvbl8ke2xhbmd1YWdlfSBJTElLRSAkJHtwYXJhbUNvdW50fSBPUlxuICAgICAgICBwLnRhZ3MgSUxJS0UgJCR7cGFyYW1Db3VudH1cbiAgICAgIClgKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goYCUke3NlYXJjaH0lYCk7XG4gICAgfVxuXG4gICAgLy8gUHJpY2UgcmFuZ2UgZmlsdGVyc1xuICAgIGlmIChtaW5fcHJpY2UpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBwLnByaWNlID49ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHBhcnNlRmxvYXQobWluX3ByaWNlKSk7XG4gICAgfVxuXG4gICAgaWYgKG1heF9wcmljZSkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYHAucHJpY2UgPD0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2gocGFyc2VGbG9hdChtYXhfcHJpY2UpKTtcbiAgICB9XG5cbiAgICAvLyBTdG9jayBmaWx0ZXJcbiAgICBpZiAoaW5fc3RvY2sgPT09ICd0cnVlJykge1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goJ3Auc3RvY2tfcXVhbnRpdHkgPiAwJyk7XG4gICAgfVxuXG4gICAgLy8gQWdlIHJlc3RyaWN0aW9uIGZpbHRlciAoaGlkZSB2YXBlIHByb2R1Y3RzIGZvciB1bmRlcmFnZSB1c2VycylcbiAgICAvLyBOb3RlOiBJbiByZWFsIGFwcCwgeW91J2QgY2hlY2sgdXNlcidzIHZlcmlmaWVkIGFnZVxuICAgIGNvbnN0IGluY2x1ZGVWYXBlID0gdHJ1ZTsgLy8gVE9ETzogSW1wbGVtZW50IGFnZSB2ZXJpZmljYXRpb25cbiAgICBpZiAoIWluY2x1ZGVWYXBlKSB7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaCgncC5yZXF1aXJlc19hZ2VfdmVyaWZpY2F0aW9uID0gZmFsc2UnKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9IHdoZXJlQ29uZGl0aW9ucy5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmVDb25kaXRpb25zLmpvaW4oJyBBTkQgJyl9YCA6ICcnO1xuXG4gICAgLy8gVmFsaWRhdGUgc29ydCBjb2x1bW5cbiAgICBjb25zdCBhbGxvd2VkU29ydENvbHVtbnMgPSBbJ25hbWVfYXInLCAnbmFtZV9mcicsICduYW1lX2VuJywgJ3ByaWNlJywgJ2NyZWF0ZWRfYXQnLCAnc3RvY2tfcXVhbnRpdHknXTtcbiAgICBjb25zdCBzb3J0Q29sdW1uID0gYWxsb3dlZFNvcnRDb2x1bW5zLmluY2x1ZGVzKHNvcnQpID8gc29ydCA6ICduYW1lX2FyJztcbiAgICBjb25zdCBzb3J0T3JkZXIgPSBvcmRlci50b1VwcGVyQ2FzZSgpID09PSAnREVTQycgPyAnREVTQycgOiAnQVNDJztcblxuICAgIC8vIE1haW4gcXVlcnlcbiAgICBjb25zdCBxdWVyeSA9IGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgcC5wcm9kdWN0X2lkLFxuICAgICAgICBwLm5hbWVfYXIsXG4gICAgICAgIHAubmFtZV9mcixcbiAgICAgICAgcC5uYW1lX2VuLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2FyLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2ZyLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2VuLFxuICAgICAgICBwLnByaWNlLFxuICAgICAgICBwLmNvbXBhcmVfcHJpY2UsXG4gICAgICAgIHAuc3RvY2tfcXVhbnRpdHksXG4gICAgICAgIHAubG93X3N0b2NrX3RocmVzaG9sZCxcbiAgICAgICAgcC5yZXF1aXJlc19hZ2VfdmVyaWZpY2F0aW9uLFxuICAgICAgICBwLmlzX2ZlYXR1cmVkLFxuICAgICAgICBwLnRhZ3MsXG4gICAgICAgIHAuY3JlYXRlZF9hdCxcbiAgICAgICAgYy5uYW1lXyR7bGFuZ3VhZ2V9IGFzIGNhdGVnb3J5X25hbWUsXG4gICAgICAgIHMubmFtZV8ke2xhbmd1YWdlfSBhcyBzdWJjYXRlZ29yeV9uYW1lLFxuICAgICAgICAoXG4gICAgICAgICAgU0VMRUNUIGpzb25fYWdnKFxuICAgICAgICAgICAganNvbl9idWlsZF9vYmplY3QoXG4gICAgICAgICAgICAgICdpbWFnZV9pZCcsIHBpLmltYWdlX2lkLFxuICAgICAgICAgICAgICAndXJsJywgcGkudXJsLFxuICAgICAgICAgICAgICAnYWx0X3RleHQnLCBwaS5hbHRfdGV4dF8ke2xhbmd1YWdlfSxcbiAgICAgICAgICAgICAgJ2lzX3ByaW1hcnknLCBwaS5pc19wcmltYXJ5LFxuICAgICAgICAgICAgICAnc29ydF9vcmRlcicsIHBpLnNvcnRfb3JkZXJcbiAgICAgICAgICAgICkgT1JERVIgQlkgcGkuc29ydF9vcmRlclxuICAgICAgICAgIClcbiAgICAgICAgICBGUk9NIHByb2R1Y3RfaW1hZ2VzIHBpIFxuICAgICAgICAgIFdIRVJFIHBpLnByb2R1Y3RfaWQgPSBwLnByb2R1Y3RfaWRcbiAgICAgICAgKSBhcyBpbWFnZXMsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QganNvbl9hZ2coXG4gICAgICAgICAgICBqc29uX2J1aWxkX29iamVjdChcbiAgICAgICAgICAgICAgJ3ZhcmlhbnRfaWQnLCBwdi52YXJpYW50X2lkLFxuICAgICAgICAgICAgICAndmFyaWFudF90eXBlJywgcHYudmFyaWFudF90eXBlLFxuICAgICAgICAgICAgICAndmFyaWFudF92YWx1ZScsIHB2LnZhcmlhbnRfdmFsdWUsXG4gICAgICAgICAgICAgICdwcmljZV9tb2RpZmllcicsIHB2LnByaWNlX21vZGlmaWVyLFxuICAgICAgICAgICAgICAnc3RvY2tfcXVhbnRpdHknLCBwdi5zdG9ja19xdWFudGl0eVxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICBGUk9NIHByb2R1Y3RfdmFyaWFudHMgcHYgXG4gICAgICAgICAgV0hFUkUgcHYucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZCBBTkQgcHYuaXNfYWN0aXZlID0gdHJ1ZVxuICAgICAgICApIGFzIHZhcmlhbnRzXG4gICAgICBGUk9NIHByb2R1Y3RzIHBcbiAgICAgIExFRlQgSk9JTiBjYXRlZ29yaWVzIGMgT04gcC5jYXRlZ29yeV9pZCA9IGMuY2F0ZWdvcnlfaWRcbiAgICAgIExFRlQgSk9JTiBzdWJjYXRlZ29yaWVzIHMgT04gcC5zdWJjYXRlZ29yeV9pZCA9IHMuc3ViY2F0ZWdvcnlfaWRcbiAgICAgICR7d2hlcmVDbGF1c2V9XG4gICAgICBPUkRFUiBCWSBwLiR7c29ydENvbHVtbn0gJHtzb3J0T3JkZXJ9XG4gICAgICBMSU1JVCAkJHtwYXJhbUNvdW50ICsgMX0gT0ZGU0VUICQke3BhcmFtQ291bnQgKyAyfVxuICAgIGA7XG5cbiAgICBxdWVyeVBhcmFtcy5wdXNoKHBhcnNlSW50KGxpbWl0KSwgb2Zmc2V0KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PFByb2R1Y3Q+KHF1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICAvLyBHZXQgdG90YWwgY291bnQgZm9yIHBhZ2luYXRpb25cbiAgICBjb25zdCBjb3VudFF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIENPVU5UKCopIGFzIHRvdGFsXG4gICAgICBGUk9NIHByb2R1Y3RzIHBcbiAgICAgIExFRlQgSk9JTiBjYXRlZ29yaWVzIGMgT04gcC5jYXRlZ29yeV9pZCA9IGMuY2F0ZWdvcnlfaWRcbiAgICAgIExFRlQgSk9JTiBzdWJjYXRlZ29yaWVzIHMgT04gcC5zdWJjYXRlZ29yeV9pZCA9IHMuc3ViY2F0ZWdvcnlfaWRcbiAgICAgICR7d2hlcmVDbGF1c2V9XG4gICAgYDtcblxuICAgIGNvbnN0IGNvdW50UmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8e3RvdGFsOiBzdHJpbmd9Pihjb3VudFF1ZXJ5LCBxdWVyeVBhcmFtcy5zbGljZSgwLCAtMikpO1xuICAgIGNvbnN0IHRvdGFsID0gcGFyc2VJbnQoY291bnRSZXN1bHQucm93c1swXS50b3RhbCk7XG5cbiAgICBjb25zdCBwYWdpbmF0aW9uOiBQYWdpbmF0aW9uSW5mbyA9IHtcbiAgICAgIHBhZ2U6IHBhcnNlSW50KHBhZ2UpLFxuICAgICAgbGltaXQ6IHBhcnNlSW50KGxpbWl0KSxcbiAgICAgIHRvdGFsOiB0b3RhbCxcbiAgICAgIHBhZ2VzOiBNYXRoLmNlaWwodG90YWwgLyBwYXJzZUludChsaW1pdCkpLFxuICAgICAgaGFzX25leHQ6IHBhcnNlSW50KHBhZ2UpICogcGFyc2VJbnQobGltaXQpIDwgdG90YWwsXG4gICAgICBoYXNfcHJldjogcGFyc2VJbnQocGFnZSkgPiAxXG4gICAgfTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIHByb2R1Y3RzOiByZXN1bHQucm93cyxcbiAgICAgIHBhZ2luYXRpb24sXG4gICAgICBmaWx0ZXJzOiB7XG4gICAgICAgIGNhdGVnb3J5LFxuICAgICAgICBzdWJjYXRlZ29yeSxcbiAgICAgICAgc2VhcmNoLFxuICAgICAgICBtaW5fcHJpY2UsXG4gICAgICAgIG1heF9wcmljZSxcbiAgICAgICAgaW5fc3RvY2ssXG4gICAgICAgIHNvcnQ6IHNvcnRDb2x1bW4sXG4gICAgICAgIG9yZGVyOiBzb3J0T3JkZXJcbiAgICAgIH1cbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1Byb2R1Y3RzIGZldGNoIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCBwcm9kdWN0cycsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDYp9mE2YXZhtiq2KzYp9iqJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBwcm9kdWl0cydcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIEdldCBzaW5nbGUgcHJvZHVjdCBieSBJRFxucm91dGVyLmdldCgnLzppZCcsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHByb2R1Y3RJZCA9IHJlcS5wYXJhbXMuaWQ7XG4gICAgY29uc3QgbGFuZ3VhZ2UgPSByZXEubGFuZ3VhZ2UgfHwgJ2FyJztcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PFByb2R1Y3Q+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgcC5wcm9kdWN0X2lkLFxuICAgICAgICBwLm5hbWVfYXIsXG4gICAgICAgIHAubmFtZV9mcixcbiAgICAgICAgcC5uYW1lX2VuLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2FyLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2ZyLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2VuLFxuICAgICAgICBwLnByaWNlLFxuICAgICAgICBwLmNvbXBhcmVfcHJpY2UsXG4gICAgICAgIHAuc3RvY2tfcXVhbnRpdHksXG4gICAgICAgIHAubG93X3N0b2NrX3RocmVzaG9sZCxcbiAgICAgICAgcC5yZXF1aXJlc19hZ2VfdmVyaWZpY2F0aW9uLFxuICAgICAgICBwLmlzX2ZlYXR1cmVkLFxuICAgICAgICBwLnRhZ3MsXG4gICAgICAgIHAuY3JlYXRlZF9hdCxcbiAgICAgICAgcC51cGRhdGVkX2F0LFxuICAgICAgICBjLmNhdGVnb3J5X2lkLFxuICAgICAgICBjLm5hbWVfJHtsYW5ndWFnZX0gYXMgY2F0ZWdvcnlfbmFtZSxcbiAgICAgICAgcy5zdWJjYXRlZ29yeV9pZCxcbiAgICAgICAgcy5uYW1lXyR7bGFuZ3VhZ2V9IGFzIHN1YmNhdGVnb3J5X25hbWUsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QganNvbl9hZ2coXG4gICAgICAgICAgICBqc29uX2J1aWxkX29iamVjdChcbiAgICAgICAgICAgICAgJ2ltYWdlX2lkJywgcGkuaW1hZ2VfaWQsXG4gICAgICAgICAgICAgICd1cmwnLCBwaS51cmwsXG4gICAgICAgICAgICAgICdhbHRfdGV4dCcsIHBpLmFsdF90ZXh0XyR7bGFuZ3VhZ2V9LFxuICAgICAgICAgICAgICAnaXNfcHJpbWFyeScsIHBpLmlzX3ByaW1hcnksXG4gICAgICAgICAgICAgICdzb3J0X29yZGVyJywgcGkuc29ydF9vcmRlclxuICAgICAgICAgICAgKSBPUkRFUiBCWSBwaS5zb3J0X29yZGVyXG4gICAgICAgICAgKVxuICAgICAgICAgIEZST00gcHJvZHVjdF9pbWFnZXMgcGkgXG4gICAgICAgICAgV0hFUkUgcGkucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZFxuICAgICAgICApIGFzIGltYWdlcyxcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBqc29uX2FnZyhcbiAgICAgICAgICAgIGpzb25fYnVpbGRfb2JqZWN0KFxuICAgICAgICAgICAgICAndmFyaWFudF9pZCcsIHB2LnZhcmlhbnRfaWQsXG4gICAgICAgICAgICAgICd2YXJpYW50X3R5cGUnLCBwdi52YXJpYW50X3R5cGUsXG4gICAgICAgICAgICAgICd2YXJpYW50X3ZhbHVlJywgcHYudmFyaWFudF92YWx1ZSxcbiAgICAgICAgICAgICAgJ3ByaWNlX21vZGlmaWVyJywgcHYucHJpY2VfbW9kaWZpZXIsXG4gICAgICAgICAgICAgICdzdG9ja19xdWFudGl0eScsIHB2LnN0b2NrX3F1YW50aXR5XG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICAgIEZST00gcHJvZHVjdF92YXJpYW50cyBwdiBcbiAgICAgICAgICBXSEVSRSBwdi5wcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkIEFORCBwdi5pc19hY3RpdmUgPSB0cnVlXG4gICAgICAgICkgYXMgdmFyaWFudHMsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgUk9VTkQoQVZHKHJhdGluZyksIDIpIGFzIGF2Z19yYXRpbmcsXG4gICAgICAgICAgICAgICAgIENPVU5UKCopIGFzIHJldmlld19jb3VudFxuICAgICAgICAgIEZST00gcmV2aWV3cyBcbiAgICAgICAgICBXSEVSRSBwcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkIEFORCBpc19hcHByb3ZlZCA9IHRydWVcbiAgICAgICAgKSBhcyByYXRpbmdfaW5mb1xuICAgICAgRlJPTSBwcm9kdWN0cyBwXG4gICAgICBMRUZUIEpPSU4gY2F0ZWdvcmllcyBjIE9OIHAuY2F0ZWdvcnlfaWQgPSBjLmNhdGVnb3J5X2lkXG4gICAgICBMRUZUIEpPSU4gc3ViY2F0ZWdvcmllcyBzIE9OIHAuc3ViY2F0ZWdvcnlfaWQgPSBzLnN1YmNhdGVnb3J5X2lkXG4gICAgICBXSEVSRSBwLnByb2R1Y3RfaWQgPSAkMSBBTkQgcC5pc19hY3RpdmUgPSB0cnVlXG4gICAgYCwgW3Byb2R1Y3RJZF0pO1xuXG4gICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdQcm9kdWN0IG5vdCBmb3VuZCcsXG4gICAgICAgIGVycm9yX2FyOiAn2KfZhNmF2YbYqtisINi62YrYsSDZhdmI2KzZiNivJyxcbiAgICAgICAgZXJyb3JfZnI6ICdQcm9kdWl0IG5vbiB0cm91dsOpJ1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvZHVjdCA9IHJlc3VsdC5yb3dzWzBdO1xuXG4gICAgLy8gR2V0IHJldmlld3MgZm9yIHRoaXMgcHJvZHVjdFxuICAgIGNvbnN0IHJldmlld3NSZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxSZXZpZXc+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgci5yZXZpZXdfaWQsXG4gICAgICAgIHIucmF0aW5nLFxuICAgICAgICByLmNvbW1lbnQsXG4gICAgICAgIHIuY3JlYXRlZF9hdCxcbiAgICAgICAgdS5uYW1lIGFzIHJldmlld2VyX25hbWVcbiAgICAgIEZST00gcmV2aWV3cyByXG4gICAgICBMRUZUIEpPSU4gdXNlcnMgdSBPTiByLnVzZXJfaWQgPSB1LnVzZXJfaWRcbiAgICAgIFdIRVJFIHIucHJvZHVjdF9pZCA9ICQxIEFORCByLmlzX2FwcHJvdmVkID0gdHJ1ZVxuICAgICAgT1JERVIgQlkgci5jcmVhdGVkX2F0IERFU0NcbiAgICAgIExJTUlUIDEwXG4gICAgYCwgW3Byb2R1Y3RJZF0pO1xuXG4gICAgcHJvZHVjdC5yZXZpZXdzID0gcmV2aWV3c1Jlc3VsdC5yb3dzO1xuXG4gICAgcmVzLmpzb24oeyBwcm9kdWN0IH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignUHJvZHVjdCBmZXRjaCBlcnJvcjonLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggcHJvZHVjdCcsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDYp9mE2YXZhtiq2KwnLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZHUgcHJvZHVpdCdcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIEdldCBjYXRlZ29yaWVzXG5yb3V0ZXIuZ2V0KCcvY2F0ZWdvcmllcy9saXN0JywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGxhbmd1YWdlID0gcmVxLmxhbmd1YWdlIHx8ICdhcic7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8Q2F0ZWdvcnk+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgYy5jYXRlZ29yeV9pZCxcbiAgICAgICAgYy5uYW1lXyR7bGFuZ3VhZ2V9IGFzIG5hbWUsXG4gICAgICAgIGMuZGVzY3JpcHRpb25fJHtsYW5ndWFnZX0gYXMgZGVzY3JpcHRpb24sXG4gICAgICAgIGMuaWNvbixcbiAgICAgICAgYy5zb3J0X29yZGVyLFxuICAgICAgICAoXG4gICAgICAgICAgU0VMRUNUIGpzb25fYWdnKFxuICAgICAgICAgICAganNvbl9idWlsZF9vYmplY3QoXG4gICAgICAgICAgICAgICdzdWJjYXRlZ29yeV9pZCcsIHMuc3ViY2F0ZWdvcnlfaWQsXG4gICAgICAgICAgICAgICduYW1lJywgcy5uYW1lXyR7bGFuZ3VhZ2V9LFxuICAgICAgICAgICAgICAnZGVzY3JpcHRpb24nLCBzLmRlc2NyaXB0aW9uXyR7bGFuZ3VhZ2V9LFxuICAgICAgICAgICAgICAnc29ydF9vcmRlcicsIHMuc29ydF9vcmRlclxuICAgICAgICAgICAgKSBPUkRFUiBCWSBzLnNvcnRfb3JkZXJcbiAgICAgICAgICApXG4gICAgICAgICAgRlJPTSBzdWJjYXRlZ29yaWVzIHMgXG4gICAgICAgICAgV0hFUkUgcy5jYXRlZ29yeV9pZCA9IGMuY2F0ZWdvcnlfaWQgQU5EIHMuaXNfYWN0aXZlID0gdHJ1ZVxuICAgICAgICApIGFzIHN1YmNhdGVnb3JpZXMsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgQ09VTlQoKikgXG4gICAgICAgICAgRlJPTSBwcm9kdWN0cyBwIFxuICAgICAgICAgIFdIRVJFIHAuY2F0ZWdvcnlfaWQgPSBjLmNhdGVnb3J5X2lkIEFORCBwLmlzX2FjdGl2ZSA9IHRydWVcbiAgICAgICAgKSBhcyBwcm9kdWN0X2NvdW50XG4gICAgICBGUk9NIGNhdGVnb3JpZXMgY1xuICAgICAgV0hFUkUgYy5pc19hY3RpdmUgPSB0cnVlXG4gICAgICBPUkRFUiBCWSBjLnNvcnRfb3JkZXIsIGMubmFtZV8ke2xhbmd1YWdlfVxuICAgIGApO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgY2F0ZWdvcmllczogcmVzdWx0LnJvd3NcbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0NhdGVnb3JpZXMgZmV0Y2ggZXJyb3I6JywgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoIGNhdGVnb3JpZXMnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2YHZiiDYrNmE2Kgg2KfZhNmB2KbYp9iqJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBjYXTDqWdvcmllcydcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIFNlYXJjaCBwcm9kdWN0cyAod2l0aCBBcmFiaWMgdGV4dCBzZWFyY2ggc3VwcG9ydClcbnJvdXRlci5nZXQoJy9zZWFyY2gvYWR2YW5jZWQnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHEsIGNhdGVnb3J5LCBwcmljZV9taW4sIHByaWNlX21heCwgc29ydCA9ICdyZWxldmFuY2UnIH0gPSByZXEucXVlcnkgYXMge1xuICAgICAgcT86IHN0cmluZztcbiAgICAgIGNhdGVnb3J5Pzogc3RyaW5nO1xuICAgICAgcHJpY2VfbWluPzogc3RyaW5nO1xuICAgICAgcHJpY2VfbWF4Pzogc3RyaW5nO1xuICAgICAgc29ydD86IHN0cmluZztcbiAgICB9O1xuICAgIGNvbnN0IGxhbmd1YWdlID0gcmVxLmxhbmd1YWdlIHx8ICdhcic7XG5cbiAgICBpZiAoIXEgfHwgcS50cmltKCkubGVuZ3RoIDwgMikge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdTZWFyY2ggcXVlcnkgbXVzdCBiZSBhdCBsZWFzdCAyIGNoYXJhY3RlcnMnLFxuICAgICAgICBlcnJvcl9hcjogJ9mK2KzYqCDYo9mGINmK2YPZiNmGINin2LPYqti52YTYp9mFINin2YTYqNit2Ksg2LnZhNmJINin2YTYo9mC2YQg2K3YsdmB2YrZhicsXG4gICAgICAgIGVycm9yX2ZyOiAnTGEgcmVxdcOqdGUgZGUgcmVjaGVyY2hlIGRvaXQgY29tcG9ydGVyIGF1IG1vaW5zIDIgY2FyYWN0w6hyZXMnXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBsZXQgc2VhcmNoUXVlcnkgPSBgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHAucHJvZHVjdF9pZCxcbiAgICAgICAgcC5uYW1lXyR7bGFuZ3VhZ2V9IGFzIG5hbWUsXG4gICAgICAgIHAuZGVzY3JpcHRpb25fJHtsYW5ndWFnZX0gYXMgZGVzY3JpcHRpb24sXG4gICAgICAgIHAucHJpY2UsXG4gICAgICAgIHAuY29tcGFyZV9wcmljZSxcbiAgICAgICAgcC5zdG9ja19xdWFudGl0eSxcbiAgICAgICAgcC5yZXF1aXJlc19hZ2VfdmVyaWZpY2F0aW9uLFxuICAgICAgICBjLm5hbWVfJHtsYW5ndWFnZX0gYXMgY2F0ZWdvcnlfbmFtZSxcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBwaS51cmwgXG4gICAgICAgICAgRlJPTSBwcm9kdWN0X2ltYWdlcyBwaSBcbiAgICAgICAgICBXSEVSRSBwaS5wcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkIEFORCBwaS5pc19wcmltYXJ5ID0gdHJ1ZVxuICAgICAgICAgIExJTUlUIDFcbiAgICAgICAgKSBhcyBwcmltYXJ5X2ltYWdlLFxuICAgICAgICB0c19yYW5rKHNlYXJjaF92ZWN0b3JfJHtsYW5ndWFnZX0sIHBsYWludG9fdHNxdWVyeSgnYXJhYmljJywgJDEpKSBhcyByZWxldmFuY2VcbiAgICAgIEZST00gcHJvZHVjdHMgcFxuICAgICAgTEVGVCBKT0lOIGNhdGVnb3JpZXMgYyBPTiBwLmNhdGVnb3J5X2lkID0gYy5jYXRlZ29yeV9pZFxuICAgICAgV0hFUkUgcC5pc19hY3RpdmUgPSB0cnVlIFxuICAgICAgICBBTkQgcC5zZWFyY2hfdmVjdG9yXyR7bGFuZ3VhZ2V9IEBAIHBsYWludG9fdHNxdWVyeSgnYXJhYmljJywgJDEpXG4gICAgYDtcblxuICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBhbnlbXSA9IFtxLnRyaW0oKV07XG4gICAgbGV0IHBhcmFtQ291bnQgPSAxO1xuXG4gICAgLy8gQWRkIGNhdGVnb3J5IGZpbHRlclxuICAgIGlmIChjYXRlZ29yeSkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgc2VhcmNoUXVlcnkgKz0gYCBBTkQgYy5uYW1lX2VuIElMSUtFICQke3BhcmFtQ291bnR9YDtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goYCUke2NhdGVnb3J5fSVgKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgcHJpY2UgZmlsdGVyc1xuICAgIGlmIChwcmljZV9taW4pIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHNlYXJjaFF1ZXJ5ICs9IGAgQU5EIHAucHJpY2UgPj0gJCR7cGFyYW1Db3VudH1gO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChwYXJzZUZsb2F0KHByaWNlX21pbikpO1xuICAgIH1cblxuICAgIGlmIChwcmljZV9tYXgpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHNlYXJjaFF1ZXJ5ICs9IGAgQU5EIHAucHJpY2UgPD0gJCR7cGFyYW1Db3VudH1gO1xuICAgICAgcXVlcnlQYXJhbXMucHVzaChwYXJzZUZsb2F0KHByaWNlX21heCkpO1xuICAgIH1cblxuICAgIC8vIEFkZCBzb3J0aW5nXG4gICAgc3dpdGNoIChzb3J0KSB7XG4gICAgICBjYXNlICdwcmljZV9sb3cnOlxuICAgICAgICBzZWFyY2hRdWVyeSArPSAnIE9SREVSIEJZIHAucHJpY2UgQVNDJztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwcmljZV9oaWdoJzpcbiAgICAgICAgc2VhcmNoUXVlcnkgKz0gJyBPUkRFUiBCWSBwLnByaWNlIERFU0MnO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ25ld2VzdCc6XG4gICAgICAgIHNlYXJjaFF1ZXJ5ICs9ICcgT1JERVIgQlkgcC5jcmVhdGVkX2F0IERFU0MnO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ25hbWUnOlxuICAgICAgICBzZWFyY2hRdWVyeSArPSBgIE9SREVSIEJZIHAubmFtZV8ke2xhbmd1YWdlfSBBU0NgO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6IC8vIHJlbGV2YW5jZVxuICAgICAgICBzZWFyY2hRdWVyeSArPSAnIE9SREVSIEJZIHJlbGV2YW5jZSBERVNDLCBwLm5hbWVfJyArIGxhbmd1YWdlICsgJyBBU0MnO1xuICAgIH1cblxuICAgIHNlYXJjaFF1ZXJ5ICs9ICcgTElNSVQgNTAnO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8U2VhcmNoUmVzdWx0PihzZWFyY2hRdWVyeSwgcXVlcnlQYXJhbXMpO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgcmVzdWx0czogcmVzdWx0LnJvd3MsXG4gICAgICBxdWVyeTogcSxcbiAgICAgIHRvdGFsOiByZXN1bHQucm93cy5sZW5ndGgsXG4gICAgICBmaWx0ZXJzOiB7XG4gICAgICAgIGNhdGVnb3J5LFxuICAgICAgICBwcmljZV9taW4sXG4gICAgICAgIHByaWNlX21heCxcbiAgICAgICAgc29ydFxuICAgICAgfVxuICAgIH0pO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignU2VhcmNoIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ1NlYXJjaCBmYWlsZWQnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2KfZhNio2K3YqycsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSBsYSByZWNoZXJjaGUnXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgZmVhdHVyZWQgcHJvZHVjdHNcbnJvdXRlci5nZXQoJy9mZWF0dXJlZC9saXN0JywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGxhbmd1YWdlID0gcmVxLmxhbmd1YWdlIHx8ICdhcic7XG4gICAgY29uc3QgbGltaXQgPSByZXEucXVlcnkubGltaXQgPyBwYXJzZUludChyZXEucXVlcnkubGltaXQgYXMgc3RyaW5nKSA6IDEwO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8U2VhcmNoUmVzdWx0PihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHAucHJvZHVjdF9pZCxcbiAgICAgICAgcC5uYW1lXyR7bGFuZ3VhZ2V9IGFzIG5hbWUsXG4gICAgICAgIHAuZGVzY3JpcHRpb25fJHtsYW5ndWFnZX0gYXMgZGVzY3JpcHRpb24sXG4gICAgICAgIHAucHJpY2UsXG4gICAgICAgIHAuY29tcGFyZV9wcmljZSxcbiAgICAgICAgcC5zdG9ja19xdWFudGl0eSxcbiAgICAgICAgYy5uYW1lXyR7bGFuZ3VhZ2V9IGFzIGNhdGVnb3J5X25hbWUsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgcGkudXJsIFxuICAgICAgICAgIEZST00gcHJvZHVjdF9pbWFnZXMgcGkgXG4gICAgICAgICAgV0hFUkUgcGkucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZCBBTkQgcGkuaXNfcHJpbWFyeSA9IHRydWVcbiAgICAgICAgICBMSU1JVCAxXG4gICAgICAgICkgYXMgcHJpbWFyeV9pbWFnZVxuICAgICAgRlJPTSBwcm9kdWN0cyBwXG4gICAgICBMRUZUIEpPSU4gY2F0ZWdvcmllcyBjIE9OIHAuY2F0ZWdvcnlfaWQgPSBjLmNhdGVnb3J5X2lkXG4gICAgICBXSEVSRSBwLmlzX2FjdGl2ZSA9IHRydWUgQU5EIHAuaXNfZmVhdHVyZWQgPSB0cnVlIEFORCBwLnN0b2NrX3F1YW50aXR5ID4gMFxuICAgICAgT1JERVIgQlkgcC5jcmVhdGVkX2F0IERFU0NcbiAgICAgIExJTUlUICQxXG4gICAgYCwgW2xpbWl0XSk7XG5cbiAgICByZXMuanNvbih7XG4gICAgICBmZWF0dXJlZF9wcm9kdWN0czogcmVzdWx0LnJvd3NcbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ZlYXR1cmVkIHByb2R1Y3RzIGZldGNoIGVycm9yOicsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCBmZWF0dXJlZCBwcm9kdWN0cycsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINis2YTYqCDYp9mE2YXZhtiq2KzYp9iqINin2YTZhdmF2YrYstipJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBwcm9kdWl0cyBlbiB2ZWRldHRlJ1xuICAgIH0pO1xuICB9XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyOyJdfQ==