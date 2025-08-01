import express, { Request, Response } from "express";
import { body, query, validationResult } from "express-validator";
import * as db from "../config/database";
import { authenticateToken } from "./auth";

const router = express.Router();

// Type definitions
interface ProductFilters {
  category?: string;
  subcategory?: string;
  search?: string;
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  min_price?: string;
  max_price?: string;
  in_stock?: string;
}

interface ProductImage {
  image_id: number;
  url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
}

interface ProductVariant {
  id: string;
  variant_name_ar: string;
  variant_name_fr: string;
  variant_name_en: string;
  sku: string;
  price: number;
  attributes: any;
  is_default: boolean;
  stock_quantity: number;
}

interface Product {
  id: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  description_ar: string;
  description_fr: string;
  description_en: string;
  base_price: number;
  sku: string;
  brand: string;
  is_vape_product: boolean;
  age_restricted: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at?: string;
  category_name: string;
  image_urls: string[];
  variants: ProductVariant[];
}

interface Review {
  review_id: number;
  rating: number;
  comment: string;
  created_at: string;
  reviewer_name: string;
}

interface Category {
  id: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  description_ar: string;
  description_fr: string;
  description_en: string;
  parent_id: string;
  sort_order: number;
  is_vape_category: boolean;
  age_restricted: boolean;
  image_url: string;
  icon_url: string;
  is_active: boolean;
  is_featured: boolean;
}

interface Subcategory {
  subcategory_id: number;
  name: string;
  description: string;
  sort_order: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

interface SearchResult {
  product_id: number;
  name: string;
  description: string;
  price: number;
  compare_price: number;
  stock_quantity: number;
  requires_age_verification: boolean;
  category_name: string;
  primary_image: string;
  relevance: number;
}

// Get all products with filters
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      category,
      subcategory,
      search,
      page = "1",
      limit = "20",
      sort = "name_ar",
      order = "ASC",
      min_price,
      max_price,
      in_stock = "true",
    } = req.query as ProductFilters;

    const language = req.language || "ar";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build dynamic query
    let whereConditions = ["p.is_active = true"];
    let queryParams: any[] = [];
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

    const whereClause =
      whereConditions.length > 0
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

    const result = await db.query<Product>(query, queryParams);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;

    const countResult = await db.query<{ total: string }>(
      countQuery,
      queryParams.slice(0, -2)
    );
    const total = parseInt(countResult.rows[0].total);

    const pagination: PaginationInfo = {
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
  } catch (error) {
    console.error("Products fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch products",
      error_ar: "فشل في جلب المنتجات",
      error_fr: "Échec de récupération des produits",
    });
  }
});

// Get single product by ID
router.get(
  "/:id",
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const productId = req.params.id;
      const language = req.language || "ar";

      const result = await db.query<Product>(
        `
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
    `,
        [productId]
      );

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
    } catch (error) {
      console.error("Product fetch error:", error);
      res.status(500).json({
        error: "Failed to fetch product",
        error_ar: "فشل في جلب المنتج",
        error_fr: "Échec de récupération du produit",
      });
    }
  }
);


// Search products (with Arabic text search support)
router.get(
  "/search/advanced",
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const {
        q,
        category,
        price_min,
        price_max,
        sort = "relevance",
      } = req.query as {
        q?: string;
        category?: string;
        price_min?: string;
        price_max?: string;
        sort?: string;
      };
      const language = req.language || "ar";

      if (!q || q.trim().length < 2) {
        return res.status(400).json({
          error: "Search query must be at least 2 characters",
          error_ar: "يجب أن يكون استعلام البحث على الأقل حرفين",
          error_fr:
            "La requête de recherche doit comporter au moins 2 caractères",
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

      const queryParams: any[] = [q.trim()];
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

      const result = await db.query<SearchResult>(searchQuery, queryParams);

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
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({
        error: "Search failed",
        error_ar: "فشل البحث",
        error_fr: "Échec de la recherche",
      });
    }
  }
);

// Get featured products
router.get("/featured/list", async (req: Request, res: Response) => {
  try {
    const language = req.language || "ar";
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const result = await db.query<SearchResult>(
      `
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
    `,
      [limit]
    );

    res.json({
      featured_products: result.rows,
    });
  } catch (error) {
    console.error("Featured products fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch featured products",
      error_ar: "فشل في جلب المنتجات المميزة",
      error_fr: "Échec de récupération des produits en vedette",
    });
  }
});

export default router;
