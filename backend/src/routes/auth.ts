import express, { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult, ValidationError } from "express-validator";
import { query } from "../config/database";
import { QueryResult } from "pg";

const router = express.Router();

// Type definitions
interface User {
  user_id: string;
  phone: string;
  name?: string;
  email?: string;
  password_hash?: string;
  type: "customer" | "admin" | "delivery" | "manager";
  is_guest: boolean;
  is_active: boolean;
  location_latitude?: number;
  location_longitude?: number;
  location_address?: string;
  created_at: Date;
  last_login?: Date;
}

interface JwtPayload {
  user_id: string;
  phone: string;
  type: string;
  iat?: number;
  exp?: number;
}

// Using extended Express Request interface from types/express.d.ts

interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

interface GuestAuthRequest extends Request {
  body: {
    phone: string;
    location: Location;
  };
}

interface RegisterRequest extends Request {
  body: {
    phone: string;
    password: string;
    name: string;
    email?: string;
    location: Location;
  };
}

interface LoginRequest extends Request {
  body: {
    phone: string;
    password: string;
  };
}

interface AuthResponse {
  message: string;
  message_ar: string;
  message_fr: string;
  token: string;
  user: {
    user_id: string;
    phone: string;
    name?: string;
    email?: string;
    type: string;
    is_guest: boolean;
  };
}

interface ErrorResponse {
  error: string;
  error_ar: string;
  error_fr: string;
  details?: ValidationError[];
}

// JWT token generation
function generateToken(user: User): string {
  const secret = process.env.JWT_SECRET || "fallback_secret";
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  return jwt.sign(
    {
      user_id: user.user_id,
      phone: user.phone,
      type: user.type,
    } as object,
    secret,
    { expiresIn } as jwt.SignOptions
  );
}

// Validation middleware
const validateGuestAuth = [
  body("phone")
    .isMobilePhone("ar-MA")
    .withMessage("Invalid Morocco phone number"),
  body("location.latitude")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Invalid latitude"),
  body("location.longitude")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Invalid longitude"),
  body("location.address")
    .isLength({ min: 5, max: 200 })
    .withMessage("Address must be 5-200 characters"),
];

const validateRegister = [
  body("phone")
    .isMobilePhone("ar-MA")
    .withMessage("Invalid Morocco phone number"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("name")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be 2-50 characters"),
  body("location.latitude")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Invalid latitude"),
  body("location.longitude")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Invalid longitude"),
  body("location.address")
    .isLength({ min: 5, max: 200 })
    .withMessage("Address must be 5-200 characters"),
];

const validateLogin = [
  body("phone")
    .isMobilePhone("ar-MA")
    .withMessage("Invalid Morocco phone number"),
  body("password").isLength({ min: 1 }).withMessage("Password is required"),
];

// Guest authentication for quick checkout
router.post(
  "/guest",
  validateGuestAuth,
  async (req: GuestAuthRequest, res: Response): Promise<Response | void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: "Validation failed",
          error_ar: "فشل في التحقق من البيانات",
          error_fr: "Échec de la validation",
          details: errors.array(),
        } as ErrorResponse);
      }

      const { phone, location } = req.body;

      // Check if user already exists
      const existingUser: QueryResult<User> = await query(
        "SELECT user_id, phone, type FROM users WHERE phone = $1",
        [phone]
      );

      let user: User;
      if (existingUser.rows.length > 0) {
        user = existingUser.rows[0];
      } else {
        // Create guest user
        const result: QueryResult<User> = await query(
          `INSERT INTO users (phone, type, is_guest, location_latitude, location_longitude, location_address)
         VALUES ($1, 'customer', true, $2, $3, $4)
         RETURNING user_id, phone, type`,
          [phone, location.latitude, location.longitude, location.address]
        );
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
      } as AuthResponse);
    } catch (error) {
      console.error("Guest auth error:", error);
      res.status(500).json({
        error: "Authentication failed",
        error_ar: "فشل في التوثيق",
        error_fr: "Échec de l'authentification",
      } as ErrorResponse);
    }
  }
);

// User registration
router.post(
  "/register",
  validateRegister,
  async (req: RegisterRequest, res: Response): Promise<Response | void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: "Validation failed",
          error_ar: "فشل في التحقق من البيانات",
          error_fr: "Échec de la validation",
          details: errors.array(),
        } as ErrorResponse);
      }

      const { phone, password, name, location, email } = req.body;

      // Check if user already exists
      const existingUser: QueryResult<User> = await query(
        "SELECT user_id FROM users WHERE phone = $1",
        [phone]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: "User already exists",
          error_ar: "المستخدم موجود بالفعل",
          error_fr: "L'utilisateur existe déjà",
        } as ErrorResponse);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const result: QueryResult<User> = await query(
        `INSERT INTO users (
        phone, password_hash, name, email, type, is_guest,
        location_latitude, location_longitude, location_address
      ) VALUES ($1, $2, $3, $4, 'customer', false, $5, $6, $7)
      RETURNING user_id, phone, name, email, type`,
        [
          phone,
          hashedPassword,
          name,
          email || null,
          location.latitude,
          location.longitude,
          location.address,
        ]
      );

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
      } as AuthResponse);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        error: "Registration failed",
        error_ar: "فشل في التسجيل",
        error_fr: "Échec de l'inscription",
      } as ErrorResponse);
    }
  }
);

// User login
router.post(
  "/login",
  validateLogin,
  async (req: LoginRequest, res: Response): Promise<Response | void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: "Validation failed",
          error_ar: "فشل في التحقق من البيانات",
          error_fr: "Échec de la validation",
          details: errors.array(),
        } as ErrorResponse);
      }

      const { phone, password } = req.body;

      // Find user
      const result: QueryResult<User> = await query(
        `SELECT user_id, phone, name, email, password_hash, type, is_active
       FROM users 
       WHERE phone = $1 AND is_guest = false`,
        [phone]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: "Invalid credentials",
          error_ar: "بيانات الدخول غير صحيحة",
          error_fr: "Identifiants invalides",
        } as ErrorResponse);
      }

      const user = result.rows[0];

      // Check if user is active
      if (!user.is_active) {
        return res.status(401).json({
          error: "Account is deactivated",
          error_ar: "الحساب معطل",
          error_fr: "Le compte est désactivé",
        } as ErrorResponse);
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(
        password,
        user.password_hash!
      );
      if (!isValidPassword) {
        return res.status(401).json({
          error: "Invalid credentials",
          error_ar: "بيانات الدخول غير صحيحة",
          error_fr: "Identifiants invalides",
        } as ErrorResponse);
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
      } as AuthResponse);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        error: "Login failed",
        error_ar: "فشل في تسجيل الدخول",
        error_fr: "Échec de la connexion",
      } as ErrorResponse);
    }
  }
);

// Get user profile
router.get(
  "/profile",
  authenticateToken,
  async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const result: QueryResult<User> = await query(
        `SELECT user_id, phone, name, email, type, is_guest, is_active,
              location_latitude, location_longitude, location_address,
              created_at
       FROM users 
       WHERE user_id = $1`,
        [req.user!.user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User not found",
          error_ar: "المستخدم غير موجود",
          error_fr: "Utilisateur non trouvé",
        } as ErrorResponse);
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
    } catch (error) {
      console.error("Profile fetch error:", error);
      res.status(500).json({
        error: "Failed to fetch profile",
        error_ar: "فشل في جلب الملف الشخصي",
        error_fr: "Échec de récupération du profil",
      } as ErrorResponse);
    }
  }
);

// Middleware to authenticate JWT token
function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({
      error: "Access token required",
      error_ar: "رمز الوصول مطلوب",
      error_fr: "Jeton d'accès requis",
    } as ErrorResponse);
    return;
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback_secret",
    (err, user) => {
      if (err) {
        res.status(403).json({
          error: "Invalid or expired token",
          error_ar: "رمز غير صحيح أو منتهي الصلاحية",
          error_fr: "Jeton invalide ou expiré",
        } as ErrorResponse);
        return;
      }
      req.user = user as any;
      next();
    }
  );
}

// Export middleware for use in other routes
export { authenticateToken };
export default router;
