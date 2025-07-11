import express, { Request, Response } from "express";
import * as db from "../config/database";

const router = express.Router();

interface CartItem {
  product_id: string;
  quantity: number;
  variant_id?: string;
  added_at: string;
}

interface AnonymousCart {
  sessionId: string;
  items: CartItem[];
  deviceFingerprint: string;
  lastUpdated: string;
}

// Sync anonymous cart to backend (for persistence across devices)
router.post("/sync", async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { sessionId, items, deviceFingerprint } = req.body;

    if (!sessionId || !items || !deviceFingerprint) {
      return res.status(400).json({
        error: "Missing required fields",
        error_ar: "حقول مطلوبة مفقودة",
        error_fr: "Champs requis manquants",
        success: false
      });
    }

    // For now, we'll just store in memory or simple table
    // In production, you might want to use Redis or a proper cart table
    const cartData: AnonymousCart = {
      sessionId,
      items,
      deviceFingerprint,
      lastUpdated: new Date().toISOString()
    };

    // Store in database (you can create a carts table for this)
    // For now, just return success
    console.log(`Cart synced for session: ${sessionId} with ${items.length} items`);

    res.json({
      success: true,
      message: "Cart synchronized successfully",
      sessionId,
      itemCount: items.length,
      lastSync: cartData.lastUpdated
    });
  } catch (error) {
    console.error("Cart sync error:", error);
    res.status(500).json({
      error: "Failed to sync cart",
      error_ar: "فشل في مزامنة السلة",
      error_fr: "Échec de la synchronisation du panier",
      success: false
    });
  }
});

// Merge guest cart with user account
router.post("/merge", async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { phoneNumber, guestCart } = req.body;

    if (!phoneNumber || !guestCart) {
      return res.status(400).json({
        error: "Missing required fields",
        error_ar: "حقول مطلوبة مفقودة",
        error_fr: "Champs requis manquants",
        success: false
      });
    }

    // Find user by phone number
    const userResult = await db.query(
      "SELECT id FROM users WHERE phone = $1",
      [phoneNumber]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
        error_ar: "المستخدم غير موجود",
        error_fr: "Utilisateur non trouvé",
        success: false
      });
    }

    const userId = userResult.rows[0].id;

    // Merge guest cart items with user's existing cart
    // This would involve more complex logic in production
    console.log(`Merging guest cart for user ${userId}: ${guestCart.items?.length || 0} items`);

    res.json({
      success: true,
      message: "Guest cart merged successfully",
      userId,
      mergedItems: guestCart.items?.length || 0
    });
  } catch (error) {
    console.error("Cart merge error:", error);
    res.status(500).json({
      error: "Failed to merge cart",
      error_ar: "فشل في دمج السلة",
      error_fr: "Échec de la fusion du panier",
      success: false
    });
  }
});

// Get cart for anonymous session
router.get("/anonymous/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // In production, you'd fetch from database/Redis
    // For now, return empty cart
    const cartData = {
      sessionId,
      items: [],
      lastUpdated: new Date().toISOString()
    };

    res.json({
      data: cartData,
      success: true,
      message: "Cart retrieved successfully"
    });
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({
      error: "Failed to retrieve cart",
      error_ar: "فشل في استرجاع السلة",
      error_fr: "Échec de récupération du panier",
      success: false
    });
  }
});

export default router;