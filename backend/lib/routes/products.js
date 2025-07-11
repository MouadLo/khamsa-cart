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
const router = express_1.default.Router();
// Get all products with filters
router.get("/", async (req, res) => {
    try {
        const { category, subcategory, search, page = "1", limit = "20", sort = "name_ar", order = "ASC", min_price, max_price, in_stock = "true", } = req.query;
        const language = req.language || "ar";
        const offset = (parseInt(page) - 1) * parseInt(limit);
        // Build dynamic query
        let whereConditions = ["p.is_active = true"];
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
        p.brand ILIKE $${paramCount}
      )`);
            queryParams.push(`%${search}%`);
        }
        // Price range filters
        if (min_price) {
            paramCount++;
            whereConditions.push(`p.base_price >= $${paramCount}`);
            queryParams.push(parseFloat(min_price));
        }
        if (max_price) {
            paramCount++;
            whereConditions.push(`p.base_price <= $${paramCount}`);
            queryParams.push(parseFloat(max_price));
        }
        // Active products filter
        whereConditions.push("p.is_active = true");
        // Age restriction filter (hide vape products for underage users)
        // Note: In real app, you'd check user's verified age
        const includeVape = true; // TODO: Implement age verification
        if (!includeVape) {
            whereConditions.push("p.age_restricted = false");
        }
        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";
        // Validate sort column
        const allowedSortColumns = [
            "name_ar",
            "name_fr",
            "name_en",
            "base_price",
            "created_at",
        ];
        const sortColumn = allowedSortColumns.includes(sort) ? sort : "name_ar";
        const sortOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC";
        // Main query
        const query = `
      SELECT 
        p.id,
        p.name_ar,
        p.name_fr,
        p.name_en,
        p.description_ar,
        p.description_fr,
        p.description_en,
        p.base_price,
        p.sku,
        p.brand,
        p.is_vape_product,
        p.age_restricted,
        p.is_featured,
        p.image_urls,
        p.created_at,
        c.name_${language} as category_name,
        (
          SELECT json_agg(
            json_build_object(
              'id', pv.id,
              'variant_name_ar', pv.variant_name_ar,
              'variant_name_fr', pv.variant_name_fr,
              'variant_name_en', pv.variant_name_en,
              'sku', pv.sku,
              'price', pv.price,
              'attributes', pv.attributes,
              'is_default', pv.is_default,
              'stock_quantity', COALESCE(i.available_quantity, 0)
            )
          )
          FROM product_variants pv 
          LEFT JOIN inventory i ON pv.id = i.product_variant_id
          WHERE pv.product_id = p.id AND pv.is_active = true
        ) as variants
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
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
      LEFT JOIN categories c ON p.category_id = c.id
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
            has_prev: parseInt(page) > 1,
        };
        res.json({
            data: result.rows,
            pagination,
            filters: {
                category,
                subcategory,
                search,
                min_price,
                max_price,
                in_stock,
                sort: sortColumn,
                order: sortOrder,
            },
            success: true,
            message: "Products fetched successfully"
        });
    }
    catch (error) {
        console.error("Products fetch error:", error);
        res.status(500).json({
            error: "Failed to fetch products",
            error_ar: "فشل في جلب المنتجات",
            error_fr: "Échec de récupération des produits",
        });
    }
});
// Get single product by ID
router.get("/:id", async (req, res) => {
    try {
        const productId = req.params.id;
        const language = req.language || "ar";
        const result = await db.query(`
      SELECT 
        p.id,
        p.name_ar,
        p.name_fr,
        p.name_en,
        p.description_ar,
        p.description_fr,
        p.description_en,
        p.base_price,
        p.sku,
        p.brand,
        p.is_vape_product,
        p.age_restricted,
        p.is_featured,
        p.image_urls,
        p.created_at,
        c.name_${language} as category_name,
        (
          SELECT json_agg(
            json_build_object(
              'id', pv.id,
              'variant_name_ar', pv.variant_name_ar,
              'variant_name_fr', pv.variant_name_fr,
              'variant_name_en', pv.variant_name_en,
              'sku', pv.sku,
              'price', pv.price,
              'attributes', pv.attributes,
              'is_default', pv.is_default,
              'stock_quantity', COALESCE(i.available_quantity, 0)
            )
          )
          FROM product_variants pv 
          LEFT JOIN inventory i ON pv.id = i.product_variant_id
          WHERE pv.product_id = p.id AND pv.is_active = true
        ) as variants
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1 AND p.is_active = true
    `, [productId]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Product not found",
                error_ar: "المنتج غير موجود",
                error_fr: "Produit non trouvé",
            });
        }
        const product = result.rows[0];
        res.json({
            data: product,
            success: true,
            message: "Product fetched successfully"
        });
    }
    catch (error) {
        console.error("Product fetch error:", error);
        res.status(500).json({
            error: "Failed to fetch product",
            error_ar: "فشل في جلب المنتج",
            error_fr: "Échec de récupération du produit",
        });
    }
});
// Search products (with Arabic text search support)
router.get("/search/advanced", async (req, res) => {
    try {
        const { q, category, price_min, price_max, sort = "relevance", } = req.query;
        const language = req.language || "ar";
        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                error: "Search query must be at least 2 characters",
                error_ar: "يجب أن يكون استعلام البحث على الأقل حرفين",
                error_fr: "La requête de recherche doit comporter au moins 2 caractères",
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
            case "price_low":
                searchQuery += " ORDER BY p.price ASC";
                break;
            case "price_high":
                searchQuery += " ORDER BY p.price DESC";
                break;
            case "newest":
                searchQuery += " ORDER BY p.created_at DESC";
                break;
            case "name":
                searchQuery += ` ORDER BY p.name_${language} ASC`;
                break;
            default: // relevance
                searchQuery +=
                    " ORDER BY relevance DESC, p.name_" + language + " ASC";
        }
        searchQuery += " LIMIT 50";
        const result = await db.query(searchQuery, queryParams);
        res.json({
            results: result.rows,
            query: q,
            total: result.rows.length,
            filters: {
                category,
                price_min,
                price_max,
                sort,
            },
        });
    }
    catch (error) {
        console.error("Search error:", error);
        res.status(500).json({
            error: "Search failed",
            error_ar: "فشل البحث",
            error_fr: "Échec de la recherche",
        });
    }
});
// Get featured products
router.get("/featured/list", async (req, res) => {
    try {
        const language = req.language || "ar";
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
            featured_products: result.rows,
        });
    }
    catch (error) {
        console.error("Featured products fetch error:", error);
        res.status(500).json({
            error: "Failed to fetch featured products",
            error_ar: "فشل في جلب المنتجات المميزة",
            error_fr: "Échec de récupération des produits en vedette",
        });
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvcm91dGVzL3Byb2R1Y3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxzREFBcUQ7QUFFckQsdURBQXlDO0FBR3pDLE1BQU0sTUFBTSxHQUFHLGlCQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7QUFnSGhDLGdDQUFnQztBQUNoQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBRSxFQUFFO0lBQ3BELElBQUksQ0FBQztRQUNILE1BQU0sRUFDSixRQUFRLEVBQ1IsV0FBVyxFQUNYLE1BQU0sRUFDTixJQUFJLEdBQUcsR0FBRyxFQUNWLEtBQUssR0FBRyxJQUFJLEVBQ1osSUFBSSxHQUFHLFNBQVMsRUFDaEIsS0FBSyxHQUFHLEtBQUssRUFDYixTQUFTLEVBQ1QsU0FBUyxFQUNULFFBQVEsR0FBRyxNQUFNLEdBQ2xCLEdBQUcsR0FBRyxDQUFDLEtBQXVCLENBQUM7UUFFaEMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUM7UUFDdEMsTUFBTSxNQUFNLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXRELHNCQUFzQjtRQUN0QixJQUFJLGVBQWUsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDN0MsSUFBSSxXQUFXLEdBQVUsRUFBRSxDQUFDO1FBQzVCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUVuQixrQkFBa0I7UUFDbEIsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNiLFVBQVUsRUFBRSxDQUFDO1lBQ2IsZUFBZSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUN2RCxXQUFXLENBQUMsSUFB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LENBQUMsQ0FBQztRQUN2RCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUsbUNBQW1DO1lBQzFDLFFBQVEsRUFBRSw2QkFBNkI7WUFDdkMsUUFBUSxFQUFFLCtDQUErQztTQUMxRCxDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZXhwcmVzcywgeyBSZXF1ZXN0LCBSZXNwb25zZSB9IGZyb20gXCJleHByZXNzXCI7XG5pbXBvcnQgeyBib2R5LCBxdWVyeSwgdmFsaWRhdGlvblJlc3VsdCB9IGZyb20gXCJleHByZXNzLXZhbGlkYXRvclwiO1xuaW1wb3J0ICogYXMgZGIgZnJvbSBcIi4uL2NvbmZpZy9kYXRhYmFzZVwiO1xuaW1wb3J0IHsgYXV0aGVudGljYXRlVG9rZW4gfSBmcm9tIFwiLi9hdXRoXCI7XG5cbmNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG5cbi8vIFR5cGUgZGVmaW5pdGlvbnNcbmludGVyZmFjZSBQcm9kdWN0RmlsdGVycyB7XG4gIGNhdGVnb3J5Pzogc3RyaW5nO1xuICBzdWJjYXRlZ29yeT86IHN0cmluZztcbiAgc2VhcmNoPzogc3RyaW5nO1xuICBwYWdlPzogc3RyaW5nO1xuICBsaW1pdD86IHN0cmluZztcbiAgc29ydD86IHN0cmluZztcbiAgb3JkZXI/OiBzdHJpbmc7XG4gIG1pbl9wcmljZT86IHN0cmluZztcbiAgbWF4X3ByaWNlPzogc3RyaW5nO1xuICBpbl9zdG9jaz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFByb2R1Y3RJbWFnZSB7XG4gIGltYWdlX2lkOiBudW1iZXI7XG4gIHVybDogc3RyaW5nO1xuICBhbHRfdGV4dDogc3RyaW5nO1xuICBpc19wcmltYXJ5OiBib29sZWFuO1xuICBzb3J0X29yZGVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQcm9kdWN0VmFyaWFudCB7XG4gIGlkOiBzdHJpbmc7XG4gIHZhcmlhbnRfbmFtZV9hcjogc3RyaW5nO1xuICB2YXJpYW50X25hbWVfZnI6IHN0cmluZztcbiAgdmFyaWFudF9uYW1lX2VuOiBzdHJpbmc7XG4gIHNrdTogc3RyaW5nO1xuICBwcmljZTogbnVtYmVyO1xuICBhdHRyaWJ1dGVzOiBhbnk7XG4gIGlzX2RlZmF1bHQ6IGJvb2xlYW47XG4gIHN0b2NrX3F1YW50aXR5OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQcm9kdWN0IHtcbiAgaWQ6IHN0cmluZztcbiAgbmFtZV9hcjogc3RyaW5nO1xuICBuYW1lX2ZyOiBzdHJpbmc7XG4gIG5hbWVfZW46IHN0cmluZztcbiAgZGVzY3JpcHRpb25fYXI6IHN0cmluZztcbiAgZGVzY3JpcHRpb25fZnI6IHN0cmluZztcbiAgZGVzY3JpcHRpb25fZW46IHN0cmluZztcbiAgYmFzZV9wcmljZTogbnVtYmVyO1xuICBza3U6IHN0cmluZztcbiAgYnJhbmQ6IHN0cmluZztcbiAgaXNfdmFwZV9wcm9kdWN0OiBib29sZWFuO1xuICBhZ2VfcmVzdHJpY3RlZDogYm9vbGVhbjtcbiAgaXNfZmVhdHVyZWQ6IGJvb2xlYW47XG4gIGNyZWF0ZWRfYXQ6IHN0cmluZztcbiAgdXBkYXRlZF9hdD86IHN0cmluZztcbiAgY2F0ZWdvcnlfbmFtZTogc3RyaW5nO1xuICBpbWFnZV91cmxzOiBzdHJpbmdbXTtcbiAgdmFyaWFudHM6IFByb2R1Y3RWYXJpYW50W107XG59XG5cbmludGVyZmFjZSBSZXZpZXcge1xuICByZXZpZXdfaWQ6IG51bWJlcjtcbiAgcmF0aW5nOiBudW1iZXI7XG4gIGNvbW1lbnQ6IHN0cmluZztcbiAgY3JlYXRlZF9hdDogc3RyaW5nO1xuICByZXZpZXdlcl9uYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDYXRlZ29yeSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWVfYXI6IHN0cmluZztcbiAgbmFtZV9mcjogc3RyaW5nO1xuICBuYW1lX2VuOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2FyOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2ZyOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2VuOiBzdHJpbmc7XG4gIHBhcmVudF9pZDogc3RyaW5nO1xuICBzb3J0X29yZGVyOiBudW1iZXI7XG4gIGlzX3ZhcGVfY2F0ZWdvcnk6IGJvb2xlYW47XG4gIGFnZV9yZXN0cmljdGVkOiBib29sZWFuO1xuICBpbWFnZV91cmw6IHN0cmluZztcbiAgaWNvbl91cmw6IHN0cmluZztcbiAgaXNfYWN0aXZlOiBib29sZWFuO1xuICBpc19mZWF0dXJlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFN1YmNhdGVnb3J5IHtcbiAgc3ViY2F0ZWdvcnlfaWQ6IG51bWJlcjtcbiAgbmFtZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBzb3J0X29yZGVyOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBQYWdpbmF0aW9uSW5mbyB7XG4gIHBhZ2U6IG51bWJlcjtcbiAgbGltaXQ6IG51bWJlcjtcbiAgdG90YWw6IG51bWJlcjtcbiAgcGFnZXM6IG51bWJlcjtcbiAgaGFzX25leHQ6IGJvb2xlYW47XG4gIGhhc19wcmV2OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgU2VhcmNoUmVzdWx0IHtcbiAgcHJvZHVjdF9pZDogbnVtYmVyO1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHByaWNlOiBudW1iZXI7XG4gIGNvbXBhcmVfcHJpY2U6IG51bWJlcjtcbiAgc3RvY2tfcXVhbnRpdHk6IG51bWJlcjtcbiAgcmVxdWlyZXNfYWdlX3ZlcmlmaWNhdGlvbjogYm9vbGVhbjtcbiAgY2F0ZWdvcnlfbmFtZTogc3RyaW5nO1xuICBwcmltYXJ5X2ltYWdlOiBzdHJpbmc7XG4gIHJlbGV2YW5jZTogbnVtYmVyO1xufVxuXG4vLyBHZXQgYWxsIHByb2R1Y3RzIHdpdGggZmlsdGVyc1xucm91dGVyLmdldChcIi9cIiwgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHtcbiAgICAgIGNhdGVnb3J5LFxuICAgICAgc3ViY2F0ZWdvcnksXG4gICAgICBzZWFyY2gsXG4gICAgICBwYWdlID0gXCIxXCIsXG4gICAgICBsaW1pdCA9IFwiMjBcIixcbiAgICAgIHNvcnQgPSBcIm5hbWVfYXJcIixcbiAgICAgIG9yZGVyID0gXCJBU0NcIixcbiAgICAgIG1pbl9wcmljZSxcbiAgICAgIG1heF9wcmljZSxcbiAgICAgIGluX3N0b2NrID0gXCJ0cnVlXCIsXG4gICAgfSA9IHJlcS5xdWVyeSBhcyBQcm9kdWN0RmlsdGVycztcblxuICAgIGNvbnN0IGxhbmd1YWdlID0gcmVxLmxhbmd1YWdlIHx8IFwiYXJcIjtcbiAgICBjb25zdCBvZmZzZXQgPSAocGFyc2VJbnQocGFnZSkgLSAxKSAqIHBhcnNlSW50KGxpbWl0KTtcblxuICAgIC8vIEJ1aWxkIGR5bmFtaWMgcXVlcnlcbiAgICBsZXQgd2hlcmVDb25kaXRpb25zID0gW1wicC5pc19hY3RpdmUgPSB0cnVlXCJdO1xuICAgIGxldCBxdWVyeVBhcmFtczogYW55W10gPSBbXTtcbiAgICBsZXQgcGFyYW1Db3VudCA9IDA7XG5cbiAgICAvLyBDYXRlZ29yeSBmaWx0ZXJcbiAgICBpZiAoY2F0ZWdvcnkpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBjLm5hbWVfZW4gSUxJS0UgJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goYCUke2NhdGVnb3J5fSVgKTtcbiAgICB9XG5cbiAgICAvLyBTdWJjYXRlZ29yeSBmaWx0ZXJcbiAgICBpZiAoc3ViY2F0ZWdvcnkpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBzLm5hbWVfZW4gSUxJS0UgJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goYCUke3N1YmNhdGVnb3J5fSVgKTtcbiAgICB9XG5cbiAgICAvLyBTZWFyY2ggZmlsdGVyXG4gICAgaWYgKHNlYXJjaCkge1xuICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgd2hlcmVDb25kaXRpb25zLnB1c2goYChcbiAgICAgICAgcC5uYW1lXyR7bGFuZ3VhZ2V9IElMSUtFICQke3BhcmFtQ291bnR9IE9SIFxuICAgICAgICBwLmRlc2NyaXB0aW9uXyR7bGFuZ3VhZ2V9IElMSUtFICQke3BhcmFtQ291bnR9IE9SXG4gICAgICAgIHAuYnJhbmQgSUxJS0UgJCR7cGFyYW1Db3VudH1cbiAgICAgIClgKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goYCUke3NlYXJjaH0lYCk7XG4gICAgfVxuXG4gICAgLy8gUHJpY2UgcmFuZ2UgZmlsdGVyc1xuICAgIGlmIChtaW5fcHJpY2UpIHtcbiAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKGBwLmJhc2VfcHJpY2UgPj0gJCR7cGFyYW1Db3VudH1gKTtcbiAgICAgIHF1ZXJ5UGFyYW1zLnB1c2gocGFyc2VGbG9hdChtaW5fcHJpY2UpKTtcbiAgICB9XG5cbiAgICBpZiAobWF4X3ByaWNlKSB7XG4gICAgICBwYXJhbUNvdW50Kys7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChgcC5iYXNlX3ByaWNlIDw9ICQke3BhcmFtQ291bnR9YCk7XG4gICAgICBxdWVyeVBhcmFtcy5wdXNoKHBhcnNlRmxvYXQobWF4X3ByaWNlKSk7XG4gICAgfVxuXG4gICAgLy8gQWN0aXZlIHByb2R1Y3RzIGZpbHRlclxuICAgIHdoZXJlQ29uZGl0aW9ucy5wdXNoKFwicC5pc19hY3RpdmUgPSB0cnVlXCIpO1xuXG4gICAgLy8gQWdlIHJlc3RyaWN0aW9uIGZpbHRlciAoaGlkZSB2YXBlIHByb2R1Y3RzIGZvciB1bmRlcmFnZSB1c2VycylcbiAgICAvLyBOb3RlOiBJbiByZWFsIGFwcCwgeW91J2QgY2hlY2sgdXNlcidzIHZlcmlmaWVkIGFnZVxuICAgIGNvbnN0IGluY2x1ZGVWYXBlID0gdHJ1ZTsgLy8gVE9ETzogSW1wbGVtZW50IGFnZSB2ZXJpZmljYXRpb25cbiAgICBpZiAoIWluY2x1ZGVWYXBlKSB7XG4gICAgICB3aGVyZUNvbmRpdGlvbnMucHVzaChcInAuYWdlX3Jlc3RyaWN0ZWQgPSBmYWxzZVwiKTtcbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZUNsYXVzZSA9XG4gICAgICB3aGVyZUNvbmRpdGlvbnMubGVuZ3RoID4gMFxuICAgICAgICA/IGBXSEVSRSAke3doZXJlQ29uZGl0aW9ucy5qb2luKFwiIEFORCBcIil9YFxuICAgICAgICA6IFwiXCI7XG5cbiAgICAvLyBWYWxpZGF0ZSBzb3J0IGNvbHVtblxuICAgIGNvbnN0IGFsbG93ZWRTb3J0Q29sdW1ucyA9IFtcbiAgICAgIFwibmFtZV9hclwiLFxuICAgICAgXCJuYW1lX2ZyXCIsXG4gICAgICBcIm5hbWVfZW5cIixcbiAgICAgIFwiYmFzZV9wcmljZVwiLFxuICAgICAgXCJjcmVhdGVkX2F0XCIsXG4gICAgXTtcbiAgICBjb25zdCBzb3J0Q29sdW1uID0gYWxsb3dlZFNvcnRDb2x1bW5zLmluY2x1ZGVzKHNvcnQpID8gc29ydCA6IFwibmFtZV9hclwiO1xuICAgIGNvbnN0IHNvcnRPcmRlciA9IG9yZGVyLnRvVXBwZXJDYXNlKCkgPT09IFwiREVTQ1wiID8gXCJERVNDXCIgOiBcIkFTQ1wiO1xuXG4gICAgLy8gTWFpbiBxdWVyeVxuICAgIGNvbnN0IHF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBwLmlkLFxuICAgICAgICBwLm5hbWVfYXIsXG4gICAgICAgIHAubmFtZV9mcixcbiAgICAgICAgcC5uYW1lX2VuLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2FyLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2ZyLFxuICAgICAgICBwLmRlc2NyaXB0aW9uX2VuLFxuICAgICAgICBwLmJhc2VfcHJpY2UsXG4gICAgICAgIHAuc2t1LFxuICAgICAgICBwLmJyYW5kLFxuICAgICAgICBwLmlzX3ZhcGVfcHJvZHVjdCxcbiAgICAgICAgcC5hZ2VfcmVzdHJpY3RlZCxcbiAgICAgICAgcC5pc19mZWF0dXJlZCxcbiAgICAgICAgcC5pbWFnZV91cmxzLFxuICAgICAgICBwLmNyZWF0ZWRfYXQsXG4gICAgICAgIGMubmFtZV8ke2xhbmd1YWdlfSBhcyBjYXRlZ29yeV9uYW1lLFxuICAgICAgICAoXG4gICAgICAgICAgU0VMRUNUIGpzb25fYWdnKFxuICAgICAgICAgICAganNvbl9idWlsZF9vYmplY3QoXG4gICAgICAgICAgICAgICdpZCcsIHB2LmlkLFxuICAgICAgICAgICAgICAndmFyaWFudF9uYW1lX2FyJywgcHYudmFyaWFudF9uYW1lX2FyLFxuICAgICAgICAgICAgICAndmFyaWFudF9uYW1lX2ZyJywgcHYudmFyaWFudF9uYW1lX2ZyLFxuICAgICAgICAgICAgICAndmFyaWFudF9uYW1lX2VuJywgcHYudmFyaWFudF9uYW1lX2VuLFxuICAgICAgICAgICAgICAnc2t1JywgcHYuc2t1LFxuICAgICAgICAgICAgICAncHJpY2UnLCBwdi5wcmljZSxcbiAgICAgICAgICAgICAgJ2F0dHJpYnV0ZXMnLCBwdi5hdHRyaWJ1dGVzLFxuICAgICAgICAgICAgICAnaXNfZGVmYXVsdCcsIHB2LmlzX2RlZmF1bHQsXG4gICAgICAgICAgICAgICdzdG9ja19xdWFudGl0eScsIENPQUxFU0NFKGkuYXZhaWxhYmxlX3F1YW50aXR5LCAwKVxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICBGUk9NIHByb2R1Y3RfdmFyaWFudHMgcHYgXG4gICAgICAgICAgTEVGVCBKT0lOIGludmVudG9yeSBpIE9OIHB2LmlkID0gaS5wcm9kdWN0X3ZhcmlhbnRfaWRcbiAgICAgICAgICBXSEVSRSBwdi5wcm9kdWN0X2lkID0gcC5pZCBBTkQgcHYuaXNfYWN0aXZlID0gdHJ1ZVxuICAgICAgICApIGFzIHZhcmlhbnRzXG4gICAgICBGUk9NIHByb2R1Y3RzIHBcbiAgICAgIExFRlQgSk9JTiBjYXRlZ29yaWVzIGMgT04gcC5jYXRlZ29yeV9pZCA9IGMuaWRcbiAgICAgICR7d2hlcmVDbGF1c2V9XG4gICAgICBPUkRFUiBCWSBwLiR7c29ydENvbHVtbn0gJHtzb3J0T3JkZXJ9XG4gICAgICBMSU1JVCAkJHtwYXJhbUNvdW50ICsgMX0gT0ZGU0VUICQke3BhcmFtQ291bnQgKyAyfVxuICAgIGA7XG5cbiAgICBxdWVyeVBhcmFtcy5wdXNoKHBhcnNlSW50KGxpbWl0KSwgb2Zmc2V0KTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PFByb2R1Y3Q+KHF1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICAvLyBHZXQgdG90YWwgY291bnQgZm9yIHBhZ2luYXRpb25cbiAgICBjb25zdCBjb3VudFF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIENPVU5UKCopIGFzIHRvdGFsXG4gICAgICBGUk9NIHByb2R1Y3RzIHBcbiAgICAgIExFRlQgSk9JTiBjYXRlZ29yaWVzIGMgT04gcC5jYXRlZ29yeV9pZCA9IGMuaWRcbiAgICAgICR7d2hlcmVDbGF1c2V9XG4gICAgYDtcblxuICAgIGNvbnN0IGNvdW50UmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8eyB0b3RhbDogc3RyaW5nIH0+KFxuICAgICAgY291bnRRdWVyeSxcbiAgICAgIHF1ZXJ5UGFyYW1zLnNsaWNlKDAsIC0yKVxuICAgICk7XG4gICAgY29uc3QgdG90YWwgPSBwYXJzZUludChjb3VudFJlc3VsdC5yb3dzWzBdLnRvdGFsKTtcblxuICAgIGNvbnN0IHBhZ2luYXRpb246IFBhZ2luYXRpb25JbmZvID0ge1xuICAgICAgcGFnZTogcGFyc2VJbnQocGFnZSksXG4gICAgICBsaW1pdDogcGFyc2VJbnQobGltaXQpLFxuICAgICAgdG90YWw6IHRvdGFsLFxuICAgICAgcGFnZXM6IE1hdGguY2VpbCh0b3RhbCAvIHBhcnNlSW50KGxpbWl0KSksXG4gICAgICBoYXNfbmV4dDogcGFyc2VJbnQocGFnZSkgKiBwYXJzZUludChsaW1pdCkgPCB0b3RhbCxcbiAgICAgIGhhc19wcmV2OiBwYXJzZUludChwYWdlKSA+IDEsXG4gICAgfTtcblxuICAgIHJlcy5qc29uKHtcbiAgICAgIGRhdGE6IHJlc3VsdC5yb3dzLFxuICAgICAgcGFnaW5hdGlvbixcbiAgICAgIGZpbHRlcnM6IHtcbiAgICAgICAgY2F0ZWdvcnksXG4gICAgICAgIHN1YmNhdGVnb3J5LFxuICAgICAgICBzZWFyY2gsXG4gICAgICAgIG1pbl9wcmljZSxcbiAgICAgICAgbWF4X3ByaWNlLFxuICAgICAgICBpbl9zdG9jayxcbiAgICAgICAgc29ydDogc29ydENvbHVtbixcbiAgICAgICAgb3JkZXI6IHNvcnRPcmRlcixcbiAgICAgIH0sXG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgbWVzc2FnZTogXCJQcm9kdWN0cyBmZXRjaGVkIHN1Y2Nlc3NmdWxseVwiXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlByb2R1Y3RzIGZldGNoIGVycm9yOlwiLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6IFwiRmFpbGVkIHRvIGZldGNoIHByb2R1Y3RzXCIsXG4gICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYrNmE2Kgg2KfZhNmF2YbYqtis2KfYqlwiLFxuICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBwcm9kdWl0c1wiLFxuICAgIH0pO1xuICB9XG59KTtcblxuLy8gR2V0IHNpbmdsZSBwcm9kdWN0IGJ5IElEXG5yb3V0ZXIuZ2V0KFxuICBcIi86aWRcIixcbiAgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHByb2R1Y3RJZCA9IHJlcS5wYXJhbXMuaWQ7XG4gICAgICBjb25zdCBsYW5ndWFnZSA9IHJlcS5sYW5ndWFnZSB8fCBcImFyXCI7XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PFByb2R1Y3Q+KFxuICAgICAgICBgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHAuaWQsXG4gICAgICAgIHAubmFtZV9hcixcbiAgICAgICAgcC5uYW1lX2ZyLFxuICAgICAgICBwLm5hbWVfZW4sXG4gICAgICAgIHAuZGVzY3JpcHRpb25fYXIsXG4gICAgICAgIHAuZGVzY3JpcHRpb25fZnIsXG4gICAgICAgIHAuZGVzY3JpcHRpb25fZW4sXG4gICAgICAgIHAuYmFzZV9wcmljZSxcbiAgICAgICAgcC5za3UsXG4gICAgICAgIHAuYnJhbmQsXG4gICAgICAgIHAuaXNfdmFwZV9wcm9kdWN0LFxuICAgICAgICBwLmFnZV9yZXN0cmljdGVkLFxuICAgICAgICBwLmlzX2ZlYXR1cmVkLFxuICAgICAgICBwLmltYWdlX3VybHMsXG4gICAgICAgIHAuY3JlYXRlZF9hdCxcbiAgICAgICAgYy5uYW1lXyR7bGFuZ3VhZ2V9IGFzIGNhdGVnb3J5X25hbWUsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QganNvbl9hZ2coXG4gICAgICAgICAgICBqc29uX2J1aWxkX29iamVjdChcbiAgICAgICAgICAgICAgJ2lkJywgcHYuaWQsXG4gICAgICAgICAgICAgICd2YXJpYW50X25hbWVfYXInLCBwdi52YXJpYW50X25hbWVfYXIsXG4gICAgICAgICAgICAgICd2YXJpYW50X25hbWVfZnInLCBwdi52YXJpYW50X25hbWVfZnIsXG4gICAgICAgICAgICAgICd2YXJpYW50X25hbWVfZW4nLCBwdi52YXJpYW50X25hbWVfZW4sXG4gICAgICAgICAgICAgICdza3UnLCBwdi5za3UsXG4gICAgICAgICAgICAgICdwcmljZScsIHB2LnByaWNlLFxuICAgICAgICAgICAgICAnYXR0cmlidXRlcycsIHB2LmF0dHJpYnV0ZXMsXG4gICAgICAgICAgICAgICdpc19kZWZhdWx0JywgcHYuaXNfZGVmYXVsdCxcbiAgICAgICAgICAgICAgJ3N0b2NrX3F1YW50aXR5JywgQ09BTEVTQ0UoaS5hdmFpbGFibGVfcXVhbnRpdHksIDApXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgICAgIEZST00gcHJvZHVjdF92YXJpYW50cyBwdiBcbiAgICAgICAgICBMRUZUIEpPSU4gaW52ZW50b3J5IGkgT04gcHYuaWQgPSBpLnByb2R1Y3RfdmFyaWFudF9pZFxuICAgICAgICAgIFdIRVJFIHB2LnByb2R1Y3RfaWQgPSBwLmlkIEFORCBwdi5pc19hY3RpdmUgPSB0cnVlXG4gICAgICAgICkgYXMgdmFyaWFudHNcbiAgICAgIEZST00gcHJvZHVjdHMgcFxuICAgICAgTEVGVCBKT0lOIGNhdGVnb3JpZXMgYyBPTiBwLmNhdGVnb3J5X2lkID0gYy5pZFxuICAgICAgV0hFUkUgcC5pZCA9ICQxIEFORCBwLmlzX2FjdGl2ZSA9IHRydWVcbiAgICBgLFxuICAgICAgICBbcHJvZHVjdElkXVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIlByb2R1Y3Qgbm90IGZvdW5kXCIsXG4gICAgICAgICAgZXJyb3JfYXI6IFwi2KfZhNmF2YbYqtisINi62YrYsSDZhdmI2KzZiNivXCIsXG4gICAgICAgICAgZXJyb3JfZnI6IFwiUHJvZHVpdCBub24gdHJvdXbDqVwiLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcHJvZHVjdCA9IHJlc3VsdC5yb3dzWzBdO1xuXG4gICAgICByZXMuanNvbih7IFxuICAgICAgICBkYXRhOiBwcm9kdWN0LFxuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiBcIlByb2R1Y3QgZmV0Y2hlZCBzdWNjZXNzZnVsbHlcIlxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJQcm9kdWN0IGZldGNoIGVycm9yOlwiLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiBcIkZhaWxlZCB0byBmZXRjaCBwcm9kdWN0XCIsXG4gICAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINis2YTYqCDYp9mE2YXZhtiq2KxcIixcbiAgICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGR1IHByb2R1aXRcIixcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuKTtcblxuXG4vLyBTZWFyY2ggcHJvZHVjdHMgKHdpdGggQXJhYmljIHRleHQgc2VhcmNoIHN1cHBvcnQpXG5yb3V0ZXIuZ2V0KFxuICBcIi9zZWFyY2gvYWR2YW5jZWRcIixcbiAgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgcSxcbiAgICAgICAgY2F0ZWdvcnksXG4gICAgICAgIHByaWNlX21pbixcbiAgICAgICAgcHJpY2VfbWF4LFxuICAgICAgICBzb3J0ID0gXCJyZWxldmFuY2VcIixcbiAgICAgIH0gPSByZXEucXVlcnkgYXMge1xuICAgICAgICBxPzogc3RyaW5nO1xuICAgICAgICBjYXRlZ29yeT86IHN0cmluZztcbiAgICAgICAgcHJpY2VfbWluPzogc3RyaW5nO1xuICAgICAgICBwcmljZV9tYXg/OiBzdHJpbmc7XG4gICAgICAgIHNvcnQ/OiBzdHJpbmc7XG4gICAgICB9O1xuICAgICAgY29uc3QgbGFuZ3VhZ2UgPSByZXEubGFuZ3VhZ2UgfHwgXCJhclwiO1xuXG4gICAgICBpZiAoIXEgfHwgcS50cmltKCkubGVuZ3RoIDwgMikge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIlNlYXJjaCBxdWVyeSBtdXN0IGJlIGF0IGxlYXN0IDIgY2hhcmFjdGVyc1wiLFxuICAgICAgICAgIGVycm9yX2FyOiBcItmK2KzYqCDYo9mGINmK2YPZiNmGINin2LPYqti52YTYp9mFINin2YTYqNit2Ksg2LnZhNmJINin2YTYo9mC2YQg2K3YsdmB2YrZhlwiLFxuICAgICAgICAgIGVycm9yX2ZyOlxuICAgICAgICAgICAgXCJMYSByZXF1w6p0ZSBkZSByZWNoZXJjaGUgZG9pdCBjb21wb3J0ZXIgYXUgbW9pbnMgMiBjYXJhY3TDqHJlc1wiLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgbGV0IHNlYXJjaFF1ZXJ5ID0gYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBwLnByb2R1Y3RfaWQsXG4gICAgICAgIHAubmFtZV8ke2xhbmd1YWdlfSBhcyBuYW1lLFxuICAgICAgICBwLmRlc2NyaXB0aW9uXyR7bGFuZ3VhZ2V9IGFzIGRlc2NyaXB0aW9uLFxuICAgICAgICBwLnByaWNlLFxuICAgICAgICBwLmNvbXBhcmVfcHJpY2UsXG4gICAgICAgIHAuc3RvY2tfcXVhbnRpdHksXG4gICAgICAgIHAucmVxdWlyZXNfYWdlX3ZlcmlmaWNhdGlvbixcbiAgICAgICAgYy5uYW1lXyR7bGFuZ3VhZ2V9IGFzIGNhdGVnb3J5X25hbWUsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgcGkudXJsIFxuICAgICAgICAgIEZST00gcHJvZHVjdF9pbWFnZXMgcGkgXG4gICAgICAgICAgV0hFUkUgcGkucHJvZHVjdF9pZCA9IHAucHJvZHVjdF9pZCBBTkQgcGkuaXNfcHJpbWFyeSA9IHRydWVcbiAgICAgICAgICBMSU1JVCAxXG4gICAgICAgICkgYXMgcHJpbWFyeV9pbWFnZSxcbiAgICAgICAgdHNfcmFuayhzZWFyY2hfdmVjdG9yXyR7bGFuZ3VhZ2V9LCBwbGFpbnRvX3RzcXVlcnkoJ2FyYWJpYycsICQxKSkgYXMgcmVsZXZhbmNlXG4gICAgICBGUk9NIHByb2R1Y3RzIHBcbiAgICAgIExFRlQgSk9JTiBjYXRlZ29yaWVzIGMgT04gcC5jYXRlZ29yeV9pZCA9IGMuY2F0ZWdvcnlfaWRcbiAgICAgIFdIRVJFIHAuaXNfYWN0aXZlID0gdHJ1ZSBcbiAgICAgICAgQU5EIHAuc2VhcmNoX3ZlY3Rvcl8ke2xhbmd1YWdlfSBAQCBwbGFpbnRvX3RzcXVlcnkoJ2FyYWJpYycsICQxKVxuICAgIGA7XG5cbiAgICAgIGNvbnN0IHF1ZXJ5UGFyYW1zOiBhbnlbXSA9IFtxLnRyaW0oKV07XG4gICAgICBsZXQgcGFyYW1Db3VudCA9IDE7XG5cbiAgICAgIC8vIEFkZCBjYXRlZ29yeSBmaWx0ZXJcbiAgICAgIGlmIChjYXRlZ29yeSkge1xuICAgICAgICBwYXJhbUNvdW50Kys7XG4gICAgICAgIHNlYXJjaFF1ZXJ5ICs9IGAgQU5EIGMubmFtZV9lbiBJTElLRSAkJHtwYXJhbUNvdW50fWA7XG4gICAgICAgIHF1ZXJ5UGFyYW1zLnB1c2goYCUke2NhdGVnb3J5fSVgKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHByaWNlIGZpbHRlcnNcbiAgICAgIGlmIChwcmljZV9taW4pIHtcbiAgICAgICAgcGFyYW1Db3VudCsrO1xuICAgICAgICBzZWFyY2hRdWVyeSArPSBgIEFORCBwLnByaWNlID49ICQke3BhcmFtQ291bnR9YDtcbiAgICAgICAgcXVlcnlQYXJhbXMucHVzaChwYXJzZUZsb2F0KHByaWNlX21pbikpO1xuICAgICAgfVxuXG4gICAgICBpZiAocHJpY2VfbWF4KSB7XG4gICAgICAgIHBhcmFtQ291bnQrKztcbiAgICAgICAgc2VhcmNoUXVlcnkgKz0gYCBBTkQgcC5wcmljZSA8PSAkJHtwYXJhbUNvdW50fWA7XG4gICAgICAgIHF1ZXJ5UGFyYW1zLnB1c2gocGFyc2VGbG9hdChwcmljZV9tYXgpKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHNvcnRpbmdcbiAgICAgIHN3aXRjaCAoc29ydCkge1xuICAgICAgICBjYXNlIFwicHJpY2VfbG93XCI6XG4gICAgICAgICAgc2VhcmNoUXVlcnkgKz0gXCIgT1JERVIgQlkgcC5wcmljZSBBU0NcIjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInByaWNlX2hpZ2hcIjpcbiAgICAgICAgICBzZWFyY2hRdWVyeSArPSBcIiBPUkRFUiBCWSBwLnByaWNlIERFU0NcIjtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIm5ld2VzdFwiOlxuICAgICAgICAgIHNlYXJjaFF1ZXJ5ICs9IFwiIE9SREVSIEJZIHAuY3JlYXRlZF9hdCBERVNDXCI7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJuYW1lXCI6XG4gICAgICAgICAgc2VhcmNoUXVlcnkgKz0gYCBPUkRFUiBCWSBwLm5hbWVfJHtsYW5ndWFnZX0gQVNDYDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDogLy8gcmVsZXZhbmNlXG4gICAgICAgICAgc2VhcmNoUXVlcnkgKz1cbiAgICAgICAgICAgIFwiIE9SREVSIEJZIHJlbGV2YW5jZSBERVNDLCBwLm5hbWVfXCIgKyBsYW5ndWFnZSArIFwiIEFTQ1wiO1xuICAgICAgfVxuXG4gICAgICBzZWFyY2hRdWVyeSArPSBcIiBMSU1JVCA1MFwiO1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxTZWFyY2hSZXN1bHQ+KHNlYXJjaFF1ZXJ5LCBxdWVyeVBhcmFtcyk7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgcmVzdWx0czogcmVzdWx0LnJvd3MsXG4gICAgICAgIHF1ZXJ5OiBxLFxuICAgICAgICB0b3RhbDogcmVzdWx0LnJvd3MubGVuZ3RoLFxuICAgICAgICBmaWx0ZXJzOiB7XG4gICAgICAgICAgY2F0ZWdvcnksXG4gICAgICAgICAgcHJpY2VfbWluLFxuICAgICAgICAgIHByaWNlX21heCxcbiAgICAgICAgICBzb3J0LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZWFyY2ggZXJyb3I6XCIsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IFwiU2VhcmNoIGZhaWxlZFwiLFxuICAgICAgICBlcnJvcl9hcjogXCLZgdi02YQg2KfZhNio2K3Yq1wiLFxuICAgICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgbGEgcmVjaGVyY2hlXCIsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbik7XG5cbi8vIEdldCBmZWF0dXJlZCBwcm9kdWN0c1xucm91dGVyLmdldChcIi9mZWF0dXJlZC9saXN0XCIsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBsYW5ndWFnZSA9IHJlcS5sYW5ndWFnZSB8fCBcImFyXCI7XG4gICAgY29uc3QgbGltaXQgPSByZXEucXVlcnkubGltaXQgPyBwYXJzZUludChyZXEucXVlcnkubGltaXQgYXMgc3RyaW5nKSA6IDEwO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8U2VhcmNoUmVzdWx0PihcbiAgICAgIGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgcC5wcm9kdWN0X2lkLFxuICAgICAgICBwLm5hbWVfJHtsYW5ndWFnZX0gYXMgbmFtZSxcbiAgICAgICAgcC5kZXNjcmlwdGlvbl8ke2xhbmd1YWdlfSBhcyBkZXNjcmlwdGlvbixcbiAgICAgICAgcC5wcmljZSxcbiAgICAgICAgcC5jb21wYXJlX3ByaWNlLFxuICAgICAgICBwLnN0b2NrX3F1YW50aXR5LFxuICAgICAgICBjLm5hbWVfJHtsYW5ndWFnZX0gYXMgY2F0ZWdvcnlfbmFtZSxcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBwaS51cmwgXG4gICAgICAgICAgRlJPTSBwcm9kdWN0X2ltYWdlcyBwaSBcbiAgICAgICAgICBXSEVSRSBwaS5wcm9kdWN0X2lkID0gcC5wcm9kdWN0X2lkIEFORCBwaS5pc19wcmltYXJ5ID0gdHJ1ZVxuICAgICAgICAgIExJTUlUIDFcbiAgICAgICAgKSBhcyBwcmltYXJ5X2ltYWdlXG4gICAgICBGUk9NIHByb2R1Y3RzIHBcbiAgICAgIExFRlQgSk9JTiBjYXRlZ29yaWVzIGMgT04gcC5jYXRlZ29yeV9pZCA9IGMuY2F0ZWdvcnlfaWRcbiAgICAgIFdIRVJFIHAuaXNfYWN0aXZlID0gdHJ1ZSBBTkQgcC5pc19mZWF0dXJlZCA9IHRydWUgQU5EIHAuc3RvY2tfcXVhbnRpdHkgPiAwXG4gICAgICBPUkRFUiBCWSBwLmNyZWF0ZWRfYXQgREVTQ1xuICAgICAgTElNSVQgJDFcbiAgICBgLFxuICAgICAgW2xpbWl0XVxuICAgICk7XG5cbiAgICByZXMuanNvbih7XG4gICAgICBmZWF0dXJlZF9wcm9kdWN0czogcmVzdWx0LnJvd3MsXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkZlYXR1cmVkIHByb2R1Y3RzIGZldGNoIGVycm9yOlwiLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6IFwiRmFpbGVkIHRvIGZldGNoIGZlYXR1cmVkIHByb2R1Y3RzXCIsXG4gICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYrNmE2Kgg2KfZhNmF2YbYqtis2KfYqiDYp9mE2YXZhdmK2LLYqVwiLFxuICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGRlcyBwcm9kdWl0cyBlbiB2ZWRldHRlXCIsXG4gICAgfSk7XG4gIH1cbn0pO1xuXG5leHBvcnQgZGVmYXVsdCByb3V0ZXI7XG4iXX0=