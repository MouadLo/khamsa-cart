"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
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
exports.default = router;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9yb3V0ZXMvYXV0aC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQWtkUyw4Q0FBaUI7QUFsZDFCLHNEQUFtRTtBQUNuRSx3REFBOEI7QUFDOUIsZ0VBQStCO0FBQy9CLHlEQUE0RTtBQUM1RSxpREFBMkM7QUFHM0MsTUFBTSxNQUFNLEdBQUcsaUJBQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQWlGaEMsdUJBQXVCO0FBQ3ZCLFNBQVMsYUFBYSxDQUFDLElBQVU7SUFDL0IsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksaUJBQWlCLENBQUM7SUFDM0QsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDO0lBRXJELE9BQU8sc0JBQUcsQ0FBQyxJQUFJLENBQ2I7UUFDRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87UUFDckIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQ2pCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtLQUNOLEVBQ1gsTUFBTSxFQUNOLEVBQUUsU0FBUyxFQUFxQixDQUNqQyxDQUFDO0FBQ0osQ0FBQztBQUVELHdCQUF3QjtBQUN4QixNQUFNLGlCQUFpQixHQUFHO0lBQ3hCLElBQUEsd0JBQUksRUFBQyxPQUFPLENBQUM7U0FDVixhQUFhLENBQUMsT0FBTyxDQUFDO1NBQ3RCLFdBQVcsQ0FBQyw4QkFBOEIsQ0FBQztJQUM5QyxJQUFBLHdCQUFJLEVBQUMsbUJBQW1CLENBQUM7U0FDdEIsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUM5QixXQUFXLENBQUMsa0JBQWtCLENBQUM7SUFDbEMsSUFBQSx3QkFBSSxFQUFDLG9CQUFvQixDQUFDO1NBQ3ZCLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFB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bkIsS0FBSyxFQUFFLDBCQUEwQjtnQkFDakMsUUFBUSxFQUFFLGdDQUFnQztnQkFDMUMsUUFBUSxFQUFFLDBCQUEwQjthQUNwQixDQUFDLENBQUM7WUFDcEIsT0FBTztRQUNULENBQUM7UUFDRCxHQUFHLENBQUMsSUFBSSxHQUFHLElBQVcsQ0FBQztRQUN2QixJQUFJLEVBQUUsQ0FBQztJQUNULENBQUMsQ0FDRixDQUFDO0FBQ0osQ0FBQztBQUlELGtCQUFlLE1BQU0sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlLCBOZXh0RnVuY3Rpb24gfSBmcm9tIFwiZXhwcmVzc1wiO1xuaW1wb3J0IGJjcnlwdCBmcm9tIFwiYmNyeXB0anNcIjtcbmltcG9ydCBqd3QgZnJvbSBcImpzb253ZWJ0b2tlblwiO1xuaW1wb3J0IHsgYm9keSwgdmFsaWRhdGlvblJlc3VsdCwgVmFsaWRhdGlvbkVycm9yIH0gZnJvbSBcImV4cHJlc3MtdmFsaWRhdG9yXCI7XG5pbXBvcnQgeyBxdWVyeSB9IGZyb20gXCIuLi9jb25maWcvZGF0YWJhc2VcIjtcbmltcG9ydCB7IFF1ZXJ5UmVzdWx0IH0gZnJvbSBcInBnXCI7XG5cbmNvbnN0IHJvdXRlciA9IGV4cHJlc3MuUm91dGVyKCk7XG5cbi8vIFR5cGUgZGVmaW5pdGlvbnNcbmludGVyZmFjZSBVc2VyIHtcbiAgdXNlcl9pZDogc3RyaW5nO1xuICBwaG9uZTogc3RyaW5nO1xuICBuYW1lPzogc3RyaW5nO1xuICBlbWFpbD86IHN0cmluZztcbiAgcGFzc3dvcmRfaGFzaD86IHN0cmluZztcbiAgdHlwZTogXCJjdXN0b21lclwiIHwgXCJhZG1pblwiIHwgXCJkZWxpdmVyeVwiIHwgXCJtYW5hZ2VyXCI7XG4gIGlzX2d1ZXN0OiBib29sZWFuO1xuICBpc19hY3RpdmU6IGJvb2xlYW47XG4gIGxvY2F0aW9uX2xhdGl0dWRlPzogbnVtYmVyO1xuICBsb2NhdGlvbl9sb25naXR1ZGU/OiBudW1iZXI7XG4gIGxvY2F0aW9uX2FkZHJlc3M/OiBzdHJpbmc7XG4gIGNyZWF0ZWRfYXQ6IERhdGU7XG4gIGxhc3RfbG9naW4/OiBEYXRlO1xufVxuXG5pbnRlcmZhY2UgSnd0UGF5bG9hZCB7XG4gIHVzZXJfaWQ6IHN0cmluZztcbiAgcGhvbmU6IHN0cmluZztcbiAgdHlwZTogc3RyaW5nO1xuICBpYXQ/OiBudW1iZXI7XG4gIGV4cD86IG51bWJlcjtcbn1cblxuLy8gVXNpbmcgZXh0ZW5kZWQgRXhwcmVzcyBSZXF1ZXN0IGludGVyZmFjZSBmcm9tIHR5cGVzL2V4cHJlc3MuZC50c1xuXG5pbnRlcmZhY2UgTG9jYXRpb24ge1xuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgYWRkcmVzczogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR3Vlc3RBdXRoUmVxdWVzdCBleHRlbmRzIFJlcXVlc3Qge1xuICBib2R5OiB7XG4gICAgcGhvbmU6IHN0cmluZztcbiAgICBsb2NhdGlvbjogTG9jYXRpb247XG4gIH07XG59XG5cbmludGVyZmFjZSBSZWdpc3RlclJlcXVlc3QgZXh0ZW5kcyBSZXF1ZXN0IHtcbiAgYm9keToge1xuICAgIHBob25lOiBzdHJpbmc7XG4gICAgcGFzc3dvcmQ6IHN0cmluZztcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgZW1haWw/OiBzdHJpbmc7XG4gICAgbG9jYXRpb246IExvY2F0aW9uO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgTG9naW5SZXF1ZXN0IGV4dGVuZHMgUmVxdWVzdCB7XG4gIGJvZHk6IHtcbiAgICBwaG9uZTogc3RyaW5nO1xuICAgIHBhc3N3b3JkOiBzdHJpbmc7XG4gIH07XG59XG5cbmludGVyZmFjZSBBdXRoUmVzcG9uc2Uge1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIG1lc3NhZ2VfYXI6IHN0cmluZztcbiAgbWVzc2FnZV9mcjogc3RyaW5nO1xuICB0b2tlbjogc3RyaW5nO1xuICB1c2VyOiB7XG4gICAgdXNlcl9pZDogc3RyaW5nO1xuICAgIHBob25lOiBzdHJpbmc7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICBlbWFpbD86IHN0cmluZztcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgaXNfZ3Vlc3Q6IGJvb2xlYW47XG4gIH07XG59XG5cbmludGVyZmFjZSBFcnJvclJlc3BvbnNlIHtcbiAgZXJyb3I6IHN0cmluZztcbiAgZXJyb3JfYXI6IHN0cmluZztcbiAgZXJyb3JfZnI6IHN0cmluZztcbiAgZGV0YWlscz86IFZhbGlkYXRpb25FcnJvcltdO1xufVxuXG4vLyBKV1QgdG9rZW4gZ2VuZXJhdGlvblxuZnVuY3Rpb24gZ2VuZXJhdGVUb2tlbih1c2VyOiBVc2VyKTogc3RyaW5nIHtcbiAgY29uc3Qgc2VjcmV0ID0gcHJvY2Vzcy5lbnYuSldUX1NFQ1JFVCB8fCBcImZhbGxiYWNrX3NlY3JldFwiO1xuICBjb25zdCBleHBpcmVzSW4gPSBwcm9jZXNzLmVudi5KV1RfRVhQSVJFU19JTiB8fCBcIjdkXCI7XG5cbiAgcmV0dXJuIGp3dC5zaWduKFxuICAgIHtcbiAgICAgIHVzZXJfaWQ6IHVzZXIudXNlcl9pZCxcbiAgICAgIHBob25lOiB1c2VyLnBob25lLFxuICAgICAgdHlwZTogdXNlci50eXBlLFxuICAgIH0gYXMgb2JqZWN0LFxuICAgIHNlY3JldCxcbiAgICB7IGV4cGlyZXNJbiB9IGFzIGp3dC5TaWduT3B0aW9uc1xuICApO1xufVxuXG4vLyBWYWxpZGF0aW9uIG1pZGRsZXdhcmVcbmNvbnN0IHZhbGlkYXRlR3Vlc3RBdXRoID0gW1xuICBib2R5KFwicGhvbmVcIilcbiAgICAuaXNNb2JpbGVQaG9uZShcImFyLU1BXCIpXG4gICAgLndpdGhNZXNzYWdlKFwiSW52YWxpZCBNb3JvY2NvIHBob25lIG51bWJlclwiKSxcbiAgYm9keShcImxvY2F0aW9uLmxhdGl0dWRlXCIpXG4gICAgLmlzRmxvYXQoeyBtaW46IC05MCwgbWF4OiA5MCB9KVxuICAgIC53aXRoTWVzc2FnZShcIkludmFsaWQgbGF0aXR1ZGVcIiksXG4gIGJvZHkoXCJsb2NhdGlvbi5sb25naXR1ZGVcIilcbiAgICAuaXNGbG9hdCh7IG1pbjogLTE4MCwgbWF4OiAxODAgfSlcbiAgICAud2l0aE1lc3NhZ2UoXCJJbnZhbGlkIGxvbmdpdHVkZVwiKSxcbiAgYm9keShcImxvY2F0aW9uLmFkZHJlc3NcIilcbiAgICAuaXNMZW5ndGgoeyBtaW46IDUsIG1heDogMjAwIH0pXG4gICAgLndpdGhNZXNzYWdlKFwiQWRkcmVzcyBtdXN0IGJlIDUtMjAwIGNoYXJhY3RlcnNcIiksXG5dO1xuXG5jb25zdCB2YWxpZGF0ZVJlZ2lzdGVyID0gW1xuICBib2R5KFwicGhvbmVcIilcbiAgICAuaXNNb2JpbGVQaG9uZShcImFyLU1BXCIpXG4gICAgLndpdGhNZXNzYWdlKFwiSW52YWxpZCBNb3JvY2NvIHBob25lIG51bWJlclwiKSxcbiAgYm9keShcInBhc3N3b3JkXCIpXG4gICAgLmlzTGVuZ3RoKHsgbWluOiA2IH0pXG4gICAgLndpdGhNZXNzYWdlKFwiUGFzc3dvcmQgbXVzdCBiZSBhdCBsZWFzdCA2IGNoYXJhY3RlcnNcIiksXG4gIGJvZHkoXCJuYW1lXCIpXG4gICAgLmlzTGVuZ3RoKHsgbWluOiAyLCBtYXg6IDUwIH0pXG4gICAgLndpdGhNZXNzYWdlKFwiTmFtZSBtdXN0IGJlIDItNTAgY2hhcmFjdGVyc1wiKSxcbiAgYm9keShcImxvY2F0aW9uLmxhdGl0dWRlXCIpXG4gICAgLmlzRmxvYXQoeyBtaW46IC05MCwgbWF4OiA5MCB9KVxuICAgIC53aXRoTWVzc2FnZShcIkludmFsaWQgbGF0aXR1ZGVcIiksXG4gIGJvZHkoXCJsb2NhdGlvbi5sb25naXR1ZGVcIilcbiAgICAuaXNGbG9hdCh7IG1pbjogLTE4MCwgbWF4OiAxODAgfSlcbiAgICAud2l0aE1lc3NhZ2UoXCJJbnZhbGlkIGxvbmdpdHVkZVwiKSxcbiAgYm9keShcImxvY2F0aW9uLmFkZHJlc3NcIilcbiAgICAuaXNMZW5ndGgoeyBtaW46IDUsIG1heDogMjAwIH0pXG4gICAgLndpdGhNZXNzYWdlKFwiQWRkcmVzcyBtdXN0IGJlIDUtMjAwIGNoYXJhY3RlcnNcIiksXG5dO1xuXG5jb25zdCB2YWxpZGF0ZUxvZ2luID0gW1xuICBib2R5KFwicGhvbmVcIilcbiAgICAuaXNNb2JpbGVQaG9uZShcImFyLU1BXCIpXG4gICAgLndpdGhNZXNzYWdlKFwiSW52YWxpZCBNb3JvY2NvIHBob25lIG51bWJlclwiKSxcbiAgYm9keShcInBhc3N3b3JkXCIpLmlzTGVuZ3RoKHsgbWluOiAxIH0pLndpdGhNZXNzYWdlKFwiUGFzc3dvcmQgaXMgcmVxdWlyZWRcIiksXG5dO1xuXG4vLyBHdWVzdCBhdXRoZW50aWNhdGlvbiBmb3IgcXVpY2sgY2hlY2tvdXRcbnJvdXRlci5wb3N0KFxuICBcIi9ndWVzdFwiLFxuICB2YWxpZGF0ZUd1ZXN0QXV0aCxcbiAgYXN5bmMgKHJlcTogR3Vlc3RBdXRoUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGVycm9ycyA9IHZhbGlkYXRpb25SZXN1bHQocmVxKTtcbiAgICAgIGlmICghZXJyb3JzLmlzRW1wdHkoKSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIlZhbGlkYXRpb24gZmFpbGVkXCIsXG4gICAgICAgICAgZXJyb3JfYXI6IFwi2YHYtNmEINmB2Yog2KfZhNiq2K3ZgtmCINmF2YYg2KfZhNio2YrYp9mG2KfYqlwiLFxuICAgICAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSBsYSB2YWxpZGF0aW9uXCIsXG4gICAgICAgICAgZGV0YWlsczogZXJyb3JzLmFycmF5KCksXG4gICAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHsgcGhvbmUsIGxvY2F0aW9uIH0gPSByZXEuYm9keTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdXNlciBhbHJlYWR5IGV4aXN0c1xuICAgICAgY29uc3QgZXhpc3RpbmdVc2VyOiBRdWVyeVJlc3VsdDxVc2VyPiA9IGF3YWl0IHF1ZXJ5KFxuICAgICAgICBcIlNFTEVDVCB1c2VyX2lkLCBwaG9uZSwgdHlwZSBGUk9NIHVzZXJzIFdIRVJFIHBob25lID0gJDFcIixcbiAgICAgICAgW3Bob25lXVxuICAgICAgKTtcblxuICAgICAgbGV0IHVzZXI6IFVzZXI7XG4gICAgICBpZiAoZXhpc3RpbmdVc2VyLnJvd3MubGVuZ3RoID4gMCkge1xuICAgICAgICB1c2VyID0gZXhpc3RpbmdVc2VyLnJvd3NbMF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBDcmVhdGUgZ3Vlc3QgdXNlclxuICAgICAgICBjb25zdCByZXN1bHQ6IFF1ZXJ5UmVzdWx0PFVzZXI+ID0gYXdhaXQgcXVlcnkoXG4gICAgICAgICAgYElOU0VSVCBJTlRPIHVzZXJzIChwaG9uZSwgdHlwZSwgaXNfZ3Vlc3QsIGxvY2F0aW9uX2xhdGl0dWRlLCBsb2NhdGlvbl9sb25naXR1ZGUsIGxvY2F0aW9uX2FkZHJlc3MpXG4gICAgICAgICBWQUxVRVMgKCQxLCAnY3VzdG9tZXInLCB0cnVlLCAkMiwgJDMsICQ0KVxuICAgICAgICAgUkVUVVJOSU5HIHVzZXJfaWQsIHBob25lLCB0eXBlYCxcbiAgICAgICAgICBbcGhvbmUsIGxvY2F0aW9uLmxhdGl0dWRlLCBsb2NhdGlvbi5sb25naXR1ZGUsIGxvY2F0aW9uLmFkZHJlc3NdXG4gICAgICAgICk7XG4gICAgICAgIHVzZXIgPSByZXN1bHQucm93c1swXTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9rZW4gPSBnZW5lcmF0ZVRva2VuKHVzZXIpO1xuXG4gICAgICByZXMuanNvbih7XG4gICAgICAgIG1lc3NhZ2U6IFwiR3Vlc3QgYXV0aGVudGljYXRpb24gc3VjY2Vzc2Z1bFwiLFxuICAgICAgICBtZXNzYWdlX2FyOiBcItiq2YUg2KfZhNiq2YjYq9mK2YIg2YPYttmK2YEg2KjZhtis2KfYrVwiLFxuICAgICAgICBtZXNzYWdlX2ZyOiBcIkF1dGhlbnRpZmljYXRpb24gaW52aXTDqSByw6l1c3NpZVwiLFxuICAgICAgICB0b2tlbixcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIHVzZXJfaWQ6IHVzZXIudXNlcl9pZCxcbiAgICAgICAgICBwaG9uZTogdXNlci5waG9uZSxcbiAgICAgICAgICB0eXBlOiB1c2VyLnR5cGUsXG4gICAgICAgICAgaXNfZ3Vlc3Q6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9IGFzIEF1dGhSZXNwb25zZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJHdWVzdCBhdXRoIGVycm9yOlwiLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiBcIkF1dGhlbnRpY2F0aW9uIGZhaWxlZFwiLFxuICAgICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYp9mE2KrZiNir2YrZglwiLFxuICAgICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgbCdhdXRoZW50aWZpY2F0aW9uXCIsXG4gICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgIH1cbiAgfVxuKTtcblxuLy8gVXNlciByZWdpc3RyYXRpb25cbnJvdXRlci5wb3N0KFxuICBcIi9yZWdpc3RlclwiLFxuICB2YWxpZGF0ZVJlZ2lzdGVyLFxuICBhc3luYyAocmVxOiBSZWdpc3RlclJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBQcm9taXNlPFJlc3BvbnNlIHwgdm9pZD4gPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBlcnJvcnMgPSB2YWxpZGF0aW9uUmVzdWx0KHJlcSk7XG4gICAgICBpZiAoIWVycm9ycy5pc0VtcHR5KCkpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogXCJWYWxpZGF0aW9uIGZhaWxlZFwiLFxuICAgICAgICAgIGVycm9yX2FyOiBcItmB2LTZhCDZgdmKINin2YTYqtit2YLZgiDZhdmGINin2YTYqNmK2KfZhtin2KpcIixcbiAgICAgICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgbGEgdmFsaWRhdGlvblwiLFxuICAgICAgICAgIGRldGFpbHM6IGVycm9ycy5hcnJheSgpLFxuICAgICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB7IHBob25lLCBwYXNzd29yZCwgbmFtZSwgbG9jYXRpb24sIGVtYWlsIH0gPSByZXEuYm9keTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdXNlciBhbHJlYWR5IGV4aXN0c1xuICAgICAgY29uc3QgZXhpc3RpbmdVc2VyOiBRdWVyeVJlc3VsdDxVc2VyPiA9IGF3YWl0IHF1ZXJ5KFxuICAgICAgICBcIlNFTEVDVCB1c2VyX2lkIEZST00gdXNlcnMgV0hFUkUgcGhvbmUgPSAkMVwiLFxuICAgICAgICBbcGhvbmVdXG4gICAgICApO1xuXG4gICAgICBpZiAoZXhpc3RpbmdVc2VyLnJvd3MubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDkpLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIlVzZXIgYWxyZWFkeSBleGlzdHNcIixcbiAgICAgICAgICBlcnJvcl9hcjogXCLYp9mE2YXYs9iq2K7Yr9mFINmF2YjYrNmI2K8g2KjYp9mE2YHYudmEXCIsXG4gICAgICAgICAgZXJyb3JfZnI6IFwiTCd1dGlsaXNhdGV1ciBleGlzdGUgZMOpasOgXCIsXG4gICAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhc2ggcGFzc3dvcmRcbiAgICAgIGNvbnN0IGhhc2hlZFBhc3N3b3JkID0gYXdhaXQgYmNyeXB0Lmhhc2gocGFzc3dvcmQsIDEyKTtcblxuICAgICAgLy8gQ3JlYXRlIHVzZXJcbiAgICAgIGNvbnN0IHJlc3VsdDogUXVlcnlSZXN1bHQ8VXNlcj4gPSBhd2FpdCBxdWVyeShcbiAgICAgICAgYElOU0VSVCBJTlRPIHVzZXJzIChcbiAgICAgICAgcGhvbmUsIHBhc3N3b3JkX2hhc2gsIG5hbWUsIGVtYWlsLCB0eXBlLCBpc19ndWVzdCxcbiAgICAgICAgbG9jYXRpb25fbGF0aXR1ZGUsIGxvY2F0aW9uX2xvbmdpdHVkZSwgbG9jYXRpb25fYWRkcmVzc1xuICAgICAgKSBWQUxVRVMgKCQxLCAkMiwgJDMsICQ0LCAnY3VzdG9tZXInLCBmYWxzZSwgJDUsICQ2LCAkNylcbiAgICAgIFJFVFVSTklORyB1c2VyX2lkLCBwaG9uZSwgbmFtZSwgZW1haWwsIHR5cGVgLFxuICAgICAgICBbXG4gICAgICAgICAgcGhvbmUsXG4gICAgICAgICAgaGFzaGVkUGFzc3dvcmQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgICBlbWFpbCB8fCBudWxsLFxuICAgICAgICAgIGxvY2F0aW9uLmxhdGl0dWRlLFxuICAgICAgICAgIGxvY2F0aW9uLmxvbmdpdHVkZSxcbiAgICAgICAgICBsb2NhdGlvbi5hZGRyZXNzLFxuICAgICAgICBdXG4gICAgICApO1xuXG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0LnJvd3NbMF07XG4gICAgICBjb25zdCB0b2tlbiA9IGdlbmVyYXRlVG9rZW4odXNlcik7XG5cbiAgICAgIHJlcy5zdGF0dXMoMjAxKS5qc29uKHtcbiAgICAgICAgbWVzc2FnZTogXCJSZWdpc3RyYXRpb24gc3VjY2Vzc2Z1bFwiLFxuICAgICAgICBtZXNzYWdlX2FyOiBcItiq2YUg2KfZhNiq2LPYrNmK2YQg2KjZhtis2KfYrVwiLFxuICAgICAgICBtZXNzYWdlX2ZyOiBcIkluc2NyaXB0aW9uIHLDqXVzc2llXCIsXG4gICAgICAgIHRva2VuLFxuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgdXNlcl9pZDogdXNlci51c2VyX2lkLFxuICAgICAgICAgIHBob25lOiB1c2VyLnBob25lLFxuICAgICAgICAgIG5hbWU6IHVzZXIubmFtZSxcbiAgICAgICAgICBlbWFpbDogdXNlci5lbWFpbCxcbiAgICAgICAgICB0eXBlOiB1c2VyLnR5cGUsXG4gICAgICAgICAgaXNfZ3Vlc3Q6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgfSBhcyBBdXRoUmVzcG9uc2UpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiUmVnaXN0cmF0aW9uIGVycm9yOlwiLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiBcIlJlZ2lzdHJhdGlvbiBmYWlsZWRcIixcbiAgICAgICAgZXJyb3JfYXI6IFwi2YHYtNmEINmB2Yog2KfZhNiq2LPYrNmK2YRcIixcbiAgICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIGwnaW5zY3JpcHRpb25cIixcbiAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgfVxuICB9XG4pO1xuXG4vLyBVc2VyIGxvZ2luXG5yb3V0ZXIucG9zdChcbiAgXCIvbG9naW5cIixcbiAgdmFsaWRhdGVMb2dpbixcbiAgYXN5bmMgKHJlcTogTG9naW5SZXF1ZXN0LCByZXM6IFJlc3BvbnNlKTogUHJvbWlzZTxSZXNwb25zZSB8IHZvaWQ+ID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZXJyb3JzID0gdmFsaWRhdGlvblJlc3VsdChyZXEpO1xuICAgICAgaWYgKCFlcnJvcnMuaXNFbXB0eSgpKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6IFwiVmFsaWRhdGlvbiBmYWlsZWRcIixcbiAgICAgICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYp9mE2KrYrdmC2YIg2YXZhiDYp9mE2KjZitin2YbYp9iqXCIsXG4gICAgICAgICAgZXJyb3JfZnI6IFwiw4ljaGVjIGRlIGxhIHZhbGlkYXRpb25cIixcbiAgICAgICAgICBkZXRhaWxzOiBlcnJvcnMuYXJyYXkoKSxcbiAgICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgeyBwaG9uZSwgcGFzc3dvcmQgfSA9IHJlcS5ib2R5O1xuXG4gICAgICAvLyBGaW5kIHVzZXJcbiAgICAgIGNvbnN0IHJlc3VsdDogUXVlcnlSZXN1bHQ8VXNlcj4gPSBhd2FpdCBxdWVyeShcbiAgICAgICAgYFNFTEVDVCB1c2VyX2lkLCBwaG9uZSwgbmFtZSwgZW1haWwsIHBhc3N3b3JkX2hhc2gsIHR5cGUsIGlzX2FjdGl2ZVxuICAgICAgIEZST00gdXNlcnMgXG4gICAgICAgV0hFUkUgcGhvbmUgPSAkMSBBTkQgaXNfZ3Vlc3QgPSBmYWxzZWAsXG4gICAgICAgIFtwaG9uZV1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHQucm93cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAxKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogXCJJbnZhbGlkIGNyZWRlbnRpYWxzXCIsXG4gICAgICAgICAgZXJyb3JfYXI6IFwi2KjZitin2YbYp9iqINin2YTYr9iu2YjZhCDYutmK2LEg2LXYrdmK2K3YqVwiLFxuICAgICAgICAgIGVycm9yX2ZyOiBcIklkZW50aWZpYW50cyBpbnZhbGlkZXNcIixcbiAgICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlciA9IHJlc3VsdC5yb3dzWzBdO1xuXG4gICAgICAvLyBDaGVjayBpZiB1c2VyIGlzIGFjdGl2ZVxuICAgICAgaWYgKCF1c2VyLmlzX2FjdGl2ZSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDEpLmpzb24oe1xuICAgICAgICAgIGVycm9yOiBcIkFjY291bnQgaXMgZGVhY3RpdmF0ZWRcIixcbiAgICAgICAgICBlcnJvcl9hcjogXCLYp9mE2K3Ys9in2Kgg2YXYudi32YRcIixcbiAgICAgICAgICBlcnJvcl9mcjogXCJMZSBjb21wdGUgZXN0IGTDqXNhY3RpdsOpXCIsXG4gICAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFZlcmlmeSBwYXNzd29yZFxuICAgICAgY29uc3QgaXNWYWxpZFBhc3N3b3JkID0gYXdhaXQgYmNyeXB0LmNvbXBhcmUoXG4gICAgICAgIHBhc3N3b3JkLFxuICAgICAgICB1c2VyLnBhc3N3b3JkX2hhc2ghXG4gICAgICApO1xuICAgICAgaWYgKCFpc1ZhbGlkUGFzc3dvcmQpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAxKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogXCJJbnZhbGlkIGNyZWRlbnRpYWxzXCIsXG4gICAgICAgICAgZXJyb3JfYXI6IFwi2KjZitin2YbYp9iqINin2YTYr9iu2YjZhCDYutmK2LEg2LXYrdmK2K3YqVwiLFxuICAgICAgICAgIGVycm9yX2ZyOiBcIklkZW50aWZpYW50cyBpbnZhbGlkZXNcIixcbiAgICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9rZW4gPSBnZW5lcmF0ZVRva2VuKHVzZXIpO1xuXG4gICAgICByZXMuanNvbih7XG4gICAgICAgIG1lc3NhZ2U6IFwiTG9naW4gc3VjY2Vzc2Z1bFwiLFxuICAgICAgICBtZXNzYWdlX2FyOiBcItiq2YUg2KrYs9is2YrZhCDYp9mE2K/YrtmI2YQg2KjZhtis2KfYrVwiLFxuICAgICAgICBtZXNzYWdlX2ZyOiBcIkNvbm5leGlvbiByw6l1c3NpZVwiLFxuICAgICAgICB0b2tlbixcbiAgICAgICAgdXNlcjoge1xuICAgICAgICAgIHVzZXJfaWQ6IHVzZXIudXNlcl9pZCxcbiAgICAgICAgICBwaG9uZTogdXNlci5waG9uZSxcbiAgICAgICAgICBuYW1lOiB1c2VyLm5hbWUsXG4gICAgICAgICAgZW1haWw6IHVzZXIuZW1haWwsXG4gICAgICAgICAgdHlwZTogdXNlci50eXBlLFxuICAgICAgICAgIGlzX2d1ZXN0OiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgIH0gYXMgQXV0aFJlc3BvbnNlKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkxvZ2luIGVycm9yOlwiLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiBcIkxvZ2luIGZhaWxlZFwiLFxuICAgICAgICBlcnJvcl9hcjogXCLZgdi02YQg2YHZiiDYqtiz2KzZitmEINin2YTYr9iu2YjZhFwiLFxuICAgICAgICBlcnJvcl9mcjogXCLDiWNoZWMgZGUgbGEgY29ubmV4aW9uXCIsXG4gICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgIH1cbiAgfVxuKTtcblxuLy8gR2V0IHVzZXIgcHJvZmlsZVxucm91dGVyLmdldChcbiAgXCIvcHJvZmlsZVwiLFxuICBhdXRoZW50aWNhdGVUb2tlbixcbiAgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IFByb21pc2U8UmVzcG9uc2UgfCB2b2lkPiA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdDogUXVlcnlSZXN1bHQ8VXNlcj4gPSBhd2FpdCBxdWVyeShcbiAgICAgICAgYFNFTEVDVCB1c2VyX2lkLCBwaG9uZSwgbmFtZSwgZW1haWwsIHR5cGUsIGlzX2d1ZXN0LCBpc19hY3RpdmUsXG4gICAgICAgICAgICAgIGxvY2F0aW9uX2xhdGl0dWRlLCBsb2NhdGlvbl9sb25naXR1ZGUsIGxvY2F0aW9uX2FkZHJlc3MsXG4gICAgICAgICAgICAgIGNyZWF0ZWRfYXRcbiAgICAgICBGUk9NIHVzZXJzIFxuICAgICAgIFdIRVJFIHVzZXJfaWQgPSAkMWAsXG4gICAgICAgIFtyZXEudXNlciEudXNlcl9pZF1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHQucm93cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogXCJVc2VyIG5vdCBmb3VuZFwiLFxuICAgICAgICAgIGVycm9yX2FyOiBcItin2YTZhdiz2KrYrtiv2YUg2LrZitixINmF2YjYrNmI2K9cIixcbiAgICAgICAgICBlcnJvcl9mcjogXCJVdGlsaXNhdGV1ciBub24gdHJvdXbDqVwiLFxuICAgICAgICB9IGFzIEVycm9yUmVzcG9uc2UpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyID0gcmVzdWx0LnJvd3NbMF07XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHVzZXI6IHtcbiAgICAgICAgICB1c2VyX2lkOiB1c2VyLnVzZXJfaWQsXG4gICAgICAgICAgcGhvbmU6IHVzZXIucGhvbmUsXG4gICAgICAgICAgbmFtZTogdXNlci5uYW1lLFxuICAgICAgICAgIGVtYWlsOiB1c2VyLmVtYWlsLFxuICAgICAgICAgIHR5cGU6IHVzZXIudHlwZSxcbiAgICAgICAgICBpc19ndWVzdDogdXNlci5pc19ndWVzdCxcbiAgICAgICAgICBpc19hY3RpdmU6IHVzZXIuaXNfYWN0aXZlLFxuICAgICAgICAgIGxvY2F0aW9uOiB7XG4gICAgICAgICAgICBsYXRpdHVkZTogdXNlci5sb2NhdGlvbl9sYXRpdHVkZSxcbiAgICAgICAgICAgIGxvbmdpdHVkZTogdXNlci5sb2NhdGlvbl9sb25naXR1ZGUsXG4gICAgICAgICAgICBhZGRyZXNzOiB1c2VyLmxvY2F0aW9uX2FkZHJlc3MsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBjcmVhdGVkX2F0OiB1c2VyLmNyZWF0ZWRfYXQsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIlByb2ZpbGUgZmV0Y2ggZXJyb3I6XCIsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6IFwiRmFpbGVkIHRvIGZldGNoIHByb2ZpbGVcIixcbiAgICAgICAgZXJyb3JfYXI6IFwi2YHYtNmEINmB2Yog2KzZhNioINin2YTZhdmE2YEg2KfZhNi02K7YtdmKXCIsXG4gICAgICAgIGVycm9yX2ZyOiBcIsOJY2hlYyBkZSByw6ljdXDDqXJhdGlvbiBkdSBwcm9maWxcIixcbiAgICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgfVxuICB9XG4pO1xuXG4vLyBNaWRkbGV3YXJlIHRvIGF1dGhlbnRpY2F0ZSBKV1QgdG9rZW5cbmZ1bmN0aW9uIGF1dGhlbnRpY2F0ZVRva2VuKFxuICByZXE6IFJlcXVlc3QsXG4gIHJlczogUmVzcG9uc2UsXG4gIG5leHQ6IE5leHRGdW5jdGlvblxuKTogdm9pZCB7XG4gIGNvbnN0IGF1dGhIZWFkZXIgPSByZXEuaGVhZGVyc1tcImF1dGhvcml6YXRpb25cIl07XG4gIGNvbnN0IHRva2VuID0gYXV0aEhlYWRlciAmJiBhdXRoSGVhZGVyLnNwbGl0KFwiIFwiKVsxXTtcblxuICBpZiAoIXRva2VuKSB7XG4gICAgcmVzLnN0YXR1cyg0MDEpLmpzb24oe1xuICAgICAgZXJyb3I6IFwiQWNjZXNzIHRva2VuIHJlcXVpcmVkXCIsXG4gICAgICBlcnJvcl9hcjogXCLYsdmF2LIg2KfZhNmI2LXZiNmEINmF2LfZhNmI2KhcIixcbiAgICAgIGVycm9yX2ZyOiBcIkpldG9uIGQnYWNjw6hzIHJlcXVpc1wiLFxuICAgIH0gYXMgRXJyb3JSZXNwb25zZSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgand0LnZlcmlmeShcbiAgICB0b2tlbixcbiAgICBwcm9jZXNzLmVudi5KV1RfU0VDUkVUIHx8IFwiZmFsbGJhY2tfc2VjcmV0XCIsXG4gICAgKGVyciwgdXNlcikgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXMuc3RhdHVzKDQwMykuanNvbih7XG4gICAgICAgICAgZXJyb3I6IFwiSW52YWxpZCBvciBleHBpcmVkIHRva2VuXCIsXG4gICAgICAgICAgZXJyb3JfYXI6IFwi2LHZhdiyINi62YrYsSDYtdit2YrYrSDYo9mIINmF2YbYqtmH2Yog2KfZhNi12YTYp9it2YrYqVwiLFxuICAgICAgICAgIGVycm9yX2ZyOiBcIkpldG9uIGludmFsaWRlIG91IGV4cGlyw6lcIixcbiAgICAgICAgfSBhcyBFcnJvclJlc3BvbnNlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgcmVxLnVzZXIgPSB1c2VyIGFzIGFueTtcbiAgICAgIG5leHQoKTtcbiAgICB9XG4gICk7XG59XG5cbi8vIEV4cG9ydCBtaWRkbGV3YXJlIGZvciB1c2UgaW4gb3RoZXIgcm91dGVzXG5leHBvcnQgeyBhdXRoZW50aWNhdGVUb2tlbiB9O1xuZXhwb3J0IGRlZmF1bHQgcm91dGVyO1xuIl19