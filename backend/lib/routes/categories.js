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
// Get all categories
router.get("/", async (req, res) => {
    try {
        const language = req.language || "ar";
        const result = await db.query(`
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
    }
    catch (error) {
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
router.get("/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;
        const language = req.language || "ar";
        const result = await db.query(`
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
    }
    catch (error) {
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
router.get("/featured/list", async (req, res) => {
    try {
        const language = req.language || "ar";
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const result = await db.query(`
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
    }
    catch (error) {
        console.error("Featured categories fetch error:", error);
        res.status(500).json({
            error: "Failed to fetch featured categories",
            error_ar: "فشل في جلب الفئات المميزة",
            error_fr: "Échec de récupération des catégories en vedette",
            success: false
        });
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2F0ZWdvcmllcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9yb3V0ZXMvY2F0ZWdvcmllcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsc0RBQXFEO0FBQ3JELHVEQUF5QztBQUV6QyxNQUFNLE1BQU0sR0FBRyxpQkFBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBcUJoQyxxQkFBcUI7QUFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQUUsRUFBRTtJQUNwRCxJQUFJLENBQUM7UUFDSCxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQztRQUV0QyxNQUFNLE1BQU0sR0FBRyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQVc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7c0NBc0JOLFFBQVE7S0FDekMsQ0FBQyxDQUFDO1FBRUgsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtZQUNqQixPQUFPLEVBQUUsSUFBSTtZQUNiLE9BQU8sRUFBRSxpQ0FBaUM7U0FDM0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2hELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSw0QkFBNEI7WUFDbkMsUUFBUSxFQUFFLG1CQUFtQjtZQUM3QixRQUFRLEVBQUUsc0NBQXNDO1lBQ2hELE9BQU8sRUFBRSxLQUFLO1NBQ2YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDO0FBRUgsNEJBQTRCO0FBQzVCLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFZLEVBQUUsR0FBYSxFQUE0QixFQUFFO0lBQ2pGLElBQUksQ0FBQztRQUNILE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDO1FBRXRDLE1BQU0sTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFDLEtBQUssQ0FBVzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQXNCdkMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFFakIsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM3QixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixLQUFLLEVBQUUsb0JBQW9CO2dCQUMzQixRQUFRLEVBQUUsa0JBQWtCO2dCQUM1QixRQUFRLEVBQUUsdUJBQXVCO2dCQUNqQyxPQUFPLEVBQUUsS0FBSzthQUNmLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ1AsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3BCLE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLCtCQUErQjtTQUN6QyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsS0FBSyxFQUFFLDBCQUEwQjtZQUNqQyxRQUFRLEVBQUUsa0JBQWtCO1lBQzVCLFFBQVEsRUFBRSx1Q0FBdUM7WUFDakQsT0FBTyxFQUFFLEtBQUs7U0FDZixDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCwwQkFBMEI7QUFDMUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsR0FBWSxFQUFFLEdBQWEsRUFBRSxFQUFFO0lBQ2pFLElBQUksQ0FBQztRQUNILE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDO1FBQ3RDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBRXpFLE1BQU0sTUFBTSxHQUFHLE1BQU0sRUFBRSxDQUFDLEtBQUssQ0FBVzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztzQ0FzQk4sUUFBUTs7S0FFekMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFWixHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ1AsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO1lBQ2pCLE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLDBDQUEwQztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDekQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsS0FBSyxFQUFFLHFDQUFxQztZQUM1QyxRQUFRLEVBQUUsMkJBQTJCO1lBQ3JDLFFBQVEsRUFBRSxpREFBaUQ7WUFDM0QsT0FBTyxFQUFFLEtBQUs7U0FDZixDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZXhwcmVzcywgeyBSZXF1ZXN0LCBSZXNwb25zZSB9IGZyb20gXCJleHByZXNzXCI7XG5pbXBvcnQgKiBhcyBkYiBmcm9tIFwiLi4vY29uZmlnL2RhdGFiYXNlXCI7XG5cbmNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG5cbmludGVyZmFjZSBDYXRlZ29yeSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWVfYXI6IHN0cmluZztcbiAgbmFtZV9mcjogc3RyaW5nO1xuICBuYW1lX2VuOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2FyOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2ZyOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uX2VuOiBzdHJpbmc7XG4gIHBhcmVudF9pZDogc3RyaW5nO1xuICBzb3J0X29yZGVyOiBudW1iZXI7XG4gIGlzX3ZhcGVfY2F0ZWdvcnk6IGJvb2xlYW47XG4gIGFnZV9yZXN0cmljdGVkOiBib29sZWFuO1xuICBpbWFnZV91cmw6IHN0cmluZztcbiAgaWNvbl91cmw6IHN0cmluZztcbiAgaXNfYWN0aXZlOiBib29sZWFuO1xuICBpc19mZWF0dXJlZDogYm9vbGVhbjtcbiAgcHJvZHVjdF9jb3VudD86IG51bWJlcjtcbn1cblxuLy8gR2V0IGFsbCBjYXRlZ29yaWVzXG5yb3V0ZXIuZ2V0KFwiL1wiLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgbGFuZ3VhZ2UgPSByZXEubGFuZ3VhZ2UgfHwgXCJhclwiO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZGIucXVlcnk8Q2F0ZWdvcnk+KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgYy5pZCxcbiAgICAgICAgYy5uYW1lX2FyLFxuICAgICAgICBjLm5hbWVfZnIsXG4gICAgICAgIGMubmFtZV9lbixcbiAgICAgICAgYy5kZXNjcmlwdGlvbl9hcixcbiAgICAgICAgYy5kZXNjcmlwdGlvbl9mcixcbiAgICAgICAgYy5kZXNjcmlwdGlvbl9lbixcbiAgICAgICAgYy5pbWFnZV91cmwsXG4gICAgICAgIGMuaWNvbl91cmwsXG4gICAgICAgIGMuc29ydF9vcmRlcixcbiAgICAgICAgYy5wYXJlbnRfaWQsXG4gICAgICAgIGMuaXNfdmFwZV9jYXRlZ29yeSxcbiAgICAgICAgYy5hZ2VfcmVzdHJpY3RlZCxcbiAgICAgICAgKFxuICAgICAgICAgIFNFTEVDVCBDT1VOVCgqKSBcbiAgICAgICAgICBGUk9NIHByb2R1Y3RzIHAgXG4gICAgICAgICAgV0hFUkUgcC5jYXRlZ29yeV9pZCA9IGMuaWQgQU5EIHAuaXNfYWN0aXZlID0gdHJ1ZVxuICAgICAgICApIGFzIHByb2R1Y3RfY291bnRcbiAgICAgIEZST00gY2F0ZWdvcmllcyBjXG4gICAgICBXSEVSRSBjLmlzX2FjdGl2ZSA9IHRydWVcbiAgICAgIE9SREVSIEJZIGMuc29ydF9vcmRlciwgYy5uYW1lXyR7bGFuZ3VhZ2V9XG4gICAgYCk7XG5cbiAgICByZXMuanNvbih7XG4gICAgICBkYXRhOiByZXN1bHQucm93cyxcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBtZXNzYWdlOiBcIkNhdGVnb3JpZXMgZmV0Y2hlZCBzdWNjZXNzZnVsbHlcIlxuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJDYXRlZ29yaWVzIGZldGNoIGVycm9yOlwiLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6IFwiRmFpbGVkIHRvIGZldGNoIGNhdGVnb3JpZXNcIixcbiAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINis2YTYqCDYp9mE2YHYptin2KpcIixcbiAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZXMgY2F0w6lnb3JpZXNcIixcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBHZXQgc2luZ2xlIGNhdGVnb3J5IGJ5IElEXG5yb3V0ZXIuZ2V0KFwiLzppZFwiLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBjYXRlZ29yeUlkID0gcmVxLnBhcmFtcy5pZDtcbiAgICBjb25zdCBsYW5ndWFnZSA9IHJlcS5sYW5ndWFnZSB8fCBcImFyXCI7XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkYi5xdWVyeTxDYXRlZ29yeT4oYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBjLmlkLFxuICAgICAgICBjLm5hbWVfYXIsXG4gICAgICAgIGMubmFtZV9mcixcbiAgICAgICAgYy5uYW1lX2VuLFxuICAgICAgICBjLmRlc2NyaXB0aW9uX2FyLFxuICAgICAgICBjLmRlc2NyaXB0aW9uX2ZyLFxuICAgICAgICBjLmRlc2NyaXB0aW9uX2VuLFxuICAgICAgICBjLmltYWdlX3VybCxcbiAgICAgICAgYy5pY29uX3VybCxcbiAgICAgICAgYy5zb3J0X29yZGVyLFxuICAgICAgICBjLnBhcmVudF9pZCxcbiAgICAgICAgYy5pc192YXBlX2NhdGVnb3J5LFxuICAgICAgICBjLmFnZV9yZXN0cmljdGVkLFxuICAgICAgICAoXG4gICAgICAgICAgU0VMRUNUIENPVU5UKCopIFxuICAgICAgICAgIEZST00gcHJvZHVjdHMgcCBcbiAgICAgICAgICBXSEVSRSBwLmNhdGVnb3J5X2lkID0gYy5pZCBBTkQgcC5pc19hY3RpdmUgPSB0cnVlXG4gICAgICAgICkgYXMgcHJvZHVjdF9jb3VudFxuICAgICAgRlJPTSBjYXRlZ29yaWVzIGNcbiAgICAgIFdIRVJFIGMuaWQgPSAkMSBBTkQgYy5pc19hY3RpdmUgPSB0cnVlXG4gICAgYCwgW2NhdGVnb3J5SWRdKTtcblxuICAgIGlmIChyZXN1bHQucm93cy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7XG4gICAgICAgIGVycm9yOiBcIkNhdGVnb3J5IG5vdCBmb3VuZFwiLFxuICAgICAgICBlcnJvcl9hcjogXCLYp9mE2YHYptipINi62YrYsSDZhdmI2KzZiNiv2KlcIixcbiAgICAgICAgZXJyb3JfZnI6IFwiQ2F0w6lnb3JpZSBub24gdHJvdXbDqWVcIixcbiAgICAgICAgc3VjY2VzczogZmFsc2VcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJlcy5qc29uKHtcbiAgICAgIGRhdGE6IHJlc3VsdC5yb3dzWzBdLFxuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIG1lc3NhZ2U6IFwiQ2F0ZWdvcnkgZmV0Y2hlZCBzdWNjZXNzZnVsbHlcIlxuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJDYXRlZ29yeSBmZXRjaCBlcnJvcjpcIiwgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiBcIkZhaWxlZCB0byBmZXRjaCBjYXRlZ29yeVwiLFxuICAgICAgZXJyb3JfYXI6IFwi2YHYtNmEINmB2Yog2KzZhNioINin2YTZgdim2KlcIixcbiAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZSBsYSBjYXTDqWdvcmllXCIsXG4gICAgICBzdWNjZXNzOiBmYWxzZVxuICAgIH0pO1xuICB9XG59KTtcblxuLy8gR2V0IGZlYXR1cmVkIGNhdGVnb3JpZXNcbnJvdXRlci5nZXQoXCIvZmVhdHVyZWQvbGlzdFwiLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgbGFuZ3VhZ2UgPSByZXEubGFuZ3VhZ2UgfHwgXCJhclwiO1xuICAgIGNvbnN0IGxpbWl0ID0gcmVxLnF1ZXJ5LmxpbWl0ID8gcGFyc2VJbnQocmVxLnF1ZXJ5LmxpbWl0IGFzIHN0cmluZykgOiAxMDtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PENhdGVnb3J5PihgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIGMuaWQsXG4gICAgICAgIGMubmFtZV9hcixcbiAgICAgICAgYy5uYW1lX2ZyLFxuICAgICAgICBjLm5hbWVfZW4sXG4gICAgICAgIGMuZGVzY3JpcHRpb25fYXIsXG4gICAgICAgIGMuZGVzY3JpcHRpb25fZnIsXG4gICAgICAgIGMuZGVzY3JpcHRpb25fZW4sXG4gICAgICAgIGMuaW1hZ2VfdXJsLFxuICAgICAgICBjLmljb25fdXJsLFxuICAgICAgICBjLnNvcnRfb3JkZXIsXG4gICAgICAgIGMucGFyZW50X2lkLFxuICAgICAgICBjLmlzX3ZhcGVfY2F0ZWdvcnksXG4gICAgICAgIGMuYWdlX3Jlc3RyaWN0ZWQsXG4gICAgICAgIChcbiAgICAgICAgICBTRUxFQ1QgQ09VTlQoKikgXG4gICAgICAgICAgRlJPTSBwcm9kdWN0cyBwIFxuICAgICAgICAgIFdIRVJFIHAuY2F0ZWdvcnlfaWQgPSBjLmlkIEFORCBwLmlzX2FjdGl2ZSA9IHRydWVcbiAgICAgICAgKSBhcyBwcm9kdWN0X2NvdW50XG4gICAgICBGUk9NIGNhdGVnb3JpZXMgY1xuICAgICAgV0hFUkUgYy5pc19hY3RpdmUgPSB0cnVlIEFORCBjLmlzX2ZlYXR1cmVkID0gdHJ1ZVxuICAgICAgT1JERVIgQlkgYy5zb3J0X29yZGVyLCBjLm5hbWVfJHtsYW5ndWFnZX1cbiAgICAgIExJTUlUICQxXG4gICAgYCwgW2xpbWl0XSk7XG5cbiAgICByZXMuanNvbih7XG4gICAgICBkYXRhOiByZXN1bHQucm93cyxcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBtZXNzYWdlOiBcIkZlYXR1cmVkIGNhdGVnb3JpZXMgZmV0Y2hlZCBzdWNjZXNzZnVsbHlcIlxuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJGZWF0dXJlZCBjYXRlZ29yaWVzIGZldGNoIGVycm9yOlwiLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6IFwiRmFpbGVkIHRvIGZldGNoIGZlYXR1cmVkIGNhdGVnb3JpZXNcIixcbiAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINis2YTYqCDYp9mE2YHYptin2Kog2KfZhNmF2YXZitiy2KlcIixcbiAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkZXMgY2F0w6lnb3JpZXMgZW4gdmVkZXR0ZVwiLFxuICAgICAgc3VjY2VzczogZmFsc2VcbiAgICB9KTtcbiAgfVxufSk7XG5cbmV4cG9ydCBkZWZhdWx0IHJvdXRlcjsiXX0=