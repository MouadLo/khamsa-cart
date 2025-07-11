"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_validator_1 = require("express-validator");
const database_1 = require("../config/database");
const router = express_1.default.Router();
// JWT token generation
function generateToken(user) {
    const secret = process.env.JWT_SECRET || "fallback_secret";
    const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
    return jsonwebtoken_1.default.sign({
        user_id: user.user_id,
        phone: user.phone,
        type: user.type,
    }, secret, { expiresIn });
}
// Validation middleware
const validateGuestAuth = [
    (0, express_validator_1.body)("phone")
        .isMobilePhone("ar-MA")
        .withMessage("Invalid Morocco phone number"),
    (0, express_validator_1.body)("location.latitude")
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid latitude"),
    (0, express_validator_1.body)("location.longitude")
        .isFloat({ min: -180, max: 180 })
        .withMessage("Invalid longitude"),
    (0, express_validator_1.body)("location.address")
        .isLength({ min: 5, max: 200 })
        .withMessage("Address must be 5-200 characters"),
];
const validateRegister = [
    (0, express_validator_1.body)("phone")
        .isMobilePhone("ar-MA")
        .withMessage("Invalid Morocco phone number"),
    (0, express_validator_1.body)("password")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters"),
    (0, express_validator_1.body)("name")
        .isLength({ min: 2, max: 50 })
        .withMessage("Name must be 2-50 characters"),
    (0, express_validator_1.body)("location.latitude")
        .isFloat({ min: -90, max: 90 })
        .withMessage("Invalid latitude"),
    (0, express_validator_1.body)("location.longitude")
        .isFloat({ min: -180, max: 180 })
        .withMessage("Invalid longitude"),
    (0, express_validator_1.body)("location.address")
        .isLength({ min: 5, max: 200 })
        .withMessage("Address must be 5-200 characters"),
];
const validateLogin = [
    (0, express_validator_1.body)("phone")
        .isMobilePhone("ar-MA")
        .withMessage("Invalid Morocco phone number"),
    (0, express_validator_1.body)("password").isLength({ min: 1 }).withMessage("Password is required"),
];
// Guest authentication for quick checkout
router.post("/guest", validateGuestAuth, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: "Validation failed",
                error_ar: "فشل في التحقق من البيانات",
                error_fr: "Échec de la validation",
                details: errors.array(),
            });
        }
        const { phone, location } = req.body;
        // Check if user already exists
        const existingUser = await (0, database_1.query)("SELECT user_id, phone, type FROM users WHERE phone = $1", [phone]);
        let user;
        if (existingUser.rows.length > 0) {
            user = existingUser.rows[0];
        }
        else {
            // Create guest user
            const result = await (0, database_1.query)(`INSERT INTO users (phone, type, is_guest, location_latitude, location_longitude, location_address)
         VALUES ($1, 'customer', true, $2, $3, $4)
         RETURNING user_id, phone, type`, [phone, location.latitude, location.longitude, location.address]);
            user = result.rows[0];
        }
        const token = generateToken(user);
        res.json({
            message: "Guest authentication successful",
            message_ar: "تم التوثيق كضيف بنجاح",
            message_fr: "Authentification invité réussie",
            token,
            user: {
                user_id: user.user_id,
                phone: user.phone,
                type: user.type,
                is_guest: true,
            },
        });
    }
    catch (error) {
        console.error("Guest auth error:", error);
        res.status(500).json({
            error: "Authentication failed",
            error_ar: "فشل في التوثيق",
            error_fr: "Échec de l'authentification",
        });
    }
});
// User registration
router.post("/register", validateRegister, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: "Validation failed",
                error_ar: "فشل في التحقق من البيانات",
                error_fr: "Échec de la validation",
                details: errors.array(),
            });
        }
        const { phone, password, name, location, email } = req.body;
        // Check if user already exists
        const existingUser = await (0, database_1.query)("SELECT user_id FROM users WHERE phone = $1", [phone]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                error: "User already exists",
                error_ar: "المستخدم موجود بالفعل",
                error_fr: "L'utilisateur existe déjà",
            });
        }
        // Hash password
        const hashedPassword = await bcryptjs_1.default.hash(password, 12);
        // Create user
        const result = await (0, database_1.query)(`INSERT INTO users (
        phone, password_hash, name, email, type, is_guest,
        location_latitude, location_longitude, location_address
      ) VALUES ($1, $2, $3, $4, 'customer', false, $5, $6, $7)
      RETURNING user_id, phone, name, email, type`, [
            phone,
            hashedPassword,
            name,
            email || null,
            location.latitude,
            location.longitude,
            location.address,
        ]);
        const user = result.rows[0];
        const token = generateToken(user);
        res.status(201).json({
            message: "Registration successful",
            message_ar: "تم التسجيل بنجاح",
            message_fr: "Inscription réussie",
            token,
            user: {
                user_id: user.user_id,
                phone: user.phone,
                name: user.name,
                email: user.email,
                type: user.type,
                is_guest: false,
            },
        });
    }
    catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            error: "Registration failed",
            error_ar: "فشل في التسجيل",
            error_fr: "Échec de l'inscription",
        });
    }
});
// User login
router.post("/login", validateLogin, async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: "Validation failed",
                error_ar: "فشل في التحقق من البيانات",
                error_fr: "Échec de la validation",
                details: errors.array(),
            });
        }
        const { phone, password } = req.body;
        // Find user
        const result = await (0, database_1.query)(`SELECT user_id, phone, name, email, password_hash, type, is_active
       FROM users 
       WHERE phone = $1 AND is_guest = false`, [phone]);
        if (result.rows.length === 0) {
            return res.status(401).json({
                error: "Invalid credentials",
                error_ar: "بيانات الدخول غير صحيحة",
                error_fr: "Identifiants invalides",
            });
        }
        const user = result.rows[0];
        // Check if user is active
        if (!user.is_active) {
            return res.status(401).json({
                error: "Account is deactivated",
                error_ar: "الحساب معطل",
                error_fr: "Le compte est désactivé",
            });
        }
        // Verify password
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                error: "Invalid credentials",
                error_ar: "بيانات الدخول غير صحيحة",
                error_fr: "Identifiants invalides",
            });
        }
        const token = generateToken(user);
        res.json({
            message: "Login successful",
            message_ar: "تم تسجيل الدخول بنجاح",
            message_fr: "Connexion réussie",
            token,
            user: {
                user_id: user.user_id,
                phone: user.phone,
                name: user.name,
                email: user.email,
                type: user.type,
                is_guest: false,
            },
        });
    }
    catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            error: "Login failed",
            error_ar: "فشل في تسجيل الدخول",
            error_fr: "Échec de la connexion",
        });
    }
});
// Get user profile
router.get("/profile", authenticateToken, async (req, res) => {
    try {
        const result = await (0, database_1.query)(`SELECT user_id, phone, name, email, type, is_guest, is_active,
              location_latitude, location_longitude, location_address,
              created_at
       FROM users 
       WHERE user_id = $1`, [req.user.user_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "User not found",
                error_ar: "المستخدم غير موجود",
                error_fr: "Utilisateur non trouvé",
            });
        }
        const user = result.rows[0];
        res.json({
            user: {
                user_id: user.user_id,
                phone: user.phone,
                name: user.name,
                email: user.email,
                type: user.type,
                is_guest: user.is_guest,
                is_active: user.is_active,
                location: {
                    latitude: user.location_latitude,
                    longitude: user.location_longitude,
                    address: user.location_address,
                },
                created_at: user.created_at,
            },
        });
    }
    catch (error) {
        console.error("Profile fetch error:", error);
        res.status(500).json({
            error: "Failed to fetch profile",
            error_ar: "فشل في جلب الملف الشخصي",
            error_fr: "Échec de récupération du profil",
        });
    }
});
// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        res.status(401).json({
            error: "Access token required",
            error_ar: "رمز الوصول مطلوب",
            error_fr: "Jeton d'accès requis",
        });
        return;
    }
    jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "fallback_secret", (err, user) => {
        if (err) {
            res.status(403).json({
                error: "Invalid or expired token",
                error_ar: "رمز غير صحيح أو منتهي الصلاحية",
                error_fr: "Jeton invalide ou expiré",
            });
            return;
        }
        req.user = user;
        next();
    });
}
exports.authenticateToken = authenticateToken;
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9yb3V0ZXMvYXV0aC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxzREFBbUU7QUFDbkUsd0RBQThCO0FBQzlCLGdFQUErQjtBQUMvQix5REFBNEU7QUFDNUUsaURBQTJDO0FBRzNDLE1BQU0sTUFBTSxHQUFHLGlCQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7QUFpRmhDLHVCQUF1QjtBQUN2QixTQUFTLGFBQWEsQ0FBQyxJQUFVO0lBQy9CLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLGlCQUFpQixDQUFDO0lBQzNELE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLElBQUksQ0FBQztJQUVyRCxPQUFPLHNCQUFHLENBQUMsSUFBSSxDQUNiO1FBQ0UsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1FBQ3JCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7S0FDTixFQUNYLE1BQU0sRUFDTixFQUFFLFNBQVMsRUFBcUIsQ0FDakMsQ0FBQztBQUNKLENBQUM7QUFFRCx3QkFBd0I7QUFDeEIsTUFBTSxpQkFBaUIsR0FBRztJQUN4QixJQUFBLHdCQUFJLEVBQUMsT0FBTyxDQUFDO1NBQ1YsYUFBYSxDQUFDLE9BQU8sQ0FBQztTQUN0QixXQUFXLENBQUMsOEJBQThCLENBQUM7SUFDOUMsSUFBQSx3QkFBSSxFQUFDLG1CQUFtQixDQUFDO1NBQ3RCLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDOUIsV0FBVyxDQUFDLGtCQUFrQixDQUFDO0lBQ2xDLElBQUEsd0JBQUksRUFBQyxvQkFBb0IsQ0FBQztTQUN2QixPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO1NBQ2hDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQztJQUNuQyxJQUFBLHdCQUFJLEVBQUMsa0JBQWtCLENBQUM7U0FDckIsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7U0FDOUIsV0FBVyxDQUFDLGtDQUFrQyxDQUFDO0NBQ25ELENBQUM7QUFFRixNQUFNLGdCQUFnQixHQUFHO0lBQ3ZCLElBQUEsd0JBQUksRUFBQyxPQUFPLENBQUM7U0FDVixhQUFhLENBQUMsT0FBTyxDQUFDO1NBQ3RCLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQztJQUM5QyxJQUFBLHdCQUFJLEVBQUMsVUFBVSxDQUFDO1NBQ2IsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO1NBQ3BCLFdBQVcsQ0FBQyx3Q0FBd0MsQ0FBQztJQUN4RCxJQUFBLHdCQUFJLEVBQUMsTUFBTSxDQUFDO1NBQ1QsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUM7U0FDN0IsV0FBVyxDQUFDLDhCQUE4QixDQUFDO0lBQzlDLElBQUEsd0JBQUksRUFBQyxtQkFBbUIsQ0FBQztTQUN0QixPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDO1NBQzlCLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQztJQUNsQyxJQUFBLHdCQUFJLEVBQUMsb0JBQW9CLENBQUM7U0FDdkIsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQztTQUNoQyxXQUFXLENBQUMsbUJBQW1CLENBQUM7SUFDbkMsSUFBQSx3QkFBSSxFQUFDLGtCQUFrQixDQUFDO1NBQ3JCLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDO1NBQzlCLFdBQVcsQ0FBQyxrQ0FBa0MsQ0FBQztDQUNuRCxDQUFDO0FBRUYsTUFBTSxhQUFhLEdBQUc7SUFDcEIsSUFBQSx3QkFBSSxFQUFDLE9BQU8sQ0FBQztTQUNWLGFBQWEsQ0FBQyxPQUFPLENBQUM7U0FDdEIsV0FBVyxDQUFDLDhCQUE4QixDQUFDO0lBQzlDLElBQUEsd0JBQUksRUFBQyxVQUFVLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUM7Q0FDMUUsQ0FBQztBQUVGLDBDQUEwQztBQUMxQyxNQUFNLENBQUMsSUFBSSxDQUNULFFBQVEsRUFDUixpQkFBaUIsRUFDakIsS0FBSyxFQUFFLEdBQXFCLEVBQUUsR0FBYSxFQUE0QixFQUFFO0lBQ3ZFLElBQUksQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFHLElBQUEsb0NBQWdCLEVBQUMsR0FBRyxDQUFDLENBQUM7UUFDckMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLEtBQUssRUFBRSxtQkFBbUI7Z0JBQzFCLFFBQVEsRUFBRSwyQkFBMkI7Z0JBQ3JDLFFBQVEsRUFBRSx3QkFBd0I7Z0JBQ2xDLE9BQU8sRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFO2FBQ1AsQ0FBQyxDQUFDO1FBQ3RCLENBQUM7UUFFRCxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFFckMsK0JBQStCO1FBQy9CLE1BQU0sWUFBWSxHQUFzQixNQUFNLElBQUEsZ0JBQUssRUFDakQseURBQXlELEVBQ3pELENBQUMsS0FBSyxDQUFDLENBQ1IsQ0FBQztRQUVGLElBQUksSUFBVSxDQUFDO1FBQ2YsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxJQUFJLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5QixDQUFDO2FBQU0sQ0FBQztZQUNOLG9CQUFvQjtZQUNwQixNQUFNLE1BQU0sR0FBc0IsTUFBTSxJQUFBLGdCQUFLLEVBQzNDOzt3Q0FFOEIsRUFDOUIsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FDakUsQ0FBQztZQUNGLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLENBQUM7UUFFRCxNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbEMsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLE9BQU8sRUFBRSxpQ0FBaUM7WUFDMUMsVUFBVSxFQUFFLHVCQUF1QjtZQUNuQyxVQUFVLEVBQUUsaUNBQWlDO1lBQzdDLEtBQUs7WUFDTCxJQUFJLEVBQUU7Z0JBQ0osT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNyQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7Z0JBQ2pCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtnQkFDZixRQUFRLEVBQUUsSUFBSTthQUNmO1NBQ2MsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUsdUJBQXVCO1lBQzlCLFFBQVEsRUFBRSxnQkFBZ0I7WUFDMUIsUUFBUSxFQUFFLDZCQUE2QjtTQUN2QixDQUFDLENBQUM7SUFDdEIsQ0FBQztBQUNILENBQUMsQ0FDRixDQUFDO0FBRUYsb0JBQW9CO0FBQ3BCLE1BQU0sQ0FBQyxJQUFJLENBQ1QsV0FBVyxFQUNYLGdCQUFnQixFQUNoQixLQUFLLEVBQUUsR0FBb0IsRUFBRSxHQUFhLEVBQTRCLEVBQUU7SUFDdEUsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBQSxvQ0FBZ0IsRUFBQyxHQUFHLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDdEIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsUUFBUSxFQUFFLDJCQUEyQjtnQkFDckMsUUFBUSxFQUFFLHdCQUF3QjtnQkFDbEMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUU7YUFDUCxDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztRQUU1RCwrQkFBK0I7UUFDL0IsTUFBTSxZQUFZLEdBQXNCLE1BQU0sSUFBQSxnQkFBSyxFQUNqRCw0Q0FBNEMsRUFDNUMsQ0FBQyxLQUFLLENBQUMsQ0FDUixDQUFDO1FBRUYsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixLQUFLLEVBQUUscUJBQXFCO2dCQUM1QixRQUFRLEVBQUUsdUJBQXVCO2dCQUNqQyxRQUFRLEVBQUUsMkJBQTJCO2FBQ3JCLENBQUMsQ0FBQztRQUN0QixDQUFDO1FBRUQsZ0JBQWdCO1FBQ2hCLE1BQU0sY0FBYyxHQUFHLE1BQU0sa0JBQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXZELGNBQWM7UUFDZCxNQUFNLE1BQU0sR0FBc0IsTUFBTSxJQUFBLGdCQUFLLEVBQzNDOzs7O2tEQUkwQyxFQUMxQztZQUNFLEtBQUs7WUFDTCxjQUFjO1lBQ2QsSUFBSTtZQUNKLEtBQUssSUFBSSxJQUFJO1lBQ2IsUUFBUSxDQUFDLFFBQVE7WUFDakIsUUFBUSxDQUFDLFNBQVM7WUFDbEIsUUFBUSxDQUFDLE9BQU87U0FDakIsQ0FDRixDQUFDO1FBRUYsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1QixNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFbEMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsT0FBTyxFQUFFLHlCQUF5QjtZQUNsQyxVQUFVLEVBQUUsa0JBQWtCO1lBQzlCLFVBQVUsRUFBRSxxQkFBcUI7WUFDakMsS0FBSztZQUNMLElBQUksRUFBRTtnQkFDSixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3JCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLFFBQVEsRUFBRSxLQUFLO2FBQ2hCO1NBQ2MsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuQixLQUFLLEVBQUUscUJBQXFCO1lBQzVCLFFBQVEsRUFBRSxnQkFBZ0I7WUFDMUIsUUFBUSxFQUFFLHdCQUF3QjtTQUNsQixDQUFDLENBQUM7SUFDdEIsQ0FBQztBQUNILENBQUMsQ0FDRixDQUFDO0FBRUYsYUFBYTtBQUNiLE1BQU0sQ0FBQyxJQUFJLENBQ1QsUUFBUSxFQUNSLGFBQWEsRUFDYixLQUFLLEVBQUUsR0FBaUIsRUFBRSxHQUFhLEVBQTRCLEVBQUU7SUFDbkUsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBQSxvQ0FBZ0IsRUFBQyxHQUFHLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDdEIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLG1CQUFtQjtnQkFDMUIsUUFBUSxFQUFFLDJCQUEyQjtnQkFDckMsUUFBUSxFQUFFLHdCQUF3QjtnQkFDbEMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUU7YUFDUCxDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztRQUVyQyxZQUFZO1FBQ1osTUFBTSxNQUFNLEdBQXNCLE1BQU0sSUFBQSxnQkFBSyxFQUMzQzs7NkNBRXFDLEVBQ3JDLENBQUMsS0FBSyxDQUFDLENBQ1IsQ0FBQztRQUVGLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLHFCQUFxQjtnQkFDNUIsUUFBUSxFQUFFLHlCQUF5QjtnQkFDbkMsUUFBUSxFQUFFLHdCQUF3QjthQUNsQixDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFNUIsMEJBQTBCO1FBQzFCLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLHdCQUF3QjtnQkFDL0IsUUFBUSxFQUFFLGFBQWE7Z0JBQ3ZCLFFBQVEsRUFBRSx5QkFBeUI7YUFDbkIsQ0FBQyxDQUFDO1FBQ3RCLENBQUM7UUFFRCxrQkFBa0I7UUFDbEIsTUFBTSxlQUFlLEdBQUcsTUFBTSxrQkFBTSxDQUFDLE9BQU8sQ0FDMUMsUUFBUSxFQUNSLElBQUksQ0FBQyxhQUFjLENBQ3BCLENBQUM7UUFDRixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDckIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLHFCQUFxQjtnQkFDNUIsUUFBUSxFQUFFLHlCQUF5QjtnQkFDbkMsUUFBUSxFQUFFLHdCQUF3QjthQUNsQixDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVsQyxHQUFHLENBQUMsSUFBSSxDQUFDO1lBQ1AsT0FBTyxFQUFFLGtCQUFrQjtZQUMzQixVQUFVLEVBQUUsdUJBQXVCO1lBQ25DLFVBQVUsRUFBRSxtQkFBbUI7WUFDL0IsS0FBSztZQUNMLElBQUksRUFBRTtnQkFDSixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3JCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLFFBQVEsRUFBRSxLQUFLO2FBQ2hCO1NBQ2MsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDbkIsS0FBSyxFQUFFLGNBQWM7WUFDckIsUUFBUSxFQUFFLHFCQUFxQjtZQUMvQixRQUFRLEVBQUUsdUJBQXVCO1NBQ2pCLENBQUMsQ0FBQztJQUN0QixDQUFDO0FBQ0gsQ0FBQyxDQUNGLENBQUM7QUFFRixtQkFBbUI7QUFDbkIsTUFBTSxDQUFDLEdBQUcsQ0FDUixVQUFVLEVBQ1YsaUJBQWlCLEVBQ2pCLEtBQUssRUFBRSxHQUFZLEVBQUUsR0FBYSxFQUE0QixFQUFFO0lBQzlELElBQUksQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFzQixNQUFNLElBQUEsZ0JBQUssRUFDM0M7Ozs7MEJBSWtCLEVBQ2xCLENBQUMsR0FBRyxDQUFDLElBQUssQ0FBQyxPQUFPLENBQUMsQ0FDcEIsQ0FBQztRQUVGLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDMUIsS0FBSyxFQUFFLGdCQUFnQjtnQkFDdkIsUUFBUSxFQUFFLG9CQUFvQjtnQkFDOUIsUUFBUSxFQUFFLHdCQUF3QjthQUNsQixDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUIsR0FBRyxDQUFDLElBQUksQ0FBQztZQUNQLElBQUksRUFBRTtnQkFDSixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3JCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtnQkFDdkIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO2dCQUN6QixRQUFRLEVBQUU7b0JBQ1IsUUFBUSxFQUFFLElBQUksQ0FBQyxpQkFBaUI7b0JBQ2hDLFNBQVMsRUFBRSxJQUFJLENBQUMsa0JBQWtCO29CQUNsQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjtpQkFDL0I7Z0JBQ0QsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSx5QkFBeUI7WUFDaEMsUUFBUSxFQUFFLHlCQUF5QjtZQUNuQyxRQUFRLEVBQUUsaUNBQWlDO1NBQzNCLENBQUMsQ0FBQztJQUN0QixDQUFDO0FBQ0gsQ0FBQyxDQUNGLENBQUM7QUFFRix1Q0FBdUM7QUFDdkMsU0FBUyxpQkFBaUIsQ0FDeEIsR0FBWSxFQUNaLEdBQWEsRUFDYixJQUFrQjtJQUVsQixNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2hELE1BQU0sS0FBSyxHQUFHLFVBQVUsSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXJELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ25CLEtBQUssRUFBRSx1QkFBdUI7WUFDOUIsUUFBUSxFQUFFLGtCQUFrQjtZQUM1QixRQUFRLEVBQUUsc0JBQXNCO1NBQ2hCLENBQUMsQ0FBQztRQUNwQixPQUFPO0lBQ1QsQ0FBQztJQUVELHNCQUFHLENBQUMsTUFBTSxDQUNSLEtBQUssRUFDTCxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxpQkFBaUIsRUFDM0MsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7UUFDWixJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ1IsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQ25CLEtBQUssRUFBRSwwQkFBMEI7Z0JBQ2pDLFFBQVEsRUFBRSxnQ0FBZ0M7Z0JBQzFDLFFBQVEsRUFBRSwwQkFBMEI7YUFDcEIsQ0FBQyxDQUFDO1lBQ3BCLE9BQU87UUFDVCxDQUFDO1FBQ0QsR0FBRyxDQUFDLElBQUksR0FBRyxJQUFXLENBQUM7UUFDdkIsSUFBSSxFQUFFLENBQUM7SUFDVCxDQUFDLENBQ0YsQ0FBQztBQUNKLENBQUM7QUFHUSw4Q0FBaUI7QUFDMUIsa0JBQWUsTUFBTSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MsIHsgUmVxdWVzdCwgUmVzcG9uc2UsIE5leHRGdW5jdGlvbiB9IGZyb20gXCJleHByZXNzXCI7XG5pbXBvcnQgYmNyeXB0IGZyb20gXCJiY3J5cHRqc1wiO1xuaW1wb3J0IGp3dCBmcm9tIFwianNvbndlYnRva2VuXCI7XG5pbXBvcnQgeyBib2R5LCB2YWxpZGF0aW9uUmVzdWx0LCBWYWxpZGF0aW9uRXJyb3IgfSBmcm9tIFwiZXhwcmVzcy12YWxpZGF0b3JcIjtcbmltcG9ydCB7IHF1ZXJ5IH0gZnJvbSBcIi4uL2NvbmZpZy9kYXRhYmFzZVwiO1xuaW1wb3J0IHsgUXVlcnlSZXN1bHQgfSBmcm9tIFwicGdcIjtcblxuY29uc3Qgcm91dGVyID0gZXhwcmVzcy5Sb3V0ZXIoKTtcblxuLy8gVHlwZSBkZWZpbml0aW9uc1xuaW50ZXJmYWNlIFVzZXIge1xuICB1c2VyX2lkOiBzdHJpbmc7XG4gIHBob25lOiBzdHJpbmc7XG4gIG5hbWU/OiBzdHJpbmc7XG4gIGVtYWlsPzogc3RyaW5nO1xuICBwYXNzd29yZF9oYXNoPzogc3RyaW5nO1xuICB0eXBlOiBcImN1c3RvbWVyXCIgfCBcImFkbWluXCIgfCBcImRlbGl2ZXJ5XCIgfCBcIm1hbmFnZXJcIjtcbiAgaXNfZ3Vlc3Q6IGJvb2xlYW47XG4gIGlzX2FjdGl2ZTogYm9vbGVhbjtcbiAgbG9jYXRpb25fbGF0aXR1ZGU/OiBudW1iZXI7XG4gIGxvY2F0aW9uX2xvbmdpdHVkZT86IG51bWJlcjtcbiAgbG9jYXRpb25fYWRkcmVzcz86IHN0cmluZztcbiAgY3JlYXRlZF9hdDogRGF0ZTtcbiAgbGFzdF9sb2dpbj86IERhdGU7XG59XG5cbmludGVyZmFjZSBKd3RQYXlsb2FkIHtcbiAgdXNlcl9pZDogc3RyaW5nO1xuICBwaG9uZTogc3RyaW5nO1xuICB0eXBlOiBzdHJpbmc7XG4gIGlhdD86IG51bWJlcjtcbiAgZXhwPzogbnVtYmVyO1xufVxuXG4vLyBVc2luZyBleHRlbmRlZCBFeHByZXNzIFJlcXVlc3QgaW50ZXJmYWNlIGZyb20gdHlwZXMvZXhwcmVzcy5kLnRzXG5cbmludGVyZmFjZSBMb2NhdGlvbiB7XG4gIGxhdGl0dWRlOiBudW1iZXI7XG4gIGxvbmdpdHVkZTogbnVtYmVyO1xuICBhZGRyZXNzOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHdWVzdEF1dGhSZXF1ZXN0IGV4dGVuZHMgUmVxdWVzdCB7XG4gIGJvZHk6IHtcbiAgICBwaG9uZTogc3RyaW5nO1xuICAgIGxvY2F0aW9uOiBMb2NhdGlvbjtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIFJlZ2lzdGVyUmVxdWVzdCBleHRlbmRzIFJlcXVlc3Qge1xuICBib2R5OiB7XG4gICAgcGhvbmU6IHN0cmluZztcbiAgICBwYXNzd29yZDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICBsb2NhdGlvbjogTG9jYXRpb247XG4gIH07XG59XG5cbmludGVyZmFjZSBMb2dpblJlcXVlc3QgZXh0ZW5kcyBSZXF1ZXN0IHtcbiAgYm9keToge1xuICAgIHBob25lOiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ6IHN0cmluZztcbiAgfTtcbn1cblxuaW50ZXJmYWNlIEF1dGhSZXNwb25zZSB7XG4gIG1lc3NhZ2U6IHN0cmluZztcbiAgbWVzc2FnZV9hcjogc3RyaW5nO1xuICBtZXNzYWdlX2ZyOiBzdHJpbmc7XG4gIHRva2VuOiBzdHJpbmc7XG4gIHVzZXI6IHtcbiAgICB1c2VyX2lkOiBzdHJpbmc7XG4gICAgcGhvbmU6IHN0cmluZztcbiAgICBuYW1lPzogc3RyaW5nO1xuICAgIGVtYWlsPzogc3RyaW5nO1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBpc19ndWVzdDogYm9vbGVhbjtcbiAgfTtcbn1cblxuaW50ZXJmYWNlIEVycm9yUmVzcG9uc2Uge1xuICBlcnJvcjogc3RyaW5nO1xuICBlcnJvcl9hcjogc3RyaW5nO1xuICBlcnJvcl9mcjogc3RyaW5nO1xuICBkZXRhaWxzPzogVmFsaWRhdGlvbkVycm9yW107XG59XG5cbi8vIEpXVCB0b2tlbiBnZW5lcmF0aW9uXG5mdW5jdGlvbiBnZW5lcmF0ZVRva2VuKHVzZXI6IFVzZXIpOiBzdHJpbmcge1xuICBjb25zdCBzZWNyZXQgPSBwcm9jZXNzLmVudi5KV1RfU0VDUkVUIHx8IFwiZmFsbGJhY2tfc2VjcmV0XCI7XG4gIGNvbnN0IGV4cGlyZXNJbiA9IHByb2Nlc3MuZW52LkpXVF9FWFBJUkVTX0lOIHx8IFwiN2RcIjtcblxuICByZXR1cm4gand0LnNpZ24oXG4gICAge1xuICAgICAgdXNlcl9pZDogdXNlci51c2VyX2lkLFxuICAgICAgcGhvbmU6IHVzZXIucGhvbmUsXG4gICAgICB0eXBlOiB1c2VyLnR5cGUsXG4gICAgfSBhcyBvYmplY3QsXG4gICAgc2VjcmV0LFxuICAgIHsgZXhwaXJlc0luIH0gYXMgand0LlNpZ25PcHRpb25zXG4gICk7XG59XG5cbi8vIFZhbGlkYXRpb24gbWlkZGxld2FyZVxuY29uc3QgdmFsaWRhdGVHdWVzdEF1dGggPSBbXG4gIGJvZHkoXCJwaG9uZVwiKVxuICAgIC5pc01vYmlsZVBob25lKFwiYXItTUFcIilcbiAgICAud2l0aE1lc3NhZ2UoXCJJbnZhbGlkIE1vcm9jY28gcGhvbmUgbnVtYmVyXCIpLFxuICBib2R5KFwibG9jYXRpb24ubGF0aXR1ZGVcIilcbiAgICAuaXNGbG9hdCh7IG1pbjogLTkwLCBtYXg6IDkwIH0pXG4gICAgLndpdGhNZXNzYWdlKFwiSW52YWxpZCBsYXRpdHVkZVwiKSxcbiAgYm9keShcImxvY2F0aW9uLmxvbmdpdHVkZVwiKVxuICAgIC5pc0Zsb2F0KHsgbWluOiAtMTgwLCBtYXg6IDE4MCB9KVxuICAgIC53aXRoTWVzc2FnZShcIkludmFsaWQgbG9uZ2l0dWRlXCIpLFxuICBib2R5KFwibG9jYXRpb24uYWRkcmVzc1wiKVxuICAgIC5pc0xlbmd0aCh7IG1pbjogNSwgbWF4OiAyMDAgfSlcbiAgICAud2l0aE1lc3NhZ2UoXCJBZGRyZXNzIG11c3QgYmUgNS0yMDAgY2hhcmFjdGVyc1wiKSxcbl07XG5cbmNvbnN0IHZhbGlkYXRlUmVnaXN0ZXIgPSBbXG4gIGJvZHkoXCJwaG9uZVwiKVxuICAgIC5pc01vYmlsZVBob25lKFwiYXItTUFcIilcbiAgICAud2l0aE1lc3NhZ2UoXCJJbnZhbGlkIE1vcm9jY28gcGhvbmUgbnVtYmVyXCIpLFxuICBib2R5KFwicGFzc3dvcmRcIilcbiAgICAuaXNMZW5ndGgoeyBtaW46IDYgfSlcbiAgICAud2l0aE1lc3NhZ2UoXCJQYXNzd29yZCBtdXN0IGJlIGF0IGxlYXN0IDYgY2hhcmFjdGVyc1wiKSxcbiAgYm9keShcIm5hbWVcIilcbiAgICAuaXNMZW5ndGgoeyBtaW46IDIsIG1heDogNTAgfSlcbiAgICAud2l0aE1lc3NhZ2UoXCJOYW1lIG11c3QgYmUgMi01MCBjaGFyYWN0ZXJzXCIpLFxuICBib2R5KFwibG9jYXRpb24ubGF0aXR1ZGVcIilcbiAgICAuaXNGbG9hdCh7IG1pbjogLTkwLCBtYXg6IDkwIH0pXG4gICAgLndpdGhNZXNzYWdlKFwiSW52YWxpZCBsYXRpdHVkZVwiKSxcbiAgYm9keShcImxvY2F0aW9uLmxvbmdpdHVkZVwiKVxuICAgIC5pc0Zsb2F0KHsgbWluOiAtMTgwLCBtYXg6IDE4MCB9KVxuICAgIC53aXRoTWVzc2FnZShcIkludmFsaWQgbG9uZ2l0dWRlXCIpLFxuICBib2R5KFwibG9jYXRpb24uYWRkcmVzc1wiKVxuICAgIC5pc0xlbmd0aCh7IG1pbjogNSwgbWF4OiAyMDAgfSlcbiAgICAud2l0aE1lc3NhZ2UoXCJBZGRyZXNzIG11c3QgYmUgNS0yMDAgY2hhcmFjdGVyc1wiKSxcbl07XG5cbmNvbnN0IHZhbGlkYXRlTG9naW4gPSBbXG4gIGJvZHkoXCJwaG9uZVwiKVxuICAgIC5pc01vYmlsZVBob25lKFwiYXItTUFcIilcbiAgICAud2l0aE1lc3NhZ2UoXCJJbnZhbGlkIE1vcm9jY28gcGhvbmUgbnVtYmVyXCIpLFxuICBib2R5KFwicGFzc3dvcmRcIikuaXNMZW5ndGgoeyBtaW46IDEgfSkud2l0aE1lc3NhZ2UoXCJQYXNzd29yZCBpcyByZXF1aXJlZFwiKSxcbl07XG5cbi8vIEd1ZXN0IGF1dGhlbnRpY2F0aW9uIGZvciBxdWljayBjaGVja291dFxucm91dGVyLnBvc3QoXG4gIFwiL2d1ZXN0XCIsXG4gIHZhbGlkYXRlR3Vlc3RBdXRoLFxuICBhc3luYyAocmVxOiBHdWVzdEF1dGhSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZXJyb3JzID0gdmFsaWRhdGlvblJlc3VsdChyZXEpO1xuICAgICAgaWYgKCFlcnJvcnMuaXNFbXB0eSgpKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIixcbiAgICAgICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYp9mE2KrYrdmC2YIg2YXZhiDYp9mE2KjZitin2YbYp9iqXCIsXG4gICAgICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIGxhIHZhbGlkYXRpb25cIixcbiAgICAgICAgICBkZXRhaWxzOiBlcnJvcnMuYXJyYXkoKSxcbiAgICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgeyBwaG9uZSwgbG9jYXRpb24gfSA9IHJlcS5ib2R5O1xuXG4gICAgICAvLyBDaGVjayBpZiB1c2VyIGFscmVhZHkgZXhpc3RzXG4gICAgICBjb25zdCBleGlzdGluZ1VzZXI6IFF1ZXJ5UmVzdWx0PFVzZXI+ID0gYXdhaXQgcXVlcnkoXG4gICAgICAgIFwiU0VMRUNUIHVzZXJfaWQsIHBob25lLCB0eXBlIEZST00gdXNlcnMgV0hFUkUgcGhvbmUgPSAkMVwiLFxuICAgICAgICBbcGhvbmVdXG4gICAgICApO1xuXG4gICAgICBsZXQgdXNlcjogVXNlcjtcbiAgICAgIGlmIChleGlzdGluZ1VzZXIucm93cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHVzZXIgPSBleGlzdGluZ1VzZXIucm93c1swXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIENyZWF0ZSBndWVzdCB1c2VyXG4gICAgICAgIGNvbnN0IHJlc3VsdDogUXVlcnlSZXN1bHQ8VXNlcj4gPSBhd2FpdCBxdWVyeShcbiAgICAgICAgICBgSU5TRVJUIElOVE8gdXNlcnMgKHBob25lLCB0eXBlLCBpc19ndWVzdCwgbG9jYXRpb25fbGF0aXR1ZGUsIGxvY2F0aW9uX2xvbmdpdHVkZSwgbG9jYXRpb25fYWRkcmVzcylcbiAgICAgICAgIFZBTFVFUyAoJDEsICdjdXN0b21lcicsIHRydWUsICQyLCAkMywgJDQpXG4gICAgICAgICBSRVRVUk5JTkcgdXNlcl9pZCwgcGhvbmUsIHR5cGVgLFxuICAgICAgICAgIFtwaG9uZSwgbG9jYXRpb24ubGF0aXR1ZGUsIGxvY2F0aW9uLmxvbmdpdHVkZSwgbG9jYXRpb24uYWRkcmVzc11cbiAgICAgICAgKTtcbiAgICAgICAgdXNlciA9IHJlc3VsdC5yb3dzWzBdO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b2tlbiA9IGdlbmVyYXRlVG9rZW4odXNlcik7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgbWVzc2FnZTogXCJHdWVzdCBhdXRoZW50aWNhdGlvbiBzdWNjZXNzZnVsXCIsXG4gICAgICAgIG1lc3NhZ2VfYXI6IFwi2KrZhSDYp9mE2KrZiNir2YrZgiDZg9i22YrZgSDYqNmG2KzYp9itXCIsXG4gICAgICAgIG1lc3NhZ2VfZnI6IFwiQXV0aGVudGlmaWNhdGlvbiBpbnZpdMOpIHLDqXVzc2llXCIsXG4gICAgICAgIHRva2VuLFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgdXNlcl9pZDogdXNlci51c2VyX2lkLFxuICAgICAgICAgIHBob25lOiB1c2VyLnBob25lLFxuICAgICAgICAgIHR5cGU6IHVzZXIudHlwZSxcbiAgICAgICAgICBpc19ndWVzdDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0gYXMgQXV0aFJlc3BvbnNlKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkd1ZXN0IGF1dGggZXJyb3I6XCIsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IFwiQXV0aGVudGljYXRpb24gZmFpbGVkXCIsXG4gICAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINin2YTYqtmI2KvZitmCXCIsXG4gICAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSBsJ2F1dGhlbnRpZmljYXRpb25cIixcbiAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgfVxuICB9XG4pO1xuXG4vLyBVc2VyIHJlZ2lzdHJhdGlvblxucm91dGVyLnBvc3QoXG4gIFwiL3JlZ2lzdGVyXCIsXG4gIHZhbGlkYXRlUmVnaXN0ZXIsXG4gIGFzeW5jIChyZXE6IFJlZ2lzdGVyUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGVycm9ycyA9IHZhbGlkYXRpb25SZXN1bHQocmVxKTtcbiAgICAgIGlmICghZXJyb3JzLmlzRW1wdHkoKSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsXG4gICAgICAgICAgZXJyb3JfYXI6IFwi2YHYtNmEINmB2Yog2KfZhNiq2K3ZgtmCINmF2YYg2KfZhNio2YrYp9mG2KfYqlwiLFxuICAgICAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSBsYSB2YWxpZGF0aW9uXCIsXG4gICAgICAgICAgZGV0YWlsczogZXJyb3JzLmFycmF5KCksXG4gICAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHsgcGhvbmUsIHBhc3N3b3JkLCBuYW1lLCBsb2NhdGlvbiwgZW1haWwgfSA9IHJlcS5ib2R5O1xuXG4gICAgICAvLyBDaGVjayBpZiB1c2VyIGFscmVhZHkgZXhpc3RzXG4gICAgICBjb25zdCBleGlzdGluZ1VzZXI6IFF1ZXJ5UmVzdWx0PFVzZXI+ID0gYXdhaXQgcXVlcnkoXG4gICAgICAgIFwiU0VMRUNUIHVzZXJfaWQgRlJPTSB1c2VycyBXSEVSRSBwaG9uZSA9ICQxXCIsXG4gICAgICAgIFtwaG9uZV1cbiAgICAgICk7XG5cbiAgICAgIGlmIChleGlzdGluZ1VzZXIucm93cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwOSkuanNvbih7XG4gICAgICAgICAgZXJyb3I6IFwiVXNlciBhbHJlYWR5IGV4aXN0c1wiLFxuICAgICAgICAgIGVycm9yX2FyOiBcItin2YTZhdiz2KrYrtiv2YUg2YXZiNis2YjYryDYqNin2YTZgdi52YRcIixcbiAgICAgICAgICBlcnJvcl9mcjogXCJMJ3V0aWxpc2F0ZXVyIGV4aXN0ZSBkw6lqw6BcIixcbiAgICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gSGFzaCBwYXNzd29yZFxuICAgICAgY29uc3QgaGFzaGVkUGFzc3dvcmQgPSBhd2FpdCBiY3J5cHQuaGFzaChwYXNzd29yZCwgMTIpO1xuXG4gICAgICAvLyBDcmVhdGUgdXNlclxuICAgICAgY29uc3QgcmVzdWx0OiBRdWVyeVJlc3VsdDxVc2VyPiA9IGF3YWl0IHF1ZXJ5KFxuICAgICAgICBgSU5TRVJUIElOVE8gdXNlcnMgKFxuICAgICAgICBwaG9uZSwgcGFzc3dvcmRfaGFzaCwgbmFtZSwgZW1haWwsIHR5cGUsIGlzX2d1ZXN0LFxuICAgICAgICBsb2NhdGlvbl9sYXRpdHVkZSwgbG9jYXRpb25fbG9uZ2l0dWRlLCBsb2NhdGlvbl9hZGRyZXNzXG4gICAgICApIFZBTFVFUyAoJDEsICQyLCAkMywgJDQsICdjdXN0b21lcicsIGZhbHNlLCAkNSwgJDYsICQ3KVxuICAgICAgUkVUVVJOSU5HIHVzZXJfaWQsIHBob25lLCBuYW1lLCBlbWFpbCwgdHlwZWAsXG4gICAgICAgIFtcbiAgICAgICAgICBwaG9uZSxcbiAgICAgICAgICBoYXNoZWRQYXNzd29yZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICAgIGVtYWlsIHx8IG51bGwsXG4gICAgICAgICAgbG9jYXRpb24ubGF0aXR1ZGUsXG4gICAgICAgICAgbG9jYXRpb24ubG9uZ2l0dWRlLFxuICAgICAgICAgIGxvY2F0aW9uLmFkZHJlc3MsXG4gICAgICAgIF1cbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHQucm93c1swXTtcbiAgICAgIGNvbnN0IHRva2VuID0gZ2VuZXJhdGVUb2tlbih1c2VyKTtcblxuICAgICAgcmVzLnN0YXR1cygyMDEpLmpzb24oe1xuICAgICAgICBtZXNzYWdlOiBcIlJlZ2lzdHJhdGlvbiBzdWNjZXNzZnVsXCIsXG4gICAgICAgIG1lc3NhZ2VfYXI6IFwi2KrZhSDYp9mE2KrYs9is2YrZhCDYqNmG2KzYp9itXCIsXG4gICAgICAgIG1lc3NhZ2VfZnI6IFwiSW5zY3JpcHRpb24gcsOpdXNzaWVcIixcbiAgICAgICAgdG9rZW4sXG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICB1c2VyX2lkOiB1c2VyLnVzZXJfaWQsXG4gICAgICAgICAgcGhvbmU6IHVzZXIucGhvbmUsXG4gICAgICAgICAgbmFtZTogdXNlci5uYW1lLFxuICAgICAgICAgIGVtYWlsOiB1c2VyLmVtYWlsLFxuICAgICAgICAgIHR5cGU6IHVzZXIudHlwZSxcbiAgICAgICAgICBpc19ndWVzdDogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICB9IGFzIEF1dGhSZXNwb25zZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJSZWdpc3RyYXRpb24gZXJyb3I6XCIsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IFwiUmVnaXN0cmF0aW9uIGZhaWxlZFwiLFxuICAgICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYp9mE2KrYs9is2YrZhFwiLFxuICAgICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgbCdpbnNjcmlwdGlvblwiLFxuICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICB9XG4gIH1cbik7XG5cbi8vIFVzZXIgbG9naW5cbnJvdXRlci5wb3N0KFxuICBcIi9sb2dpblwiLFxuICB2YWxpZGF0ZUxvZ2luLFxuICBhc3luYyAocmVxOiBMb2dpblJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBlcnJvcnMgPSB2YWxpZGF0aW9uUmVzdWx0KHJlcSk7XG4gICAgICBpZiAoIWVycm9ycy5pc0VtcHR5KCkpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLFxuICAgICAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINin2YTYqtit2YLZgiDZhdmGINin2YTYqNmK2KfZhtin2KpcIixcbiAgICAgICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgbGEgdmFsaWRhdGlvblwiLFxuICAgICAgICAgIGRldGFpbHM6IGVycm9ycy5hcnJheSgpLFxuICAgICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB7IHBob25lLCBwYXNzd29yZCB9ID0gcmVxLmJvZHk7XG5cbiAgICAgIC8vIEZpbmQgdXNlclxuICAgICAgY29uc3QgcmVzdWx0OiBRdWVyeVJlc3VsdDxVc2VyPiA9IGF3YWl0IHF1ZXJ5KFxuICAgICAgICBgU0VMRUNUIHVzZXJfaWQsIHBob25lLCBuYW1lLCBlbWFpbCwgcGFzc3dvcmRfaGFzaCwgdHlwZSwgaXNfYWN0aXZlXG4gICAgICAgRlJPTSB1c2VycyBcbiAgICAgICBXSEVSRSBwaG9uZSA9ICQxIEFORCBpc19ndWVzdCA9IGZhbHNlYCxcbiAgICAgICAgW3Bob25lXVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDEpLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIkludmFsaWQgY3JlZGVudGlhbHNcIixcbiAgICAgICAgICBlcnJvcl9hcjogXCLYqNmK2KfZhtin2Kog2KfZhNiv2K7ZiNmEINi62YrYsSDYtdit2YrYrdipXCIsXG4gICAgICAgICAgZXJyb3JfZnI6IFwiSWRlbnRpZmlhbnRzIGludmFsaWRlc1wiLFxuICAgICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0LnJvd3NbMF07XG5cbiAgICAgIC8vIENoZWNrIGlmIHVzZXIgaXMgYWN0aXZlXG4gICAgICBpZiAoIXVzZXIuaXNfYWN0aXZlKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMSkuanNvbih7XG4gICAgICAgICAgZXJyb3I6IFwiQWNjb3VudCBpcyBkZWFjdGl2YXRlZFwiLFxuICAgICAgICAgIGVycm9yX2FyOiBcItin2YTYrdiz2KfYqCDZhdi52LfZhFwiLFxuICAgICAgICAgIGVycm9yX2ZyOiBcIkxlIGNvbXB0ZSBlc3QgZMOpc2FjdGl2w6lcIixcbiAgICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gVmVyaWZ5IHBhc3N3b3JkXG4gICAgICBjb25zdCBpc1ZhbGlkUGFzc3dvcmQgPSBhd2FpdCBiY3J5cHQuY29tcGFyZShcbiAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgIHVzZXIucGFzc3dvcmRfaGFzaCFcbiAgICAgICk7XG4gICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDEpLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIkludmFsaWQgY3JlZGVudGlhbHNcIixcbiAgICAgICAgICBlcnJvcl9hcjogXCLYqNmK2KfZhtin2Kog2KfZhNiv2K7ZiNmEINi62YrYsSDYtdit2YrYrdipXCIsXG4gICAgICAgICAgZXJyb3JfZnI6IFwiSWRlbnRpZmlhbnRzIGludmFsaWRlc1wiLFxuICAgICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB0b2tlbiA9IGdlbmVyYXRlVG9rZW4odXNlcik7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgbWVzc2FnZTogXCJMb2dpbiBzdWNjZXNzZnVsXCIsXG4gICAgICAgIG1lc3NhZ2VfYXI6IFwi2KrZhSDYqtiz2KzZitmEINin2YTYr9iu2YjZhCDYqNmG2KzYp9itXCIsXG4gICAgICAgIG1lc3NhZ2VfZnI6IFwiQ29ubmV4aW9uIHLDqXVzc2llXCIsXG4gICAgICAgIHRva2VuLFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgdXNlcl9pZDogdXNlci51c2VyX2lkLFxuICAgICAgICAgIHBob25lOiB1c2VyLnBob25lLFxuICAgICAgICAgIG5hbWU6IHVzZXIubmFtZSxcbiAgICAgICAgICBlbWFpbDogdXNlci5lbWFpbCxcbiAgICAgICAgICB0eXBlOiB1c2VyLnR5cGUsXG4gICAgICAgICAgaXNfZ3Vlc3Q6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSBhcyBBdXRoUmVzcG9uc2UpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiTG9naW4gZXJyb3I6XCIsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IFwiTG9naW4gZmFpbGVkXCIsXG4gICAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINiq2LPYrNmK2YQg2KfZhNiv2K7ZiNmEXCIsXG4gICAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSBsYSBjb25uZXhpb25cIixcbiAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgfVxuICB9XG4pO1xuXG4vLyBHZXQgdXNlciBwcm9maWxlXG5yb3V0ZXIuZ2V0KFxuICBcIi9wcm9maWxlXCIsXG4gIGF1dGhlbnRpY2F0ZVRva2VuLFxuICBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0OiBRdWVyeVJlc3VsdDxVc2VyPiA9IGF3YWl0IHF1ZXJ5KFxuICAgICAgICBgU0VMRUNUIHVzZXJfaWQsIHBob25lLCBuYW1lLCBlbWFpbCwgdHlwZSwgaXNfZ3Vlc3QsIGlzX2FjdGl2ZSxcbiAgICAgICAgICAgICAgbG9jYXRpb25fbGF0aXR1ZGUsIGxvY2F0aW9uX2xvbmdpdHVkZSwgbG9jYXRpb25fYWRkcmVzcyxcbiAgICAgICAgICAgICAgY3JlYXRlZF9hdFxuICAgICAgIEZST00gdXNlcnMgXG4gICAgICAgV0hFUkUgdXNlcl9pZCA9ICQxYCxcbiAgICAgICAgW3JlcS51c2VyIS51c2VyX2lkXVxuICAgICAgKTtcblxuICAgICAgaWYgKHJlc3VsdC5yb3dzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIlVzZXIgbm90IGZvdW5kXCIsXG4gICAgICAgICAgZXJyb3JfYXI6IFwi2KfZhNmF2LPYqtiu2K/ZhSDYutmK2LEg2YXZiNis2YjYr1wiLFxuICAgICAgICAgIGVycm9yX2ZyOiBcIlV0aWxpc2F0ZXVyIG5vbiB0cm91dsOpXCIsXG4gICAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHQucm93c1swXTtcbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIHVzZXJfaWQ6IHVzZXIudXNlcl9pZCxcbiAgICAgICAgICBwaG9uZTogdXNlci5waG9uZSxcbiAgICAgICAgICBuYW1lOiB1c2VyLm5hbWUsXG4gICAgICAgICAgZW1haWw6IHVzZXIuZW1haWwsXG4gICAgICAgICAgdHlwZTogdXNlci50eXBlLFxuICAgICAgICAgIGlzX2d1ZXN0OiB1c2VyLmlzX2d1ZXN0LFxuICAgICAgICAgIGlzX2FjdGl2ZTogdXNlci5pc19hY3RpdmUsXG4gICAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICAgIGxhdGl0dWRlOiB1c2VyLmxvY2F0aW9uX2xhdGl0dWRlLFxuICAgICAgICAgICAgbG9uZ2l0dWRlOiB1c2VyLmxvY2F0aW9uX2xvbmdpdHVkZSxcbiAgICAgICAgICAgIGFkZHJlc3M6IHVzZXIubG9jYXRpb25fYWRkcmVzcyxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGNyZWF0ZWRfYXQ6IHVzZXIuY3JlYXRlZF9hdCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUHJvZmlsZSBmZXRjaCBlcnJvcjpcIiwgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogXCJGYWlsZWQgdG8gZmV0Y2ggcHJvZmlsZVwiLFxuICAgICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYrNmE2Kgg2KfZhNmF2YTZgSDYp9mE2LTYrti12YpcIixcbiAgICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIHLDqWN1cMOpcmF0aW9uIGR1IHByb2ZpbFwiLFxuICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICB9XG4gIH1cbik7XG5cbi8vIE1pZGRsZXdhcmUgdG8gYXV0aGVudGljYXRlIEpXVCB0b2tlblxuZnVuY3Rpb24gYXV0aGVudGljYXRlVG9rZW4oXG4gIHJlcTogUmVxdWVzdCxcbiAgcmVzOiBSZXNwb25zZSxcbiAgbmV4dDogTmV4dEZ1bmN0aW9uXG4pOiB2b2lkIHtcbiAgY29uc3QgYXV0aEhlYWRlciA9IHJlcS5oZWFkZXJzW1wiYXV0aG9yaXphdGlvblwiXTtcbiAgY29uc3QgdG9rZW4gPSBhdXRoSGVhZGVyICYmIGF1dGhIZWFkZXIuc3BsaXQoXCIgXCIpWzFdO1xuXG4gIGlmICghdG9rZW4pIHtcbiAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7XG4gICAgICBlcnJvcjogXCJBY2Nlc3MgdG9rZW4gcmVxdWlyZWRcIixcbiAgICAgIGVycm9yX2FyOiBcItix2YXYsiDYp9mE2YjYtdmI2YQg2YXYt9mE2YjYqFwiLFxuICAgICAgZXJyb3JfZnI6IFwiSmV0b24gZCdhY2PDqHMgcmVxdWlzXCIsXG4gICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBqd3QudmVyaWZ5KFxuICAgIHRva2VuLFxuICAgIHByb2Nlc3MuZW52LkpXVF9TRUNSRVQgfHwgXCJmYWxsYmFja19zZWNyZXRcIixcbiAgICAoZXJyLCB1c2VyKSA9PiB7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDAzKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogXCJJbnZhbGlkIG9yIGV4cGlyZWQgdG9rZW5cIixcbiAgICAgICAgICBlcnJvcl9hcjogXCLYsdmF2LIg2LrZitixINi12K3ZititINij2Ygg2YXZhtiq2YfZiiDYp9mE2LXZhNin2K3ZitipXCIsXG4gICAgICAgICAgZXJyb3JfZnI6IFwiSmV0b24gaW52YWxpZGUgb3UgZXhwaXLDqVwiLFxuICAgICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByZXEudXNlciA9IHVzZXIgYXMgYW55O1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgKTtcbn1cblxuLy8gRXhwb3J0IG1pZGRsZXdhcmUgZm9yIHVzZSBpbiBvdGhlciByb3V0ZXNcbmV4cG9ydCB7IGF1dGhlbnRpY2F0ZVRva2VuIH07XG5leHBvcnQgZGVmYXVsdCByb3V0ZXI7XG4iXX0=