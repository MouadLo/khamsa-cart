import express, { Request, Response } from "express";
import * as db from "../config/database";

const router = express.Router();

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
  product_count?: number;
}

// Get all categories
router.get("/", async (req: Request, res: Response) => {
  try {
    const language = req.language || "ar";

    const result = await db.query<Category>(`
      SELECT 
        c.id,
        c.name_ar,
        c.name_fr,
        c.name_en,
        c.description_ar,
        c.description_fr,
        c.description_en,
        c.image_url,
        c.icon_url,
        c.sort_order,
        c.parent_id,
        c.is_vape_category,
        c.age_restricted,
        (
          SELECT COUNT(*) 
          FROM products p 
          WHERE p.category_id = c.id AND p.is_active = true
        ) as product_count
      FROM categories c
      WHERE c.is_active = true
      ORDER BY c.sort_order, c.name_${language}
    `);

    res.json({
      data: result.rows,
      success: true,
      message: "Categories fetched successfully"
    });
  } catch (error) {
    console.error("Categories fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch categories",
      error_ar: "فشل في جلب الفئات",
      error_fr: "Échec de récupération des catégories",
      success: false
    });
  }
});

// Get single category by ID
router.get("/:id", async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const categoryId = req.params.id;
    const language = req.language || "ar";

    const result = await db.query<Category>(`
      SELECT 
        c.id,
        c.name_ar,
        c.name_fr,
        c.name_en,
        c.description_ar,
        c.description_fr,
        c.description_en,
        c.image_url,
        c.icon_url,
        c.sort_order,
        c.parent_id,
        c.is_vape_category,
        c.age_restricted,
        (
          SELECT COUNT(*) 
          FROM products p 
          WHERE p.category_id = c.id AND p.is_active = true
        ) as product_count
      FROM categories c
      WHERE c.id = $1 AND c.is_active = true
    `, [categoryId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Category not found",
        error_ar: "الفئة غير موجودة",
        error_fr: "Catégorie non trouvée",
        success: false
      });
    }

    res.json({
      data: result.rows[0],
      success: true,
      message: "Category fetched successfully"
    });
  } catch (error) {
    console.error("Category fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch category",
      error_ar: "فشل في جلب الفئة",
      error_fr: "Échec de récupération de la catégorie",
      success: false
    });
  }
});

// Get featured categories
router.get("/featured/list", async (req: Request, res: Response) => {
  try {
    const language = req.language || "ar";
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const result = await db.query<Category>(`
      SELECT 
        c.id,
        c.name_ar,
        c.name_fr,
        c.name_en,
        c.description_ar,
        c.description_fr,
        c.description_en,
        c.image_url,
        c.icon_url,
        c.sort_order,
        c.parent_id,
        c.is_vape_category,
        c.age_restricted,
        (
          SELECT COUNT(*) 
          FROM products p 
          WHERE p.category_id = c.id AND p.is_active = true
        ) as product_count
      FROM categories c
      WHERE c.is_active = true AND c.is_featured = true
      ORDER BY c.sort_order, c.name_${language}
      LIMIT $1
    `, [limit]);

    res.json({
      data: result.rows,
      success: true,
      message: "Featured categories fetched successfully"
    });
  } catch (error) {
    console.error("Featured categories fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch featured categories",
      error_ar: "فشل في جلب الفئات المميزة",
      error_fr: "Échec de récupération des catégories en vedette",
      success: false
    });
  }
});

export default router;