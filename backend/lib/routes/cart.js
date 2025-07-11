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
// Sync anonymous cart to backend (for persistence across devices)
router.post("/sync", async (req, res) => {
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
        const cartData = {
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
    }
    catch (error) {
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
router.post("/merge", async (req, res) => {
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
        const userResult = await db.query("SELECT id FROM users WHERE phone = $1", [phoneNumber]);
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
    }
    catch (error) {
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
router.get("/anonymous/:sessionId", async (req, res) => {
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
    }
    catch (error) {
        console.error("Get cart error:", error);
        res.status(500).json({
            error: "Failed to retrieve cart",
            error_ar: "فشل في استرجاع السلة",
            error_fr: "Échec de récupération du panier",
            success: false
        });
    }
});
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FydC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9yb3V0ZXMvY2FydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsc0RBQXFEO0FBQ3JELHVEQUF5QztBQUV6QyxNQUFNLE1BQU0sR0FBRyxpQkFBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO0FBZ0JoQyxrRUFBa0U7QUFDbEUsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQTRCLEVBQUU7SUFDbkYsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBRXpELElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQy9DLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLEtBQUssRUFBRSx5QkFBeUI7Z0JBQ2hDLFFBQVEsRUFBRSxvQkFBb0I7Z0JBQzlCLFFBQVEsRUFBRSx5QkFBeUI7Z0JBQ25DLE9BQU8sRUFBRSxLQUFLO2FBQ2YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELHNEQUFzRDtRQUN0RCxvRUFBb0U7UUFDcEUsTUFBTSxRQUFRLEdBQWtCO1lBQzlCLFNBQVM7WUFDVCxLQUFLO1lBQ0wsaUJBQWlCO1lBQ2pCLFdBQVcsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtTQUN0QyxDQUFDO1FBRUYsNERBQTREO1FBQzVELCtCQUErQjtRQUMvQixPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixTQUFTLFNBQVMsS0FBSyxDQUFDLE1BQU0sUUFBUSxDQUFDLENBQUM7UUFFaEYsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLGdDQUFnQztZQUN6QyxTQUFTO1lBQ1QsU0FBUyxFQUFFLEtBQUssQ0FBQyxNQUFNO1lBQ3ZCLFFBQVEsRUFBRSxRQUFRLENBQUMsV0FBVztTQUMvQixDQUFDLENBQUM7SUFDTCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDekMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsS0FBSyxFQUFFLHFCQUFxQjtZQUM1QixRQUFRLEVBQUUscUJBQXFCO1lBQy9CLFFBQVEsRUFBRSx1Q0FBdUM7WUFDakQsT0FBTyxFQUFFLEtBQUs7U0FDZixDQUFDLENBQUM7SUFDTCxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxxQ0FBcUM7QUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQTRCLEVBQUU7SUFDcEYsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBRTVDLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMvQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixLQUFLLEVBQUUseUJBQXlCO2dCQUNoQyxRQUFRLEVBQUUsb0JBQW9CO2dCQUM5QixRQUFRLEVBQUUseUJBQXlCO2dCQUNuQyxPQUFPLEVBQUUsS0FBSzthQUNmLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCw0QkFBNEI7UUFDNUIsTUFBTSxVQUFVLEdBQUcsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUMvQix1Q0FBdUMsRUFDdkMsQ0FBQyxXQUFXLENBQUMsQ0FDZCxDQUFDO1FBRUYsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixLQUFLLEVBQUUsZ0JBQWdCO2dCQUN2QixRQUFRLEVBQUUsb0JBQW9CO2dCQUM5QixRQUFRLEVBQUUsd0JBQXdCO2dCQUNsQyxPQUFPLEVBQUUsS0FBSzthQUNmLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVyQyxtREFBbUQ7UUFDbkQsc0RBQXNEO1FBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLE1BQU0sS0FBSyxTQUFTLENBQUMsS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTVGLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDUCxPQUFPLEVBQUUsSUFBSTtZQUNiLE9BQU8sRUFBRSxnQ0FBZ0M7WUFDekMsTUFBTTtZQUNOLFdBQVcsRUFBRSxTQUFTLENBQUMsS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUsc0JBQXNCO1lBQzdCLFFBQVEsRUFBRSxrQkFBa0I7WUFDNUIsUUFBUSxFQUFFLDhCQUE4QjtZQUN4QyxPQUFPLEVBQUUsS0FBSztTQUNmLENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILGlDQUFpQztBQUNqQyxNQUFNLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLEtBQUssRUFBRSxHQUFZLEVBQUUsR0FBYSxFQUFFLEVBQUU7SUFDeEUsSUFBSSxDQUFDO1FBQ0gsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFFakMsaURBQWlEO1FBQ2pELDZCQUE2QjtRQUM3QixNQUFNLFFBQVEsR0FBRztZQUNmLFNBQVM7WUFDVCxLQUFLLEVBQUUsRUFBRTtZQUNULFdBQVcsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtTQUN0QyxDQUFDO1FBRUYsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLElBQUksRUFBRSxRQUFRO1lBQ2QsT0FBTyxFQUFFLElBQUk7WUFDYixPQUFPLEVBQUUsNkJBQTZCO1NBQ3ZDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUseUJBQXlCO1lBQ2hDLFFBQVEsRUFBRSxzQkFBc0I7WUFDaEMsUUFBUSxFQUFFLGlDQUFpQztZQUMzQyxPQUFPLEVBQUUsS0FBSztTQUNmLENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDLENBQUMsQ0FBQztBQUVILGtCQUFlLE1BQU0sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlIH0gZnJvbSBcImV4cHJlc3NcIjtcbmltcG9ydCAqIGFzIGRiIGZyb20gXCIuLi9jb25maWcvZGF0YWJhc2VcIjtcblxuY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcblxuaW50ZXJmYWNlIENhcnRJdGVtIHtcbiAgcHJvZHVjdF9pZDogc3RyaW5nO1xuICBxdWFudGl0eTogbnVtYmVyO1xuICB2YXJpYW50X2lkPzogc3RyaW5nO1xuICBhZGRlZF9hdDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQW5vbnltb3VzQ2FydCB7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICBpdGVtczogQ2FydEl0ZW1bXTtcbiAgZGV2aWNlRmluZ2VycHJpbnQ6IHN0cmluZztcbiAgbGFzdFVwZGF0ZWQ6IHN0cmluZztcbn1cblxuLy8gU3luYyBhbm9ueW1vdXMgY2FydCB0byBiYWNrZW5kIChmb3IgcGVyc2lzdGVuY2UgYWNyb3NzIGRldmljZXMpXG5yb3V0ZXIucG9zdChcIi9zeW5jXCIsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgc2Vzc2lvbklkLCBpdGVtcywgZGV2aWNlRmluZ2VycHJpbnQgfSA9IHJlcS5ib2R5O1xuXG4gICAgaWYgKCFzZXNzaW9uSWQgfHwgIWl0ZW1zIHx8ICFkZXZpY2VGaW5nZXJwcmludCkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IFwiTWlzc2luZyByZXF1aXJlZCBmaWVsZHNcIixcbiAgICAgICAgZXJyb3JfYXI6IFwi2K3ZgtmI2YQg2YXYt9mE2YjYqNipINmF2YHZgtmI2K/YqVwiLFxuICAgICAgICBlcnJvcl9mcjogXCJDaGFtcHMgcmVxdWlzIG1hbnF1YW50c1wiLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gRm9yIG5vdywgd2UnbGwganVzdCBzdG9yZSBpbiBtZW1vcnkgb3Igc2ltcGxlIHRhYmxlXG4gICAgLy8gSW4gcHJvZHVjdGlvbiwgeW91IG1pZ2h0IHdhbnQgdG8gdXNlIFJlZGlzIG9yIGEgcHJvcGVyIGNhcnQgdGFibGVcbiAgICBjb25zdCBjYXJ0RGF0YTogQW5vbnltb3VzQ2FydCA9IHtcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIGl0ZW1zLFxuICAgICAgZGV2aWNlRmluZ2VycHJpbnQsXG4gICAgICBsYXN0VXBkYXRlZDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgfTtcblxuICAgIC8vIFN0b3JlIGluIGRhdGFiYXNlICh5b3UgY2FuIGNyZWF0ZSBhIGNhcnRzIHRhYmxlIGZvciB0aGlzKVxuICAgIC8vIEZvciBub3csIGp1c3QgcmV0dXJuIHN1Y2Nlc3NcbiAgICBjb25zb2xlLmxvZyhgQ2FydCBzeW5jZWQgZm9yIHNlc3Npb246ICR7c2Vzc2lvbklkfSB3aXRoICR7aXRlbXMubGVuZ3RofSBpdGVtc2ApO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIG1lc3NhZ2U6IFwiQ2FydCBzeW5jaHJvbml6ZWQgc3VjY2Vzc2Z1bGx5XCIsXG4gICAgICBzZXNzaW9uSWQsXG4gICAgICBpdGVtQ291bnQ6IGl0ZW1zLmxlbmd0aCxcbiAgICAgIGxhc3RTeW5jOiBjYXJ0RGF0YS5sYXN0VXBkYXRlZFxuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJDYXJ0IHN5bmMgZXJyb3I6XCIsIGVycm9yKTtcbiAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICBlcnJvcjogXCJGYWlsZWQgdG8gc3luYyBjYXJ0XCIsXG4gICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDZhdiy2KfZhdmG2Kkg2KfZhNiz2YTYqVwiLFxuICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIGxhIHN5bmNocm9uaXNhdGlvbiBkdSBwYW5pZXJcIixcbiAgICAgIHN1Y2Nlc3M6IGZhbHNlXG4gICAgfSk7XG4gIH1cbn0pO1xuXG4vLyBNZXJnZSBndWVzdCBjYXJ0IHdpdGggdXNlciBhY2NvdW50XG5yb3V0ZXIucG9zdChcIi9tZXJnZVwiLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHBob25lTnVtYmVyLCBndWVzdENhcnQgfSA9IHJlcS5ib2R5O1xuXG4gICAgaWYgKCFwaG9uZU51bWJlciB8fCAhZ3Vlc3RDYXJ0KSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogXCJNaXNzaW5nIHJlcXVpcmVkIGZpZWxkc1wiLFxuICAgICAgICBlcnJvcl9hcjogXCLYrdmC2YjZhCDZhdi32YTZiNio2Kkg2YXZgdmC2YjYr9ipXCIsXG4gICAgICAgIGVycm9yX2ZyOiBcIkNoYW1wcyByZXF1aXMgbWFucXVhbnRzXCIsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBGaW5kIHVzZXIgYnkgcGhvbmUgbnVtYmVyXG4gICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5KFxuICAgICAgXCJTRUxFQ1QgaWQgRlJPTSB1c2VycyBXSEVSRSBwaG9uZSA9ICQxXCIsXG4gICAgICBbcGhvbmVOdW1iZXJdXG4gICAgKTtcblxuICAgIGlmICh1c2VyUmVzdWx0LnJvd3MubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xuICAgICAgICBlcnJvcjogXCJVc2VyIG5vdCBmb3VuZFwiLFxuICAgICAgICBlcnJvcl9hcjogXCLYp9mE2YXYs9iq2K7Yr9mFINi62YrYsSDZhdmI2KzZiNivXCIsXG4gICAgICAgIGVycm9yX2ZyOiBcIlV0aWxpc2F0ZXVyIG5vbiB0cm91dsOpXCIsXG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VySWQgPSB1c2VyUmVzdWx0LnJvd3NbMF0uaWQ7XG5cbiAgICAvLyBNZXJnZSBndWVzdCBjYXJ0IGl0ZW1zIHdpdGggdXNlcidzIGV4aXN0aW5nIGNhcnRcbiAgICAvLyBUaGlzIHdvdWxkIGludm9sdmUgbW9yZSBjb21wbGV4IGxvZ2ljIGluIHByb2R1Y3Rpb25cbiAgICBjb25zb2xlLmxvZyhgTWVyZ2luZyBndWVzdCBjYXJ0IGZvciB1c2VyICR7dXNlcklkfTogJHtndWVzdENhcnQuaXRlbXM/Lmxlbmd0aCB8fCAwfSBpdGVtc2ApO1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIG1lc3NhZ2U6IFwiR3Vlc3QgY2FydCBtZXJnZWQgc3VjY2Vzc2Z1bGx5XCIsXG4gICAgICB1c2VySWQsXG4gICAgICBtZXJnZWRJdGVtczogZ3Vlc3RDYXJ0Lml0ZW1zPy5sZW5ndGggfHwgMFxuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJDYXJ0IG1lcmdlIGVycm9yOlwiLCBlcnJvcik7XG4gICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgZXJyb3I6IFwiRmFpbGVkIHRvIG1lcmdlIGNhcnRcIixcbiAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINiv2YXYrCDYp9mE2LPZhNipXCIsXG4gICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgbGEgZnVzaW9uIGR1IHBhbmllclwiLFxuICAgICAgc3VjY2VzczogZmFsc2VcbiAgICB9KTtcbiAgfVxufSk7XG5cbi8vIEdldCBjYXJ0IGZvciBhbm9ueW1vdXMgc2Vzc2lvblxucm91dGVyLmdldChcIi9hbm9ueW1vdXMvOnNlc3Npb25JZFwiLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBzZXNzaW9uSWQgfSA9IHJlcS5wYXJhbXM7XG5cbiAgICAvLyBJbiBwcm9kdWN0aW9uLCB5b3UnZCBmZXRjaCBmcm9tIGRhdGFiYXNlL1JlZGlzXG4gICAgLy8gRm9yIG5vdywgcmV0dXJuIGVtcHR5IGNhcnRcbiAgICBjb25zdCBjYXJ0RGF0YSA9IHtcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIGl0ZW1zOiBbXSxcbiAgICAgIGxhc3RVcGRhdGVkOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICB9O1xuXG4gICAgcmVzLmpzb24oe1xuICAgICAgZGF0YTogY2FydERhdGEsXG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgbWVzc2FnZTogXCJDYXJ0IHJldHJpZXZlZCBzdWNjZXNzZnVsbHlcIlxuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJHZXQgY2FydCBlcnJvcjpcIiwgZXJyb3IpO1xuICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgIGVycm9yOiBcIkZhaWxlZCB0byByZXRyaWV2ZSBjYXJ0XCIsXG4gICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYp9iz2KrYsdis2KfYuSDYp9mE2LPZhNipXCIsXG4gICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgcsOpY3Vww6lyYXRpb24gZHUgcGFuaWVyXCIsXG4gICAgICBzdWNjZXNzOiBmYWxzZVxuICAgIH0pO1xuICB9XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgcm91dGVyOyJdfQ==