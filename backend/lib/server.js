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
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv = __importStar(require("dotenv"));
const packageJson = __importStar(require("../package.json"));
const db = __importStar(require("./config/database"));
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const products_1 = __importDefault(require("./routes/products"));
const orders_1 = __importDefault(require("./routes/orders"));
const cod_1 = __importDefault(require("./routes/cod"));
const admin_1 = __importDefault(require("./routes/admin"));
dotenv.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3000');
// ============================================================================
// MIDDLEWARE
// ============================================================================
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false // Disable for development
}));
// CORS configuration for Morocco
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://yourapp.com', 'http://your-ec2-ip']
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language']
}));
// Compression middleware
app.use((0, compression_1.default)());
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Limit each IP
    message: {
        error: 'Too many requests from this IP, please try again later.',
        error_ar: 'طلبات كثيرة جداً من هذا العنوان، يرجى المحاولة لاحقاً'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Logging middleware
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('combined'));
}
// ============================================================================
// CUSTOM MIDDLEWARE
// ============================================================================
// Language detection middleware
app.use((req, res, next) => {
    const acceptLanguage = req.headers['accept-language'];
    const supportedLanguages = ['ar', 'fr', 'en'];
    // Default to Arabic for Morocco
    let language = 'ar';
    if (acceptLanguage) {
        const preferredLanguage = acceptLanguage.split(',')[0].split('-')[0];
        if (supportedLanguages.includes(preferredLanguage)) {
            language = preferredLanguage;
        }
    }
    req.language = language;
    next();
});
// Request timing middleware
app.use((req, res, next) => {
    req.startTime = Date.now();
    next();
});
// Response timing middleware
app.use((req, res, next) => {
    const originalSend = res.send;
    res.send = function (data) {
        const responseTime = Date.now() - (req.startTime || Date.now());
        res.header('X-Response-Time', `${responseTime}ms`);
        return originalSend.call(this, data);
    };
    next();
});
// ============================================================================
// ROUTES
// ============================================================================
// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Test database connection
        const result = await db.query('SELECT NOW() as server_time, version() as db_version');
        const response = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server_time: result.rows[0].server_time,
            database: 'connected',
            database_version: result.rows[0].db_version.split(' ')[0],
            environment: process.env.NODE_ENV || 'development',
            version: packageJson.version
        };
        res.json(response);
    }
    catch (error) {
        const response = {
            status: 'unhealthy',
            error: 'Database connection failed',
            timestamp: new Date().toISOString(),
            version: packageJson.version
        };
        res.status(503).json(response);
    }
});
// API routes
app.use('/api/auth', auth_1.default);
app.use('/api/products', products_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/cod', cod_1.default);
app.use('/api/admin', admin_1.default);
// Root endpoint with API info
app.get('/', (req, res) => {
    const response = {
        name: 'Khamsa Cart API',
        version: packageJson.version,
        description: 'Morocco\'s blessed marketplace - E-commerce API with protection and prosperity',
        features: [
            'Multi-language support (Arabic, French, English)',
            'Cash on Delivery (COD) support',
            'Product variants and inventory management',
            'Order tracking and management',
            'Age verification for vape products',
            'Morocco-specific delivery zones'
        ],
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            products: '/api/products',
            orders: '/api/orders',
            cod: '/api/cod',
            admin: '/api/admin'
        },
        language: req.language || 'ar',
        documentation: '/api/docs' // TODO: Add API documentation
    };
    res.json(response);
});
// ============================================================================
// ERROR HANDLING
// ============================================================================
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        error_ar: 'الصفحة غير موجودة',
        error_fr: 'Point de terminaison non trouvé',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});
// Global error handler
app.use((error, req, res, next) => {
    console.error('Error:', error);
    // Database connection errors
    if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
            error: 'Database connection failed',
            error_ar: 'فشل الاتصال بقاعدة البيانات',
            error_fr: 'Échec de la connexion à la base de données'
        });
    }
    // Validation errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            error_ar: 'فشل في التحقق من البيانات',
            error_fr: 'Échec de la validation',
            details: error.details
        });
    }
    // JWT errors
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid token',
            error_ar: 'رمز غير صحيح',
            error_fr: 'Jeton invalide'
        });
    }
    // PostgreSQL errors
    if (error.code) {
        switch (error.code) {
            case '23505': // Unique violation
                return res.status(409).json({
                    error: 'Resource already exists',
                    error_ar: 'المورد موجود بالفعل',
                    error_fr: 'La ressource existe déjà',
                    field: error.constraint
                });
            case '23503': // Foreign key violation
                return res.status(400).json({
                    error: 'Referenced resource does not exist',
                    error_ar: 'المورد المرجعي غير موجود',
                    error_fr: 'La ressource référencée n\'existe pas'
                });
            case '23514': // Check violation
                return res.status(400).json({
                    error: 'Data constraint violation',
                    error_ar: 'انتهاك قيود البيانات',
                    error_fr: 'Violation de contrainte de données'
                });
        }
    }
    // Default error
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
        error: statusCode === 500 ? 'Internal server error' : error.message,
        error_ar: statusCode === 500 ? 'خطأ داخلي في الخادم' : error.message_ar,
        error_fr: statusCode === 500 ? 'Erreur interne du serveur' : error.message_fr,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});
// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    // Close database connections
    await db.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    // Close database connections
    await db.close();
    process.exit(0);
});
// ============================================================================
// START SERVER
// ============================================================================
// Test database connection before starting server
async function startServer() {
    try {
        await db.query('SELECT 1');
        console.log('✅ Database connected successfully');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 GroceryVape Morocco API Server running on port ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
            console.log(`📱 API base URL: http://localhost:${PORT}/api`);
            console.log(`🇲🇦 Supporting languages: Arabic, French, English`);
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to connect to database:', errorMessage);
        console.error('Please check your database configuration in .env file');
        process.exit(1);
    }
}
startServer();
exports.default = app;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3NlcnZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHNEQUFnRjtBQUNoRixnREFBd0I7QUFDeEIsb0RBQTRCO0FBQzVCLG9EQUE0QjtBQUM1Qiw4REFBc0M7QUFDdEMsNEVBQTJDO0FBQzNDLCtDQUFpQztBQUNqQyw2REFBK0M7QUFFL0Msc0RBQXdDO0FBRXhDLGdCQUFnQjtBQUNoQix5REFBdUM7QUFDdkMsaUVBQThDO0FBQzlDLDZEQUEwQztBQUMxQyx1REFBcUM7QUFDckMsMkRBQXlDO0FBRXpDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQTRDaEIsTUFBTSxHQUFHLEdBQWdCLElBQUEsaUJBQU8sR0FBRSxDQUFDO0FBQ25DLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsQ0FBQztBQUVsRCwrRUFBK0U7QUFDL0UsYUFBYTtBQUNiLCtFQUErRTtBQUUvRSxzQkFBc0I7QUFDdEIsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFBLGdCQUFNLEVBQUM7SUFDYix5QkFBeUIsRUFBRSxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUU7SUFDckQscUJBQXFCLEVBQUUsS0FBSyxDQUFDLDBCQUEwQjtDQUN4RCxDQUFDLENBQUMsQ0FBQztBQUVKLGlDQUFpQztBQUNqQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUEsY0FBSSxFQUFDO0lBQ1gsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxLQUFLLFlBQVk7UUFDM0MsQ0FBQyxDQUFDLENBQUMscUJBQXFCLEVBQUUsb0JBQW9CLENBQUM7UUFDL0MsQ0FBQyxDQUFDLElBQUk7SUFDUixXQUFXLEVBQUUsSUFBSTtJQUNqQixPQUFPLEVBQUUsQ0FBQyxLQUFLLEVBQUUsTUFBTSxF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Q0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDO1FBQzlFLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDaEUsT0FBTyxDQUFDLEtBQUssQ0FBQyx1REFBdUQsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztBQUNILENBQUM7QUFFRCxXQUFXLEVBQUUsQ0FBQztBQUVkLGtCQUFlLEdBQUcsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlLCBOZXh0RnVuY3Rpb24sIEFwcGxpY2F0aW9uIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgY29ycyBmcm9tICdjb3JzJztcbmltcG9ydCBoZWxtZXQgZnJvbSAnaGVsbWV0JztcbmltcG9ydCBtb3JnYW4gZnJvbSAnbW9yZ2FuJztcbmltcG9ydCBjb21wcmVzc2lvbiBmcm9tICdjb21wcmVzc2lvbic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgKiBhcyBkb3RlbnYgZnJvbSAnZG90ZW52JztcbmltcG9ydCAqIGFzIHBhY2thZ2VKc29uIGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5cbmltcG9ydCAqIGFzIGRiIGZyb20gJy4vY29uZmlnL2RhdGFiYXNlJztcblxuLy8gSW1wb3J0IHJvdXRlc1xuaW1wb3J0IGF1dGhSb3V0ZXMgZnJvbSAnLi9yb3V0ZXMvYXV0aCc7XG5pbXBvcnQgcHJvZHVjdFJvdXRlcyBmcm9tICcuL3JvdXRlcy9wcm9kdWN0cyc7XG5pbXBvcnQgb3JkZXJSb3V0ZXMgZnJvbSAnLi9yb3V0ZXMvb3JkZXJzJztcbmltcG9ydCBjb2RSb3V0ZXMgZnJvbSAnLi9yb3V0ZXMvY29kJztcbmltcG9ydCBhZG1pblJvdXRlcyBmcm9tICcuL3JvdXRlcy9hZG1pbic7XG5cbmRvdGVudi5jb25maWcoKTtcblxuLy8gQ3VzdG9tIHByb3BlcnRpZXMgYXJlIGRlZmluZWQgaW4gdHlwZXMvZXhwcmVzcy5kLnRzXG5cbi8vIEN1c3RvbSBFcnJvciBpbnRlcmZhY2VcbmludGVyZmFjZSBDdXN0b21FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgc3RhdHVzQ29kZT86IG51bWJlcjtcbiAgY29kZT86IHN0cmluZztcbiAgY29uc3RyYWludD86IHN0cmluZztcbiAgZGV0YWlscz86IGFueTtcbiAgbWVzc2FnZV9hcj86IHN0cmluZztcbiAgbWVzc2FnZV9mcj86IHN0cmluZztcbn1cblxuLy8gSGVhbHRoIGNoZWNrIHJlc3BvbnNlIGludGVyZmFjZVxuaW50ZXJmYWNlIEhlYWx0aFJlc3BvbnNlIHtcbiAgc3RhdHVzOiAnaGVhbHRoeScgfCAndW5oZWFsdGh5JztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHNlcnZlcl90aW1lPzogc3RyaW5nO1xuICBkYXRhYmFzZT86IHN0cmluZztcbiAgZGF0YWJhc2VfdmVyc2lvbj86IHN0cmluZztcbiAgZW52aXJvbm1lbnQ/OiBzdHJpbmc7XG4gIHZlcnNpb246IHN0cmluZztcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbi8vIEFQSSBpbmZvIHJlc3BvbnNlIGludGVyZmFjZVxuaW50ZXJmYWNlIEFwaUluZm9SZXNwb25zZSB7XG4gIG5hbWU6IHN0cmluZztcbiAgdmVyc2lvbjogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBmZWF0dXJlczogc3RyaW5nW107XG4gIGVuZHBvaW50czoge1xuICAgIGhlYWx0aDogc3RyaW5nO1xuICAgIGF1dGg6IHN0cmluZztcbiAgICBwcm9kdWN0czogc3RyaW5nO1xuICAgIG9yZGVyczogc3RyaW5nO1xuICAgIGNvZDogc3RyaW5nO1xuICAgIGFkbWluOiBzdHJpbmc7XG4gIH07XG4gIGxhbmd1YWdlOiBzdHJpbmc7XG4gIGRvY3VtZW50YXRpb246IHN0cmluZztcbn1cblxuY29uc3QgYXBwOiBBcHBsaWNhdGlvbiA9IGV4cHJlc3MoKTtcbmNvbnN0IFBPUlQgPSBwYXJzZUludChwcm9jZXNzLmVudi5QT1JUIHx8ICczMDAwJyk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1JRERMRVdBUkVcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gU2VjdXJpdHkgbWlkZGxld2FyZVxuYXBwLnVzZShoZWxtZXQoe1xuICBjcm9zc09yaWdpblJlc291cmNlUG9saWN5OiB7IHBvbGljeTogXCJjcm9zcy1vcmlnaW5cIiB9LFxuICBjb250ZW50U2VjdXJpdHlQb2xpY3k6IGZhbHNlIC8vIERpc2FibGUgZm9yIGRldmVsb3BtZW50XG59KSk7XG5cbi8vIENPUlMgY29uZmlndXJhdGlvbiBmb3IgTW9yb2Njb1xuYXBwLnVzZShjb3JzKHtcbiAgb3JpZ2luOiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nIFxuICAgID8gWydodHRwczovL3lvdXJhcHAuY29tJywgJ2h0dHA6Ly95b3VyLWVjMi1pcCddIFxuICAgIDogdHJ1ZSxcbiAgY3JlZGVudGlhbHM6IHRydWUsXG4gIG1ldGhvZHM6IFsnR0VUJywgJ1BPU1QnLCAnUFVUJywgJ0RFTEVURScsICdQQVRDSCddLFxuICBhbGxvd2VkSGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbicsICdBY2NlcHQtTGFuZ3VhZ2UnXVxufSkpO1xuXG4vLyBDb21wcmVzc2lvbiBtaWRkbGV3YXJlXG5hcHAudXNlKGNvbXByZXNzaW9uKCkpO1xuXG4vLyBSYXRlIGxpbWl0aW5nXG5jb25zdCBsaW1pdGVyID0gcmF0ZUxpbWl0KHtcbiAgd2luZG93TXM6IDE1ICogNjAgKiAxMDAwLCAvLyAxNSBtaW51dGVzXG4gIG1heDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJyA/IDEwMCA6IDEwMDAsIC8vIExpbWl0IGVhY2ggSVBcbiAgbWVzc2FnZToge1xuICAgIGVycm9yOiAnVG9vIG1hbnkgcmVxdWVzdHMgZnJvbSB0aGlzIElQLCBwbGVhc2UgdHJ5IGFnYWluIGxhdGVyLicsXG4gICAgZXJyb3JfYXI6ICfYt9mE2KjYp9iqINmD2KvZitix2Kkg2KzYr9in2Ysg2YXZhiDZh9iw2Kcg2KfZhNi52YbZiNin2YbYjCDZitix2KzZiSDYp9mE2YXYrdin2YjZhNipINmE2KfYrdmC2KfZiydcbiAgfSxcbiAgc3RhbmRhcmRIZWFkZXJzOiB0cnVlLFxuICBsZWdhY3lIZWFkZXJzOiBmYWxzZVxufSk7XG5hcHAudXNlKCcvYXBpLycsIGxpbWl0ZXIpO1xuXG4vLyBCb2R5IHBhcnNpbmcgbWlkZGxld2FyZVxuYXBwLnVzZShleHByZXNzLmpzb24oeyBsaW1pdDogJzEwbWInIH0pKTtcbmFwcC51c2UoZXhwcmVzcy51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IHRydWUsIGxpbWl0OiAnMTBtYicgfSkpO1xuXG4vLyBMb2dnaW5nIG1pZGRsZXdhcmVcbmlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Rlc3QnKSB7XG4gIGFwcC51c2UobW9yZ2FuKCdjb21iaW5lZCcpKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ1VTVE9NIE1JRERMRVdBUkVcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gTGFuZ3VhZ2UgZGV0ZWN0aW9uIG1pZGRsZXdhcmVcbmFwcC51c2UoKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIGNvbnN0IGFjY2VwdExhbmd1YWdlID0gcmVxLmhlYWRlcnNbJ2FjY2VwdC1sYW5ndWFnZSddO1xuICBjb25zdCBzdXBwb3J0ZWRMYW5ndWFnZXM6IEFycmF5PCdhcicgfCAnZnInIHwgJ2VuJz4gPSBbJ2FyJywgJ2ZyJywgJ2VuJ107XG4gIFxuICAvLyBEZWZhdWx0IHRvIEFyYWJpYyBmb3IgTW9yb2Njb1xuICBsZXQgbGFuZ3VhZ2U6ICdhcicgfCAnZnInIHwgJ2VuJyA9ICdhcic7XG4gIFxuICBpZiAoYWNjZXB0TGFuZ3VhZ2UpIHtcbiAgICBjb25zdCBwcmVmZXJyZWRMYW5ndWFnZSA9IGFjY2VwdExhbmd1YWdlLnNwbGl0KCcsJylbMF0uc3BsaXQoJy0nKVswXSBhcyAnYXInIHwgJ2ZyJyB8ICdlbic7XG4gICAgaWYgKHN1cHBvcnRlZExhbmd1YWdlcy5pbmNsdWRlcyhwcmVmZXJyZWRMYW5ndWFnZSkpIHtcbiAgICAgIGxhbmd1YWdlID0gcHJlZmVycmVkTGFuZ3VhZ2U7XG4gICAgfVxuICB9XG4gIFxuICByZXEubGFuZ3VhZ2UgPSBsYW5ndWFnZTtcbiAgbmV4dCgpO1xufSk7XG5cbi8vIFJlcXVlc3QgdGltaW5nIG1pZGRsZXdhcmVcbmFwcC51c2UoKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHJlcS5zdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICBuZXh0KCk7XG59KTtcblxuLy8gUmVzcG9uc2UgdGltaW5nIG1pZGRsZXdhcmVcbmFwcC51c2UoKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIGNvbnN0IG9yaWdpbmFsU2VuZCA9IHJlcy5zZW5kO1xuICByZXMuc2VuZCA9IGZ1bmN0aW9uKGRhdGE6IGFueSkge1xuICAgIGNvbnN0IHJlc3BvbnNlVGltZSA9IERhdGUubm93KCkgLSAocmVxLnN0YXJ0VGltZSB8fCBEYXRlLm5vdygpKTtcbiAgICByZXMuaGVhZGVyKCdYLVJlc3BvbnNlLVRpbWUnLCBgJHtyZXNwb25zZVRpbWV9bXNgKTtcbiAgICByZXR1cm4gb3JpZ2luYWxTZW5kLmNhbGwodGhpcywgZGF0YSk7XG4gIH07XG4gIG5leHQoKTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBST1VURVNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gSGVhbHRoIGNoZWNrIGVuZHBvaW50XG5hcHAuZ2V0KCcvaGVhbHRoJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICB0cnkge1xuICAgIC8vIFRlc3QgZGF0YWJhc2UgY29ubmVjdGlvblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PHtzZXJ2ZXJfdGltZTogc3RyaW5nLCBkYl92ZXJzaW9uOiBzdHJpbmd9PignU0VMRUNUIE5PVygpIGFzIHNlcnZlcl90aW1lLCB2ZXJzaW9uKCkgYXMgZGJfdmVyc2lvbicpO1xuICAgIFxuICAgIGNvbnN0IHJlc3BvbnNlOiBIZWFsdGhSZXNwb25zZSA9IHtcbiAgICAgIHN0YXR1czogJ2hlYWx0aHknLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBzZXJ2ZXJfdGltZTogcmVzdWx0LnJvd3NbMF0uc2VydmVyX3RpbWUsXG4gICAgICBkYXRhYmFzZTogJ2Nvbm5lY3RlZCcsXG4gICAgICBkYXRhYmFzZV92ZXJzaW9uOiByZXN1bHQucm93c1swXS5kYl92ZXJzaW9uLnNwbGl0KCcgJylbMF0sXG4gICAgICBlbnZpcm9ubWVudDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgfHwgJ2RldmVsb3BtZW50JyxcbiAgICAgIHZlcnNpb246IHBhY2thZ2VKc29uLnZlcnNpb25cbiAgICB9O1xuXG4gICAgcmVzLmpzb24ocmVzcG9uc2UpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IHJlc3BvbnNlOiBIZWFsdGhSZXNwb25zZSA9IHtcbiAgICAgIHN0YXR1czogJ3VuaGVhbHRoeScsXG4gICAgICBlcnJvcjogJ0RhdGFiYXNlIGNvbm5lY3Rpb24gZmFpbGVkJyxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgdmVyc2lvbjogcGFja2FnZUpzb24udmVyc2lvblxuICAgIH07XG5cbiAgICByZXMuc3RhdHVzKDUwMykuanNvbihyZXNwb25zZSk7XG4gIH1cbn0pO1xuXG4vLyBBUEkgcm91dGVzXG5hcHAudXNlKCcvYXBpL2F1dGgnLCBhdXRoUm91dGVzKTtcbmFwcC51c2UoJy9hcGkvcHJvZHVjdHMnLCBwcm9kdWN0Um91dGVzKTtcbmFwcC51c2UoJy9hcGkvb3JkZXJzJywgb3JkZXJSb3V0ZXMpO1xuYXBwLnVzZSgnL2FwaS9jb2QnLCBjb2RSb3V0ZXMpO1xuYXBwLnVzZSgnL2FwaS9hZG1pbicsIGFkbWluUm91dGVzKTtcblxuLy8gUm9vdCBlbmRwb2ludCB3aXRoIEFQSSBpbmZvXG5hcHAuZ2V0KCcvJywgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICBjb25zdCByZXNwb25zZTogQXBpSW5mb1Jlc3BvbnNlID0ge1xuICAgIG5hbWU6ICdLaGFtc2EgQ2FydCBBUEknLFxuICAgIHZlcnNpb246IHBhY2thZ2VKc29uLnZlcnNpb24sXG4gICAgZGVzY3JpcHRpb246ICdNb3JvY2NvXFwncyBibGVzc2VkIG1hcmtldHBsYWNlIC0gRS1jb21tZXJjZSBBUEkgd2l0aCBwcm90ZWN0aW9uIGFuZCBwcm9zcGVyaXR5JyxcbiAgICBmZWF0dXJlczogW1xuICAgICAgJ011bHRpLWxhbmd1YWdlIHN1cHBvcnQgKEFyYWJpYywgRnJlbmNoLCBFbmdsaXNoKScsXG4gICAgICAnQ2FzaCBvbiBEZWxpdmVyeSAoQ09EKSBzdXBwb3J0JyxcbiAgICAgICdQcm9kdWN0IHZhcmlhbnRzIGFuZCBpbnZlbnRvcnkgbWFuYWdlbWVudCcsXG4gICAgICAnT3JkZXIgdHJhY2tpbmcgYW5kIG1hbmFnZW1lbnQnLFxuICAgICAgJ0FnZSB2ZXJpZmljYXRpb24gZm9yIHZhcGUgcHJvZHVjdHMnLFxuICAgICAgJ01vcm9jY28tc3BlY2lmaWMgZGVsaXZlcnkgem9uZXMnXG4gICAgXSxcbiAgICBlbmRwb2ludHM6IHtcbiAgICAgIGhlYWx0aDogJy9oZWFsdGgnLFxuICAgICAgYXV0aDogJy9hcGkvYXV0aCcsXG4gICAgICBwcm9kdWN0czogJy9hcGkvcHJvZHVjdHMnLFxuICAgICAgb3JkZXJzOiAnL2FwaS9vcmRlcnMnLFxuICAgICAgY29kOiAnL2FwaS9jb2QnLFxuICAgICAgYWRtaW46ICcvYXBpL2FkbWluJ1xuICAgIH0sXG4gICAgbGFuZ3VhZ2U6IHJlcS5sYW5ndWFnZSB8fCAnYXInLFxuICAgIGRvY3VtZW50YXRpb246ICcvYXBpL2RvY3MnIC8vIFRPRE86IEFkZCBBUEkgZG9jdW1lbnRhdGlvblxuICB9O1xuXG4gIHJlcy5qc29uKHJlc3BvbnNlKTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBFUlJPUiBIQU5ETElOR1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyA0MDQgaGFuZGxlclxuYXBwLnVzZSgocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICBlcnJvcjogJ0VuZHBvaW50IG5vdCBmb3VuZCcsXG4gICAgZXJyb3JfYXI6ICfYp9mE2LXZgdit2Kkg2LrZitixINmF2YjYrNmI2K/YqScsXG4gICAgZXJyb3JfZnI6ICdQb2ludCBkZSB0ZXJtaW5haXNvbiBub24gdHJvdXbDqScsXG4gICAgcGF0aDogcmVxLnBhdGgsXG4gICAgbWV0aG9kOiByZXEubWV0aG9kLFxuICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gIH0pO1xufSk7XG5cbi8vIEdsb2JhbCBlcnJvciBoYW5kbGVyXG5hcHAudXNlKChlcnJvcjogQ3VzdG9tRXJyb3IsIHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKTogUmVzcG9uc2UgfCB2b2lkID0+IHtcbiAgY29uc29sZS5lcnJvcignRXJyb3I6JywgZXJyb3IpO1xuICBcbiAgLy8gRGF0YWJhc2UgY29ubmVjdGlvbiBlcnJvcnNcbiAgaWYgKGVycm9yLmNvZGUgPT09ICdFQ09OTlJFRlVTRUQnKSB7XG4gICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAzKS5qc29uKHtcbiAgICAgIGVycm9yOiAnRGF0YWJhc2UgY29ubmVjdGlvbiBmYWlsZWQnLFxuICAgICAgZXJyb3JfYXI6ICfZgdi02YQg2KfZhNin2KrYtdin2YQg2KjZgtin2LnYr9ipINin2YTYqNmK2KfZhtin2KonLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgbGEgY29ubmV4aW9uIMOgIGxhIGJhc2UgZGUgZG9ubsOpZXMnXG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFZhbGlkYXRpb24gZXJyb3JzXG4gIGlmIChlcnJvci5uYW1lID09PSAnVmFsaWRhdGlvbkVycm9yJykge1xuICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICBlcnJvcjogJ1ZhbGlkYXRpb24gZmFpbGVkJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINmB2Yog2KfZhNiq2K3ZgtmCINmF2YYg2KfZhNio2YrYp9mG2KfYqicsXG4gICAgICBlcnJvcl9mcjogJ8OJY2hlYyBkZSBsYSB2YWxpZGF0aW9uJyxcbiAgICAgIGRldGFpbHM6IGVycm9yLmRldGFpbHNcbiAgICB9KTtcbiAgfVxuICBcbiAgLy8gSldUIGVycm9yc1xuICBpZiAoZXJyb3IubmFtZSA9PT0gJ0pzb25XZWJUb2tlbkVycm9yJykge1xuICAgIHJldHVybiByZXMuc3RhdHVzKDQwMSkuanNvbih7XG4gICAgICBlcnJvcjogJ0ludmFsaWQgdG9rZW4nLFxuICAgICAgZXJyb3JfYXI6ICfYsdmF2LIg2LrZitixINi12K3ZititJyxcbiAgICAgIGVycm9yX2ZyOiAnSmV0b24gaW52YWxpZGUnXG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIFBvc3RncmVTUUwgZXJyb3JzXG4gIGlmIChlcnJvci5jb2RlKSB7XG4gICAgc3dpdGNoIChlcnJvci5jb2RlKSB7XG4gICAgICBjYXNlICcyMzUwNSc6IC8vIFVuaXF1ZSB2aW9sYXRpb25cbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA5KS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogJ1Jlc291cmNlIGFscmVhZHkgZXhpc3RzJyxcbiAgICAgICAgICBlcnJvcl9hcjogJ9in2YTZhdmI2LHYryDZhdmI2KzZiNivINio2KfZhNmB2LnZhCcsXG4gICAgICAgICAgZXJyb3JfZnI6ICdMYSByZXNzb3VyY2UgZXhpc3RlIGTDqWrDoCcsXG4gICAgICAgICAgZmllbGQ6IGVycm9yLmNvbnN0cmFpbnRcbiAgICAgICAgfSk7XG4gICAgICBjYXNlICcyMzUwMyc6IC8vIEZvcmVpZ24ga2V5IHZpb2xhdGlvblxuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnUmVmZXJlbmNlZCByZXNvdXJjZSBkb2VzIG5vdCBleGlzdCcsXG4gICAgICAgICAgZXJyb3JfYXI6ICfYp9mE2YXZiNix2K8g2KfZhNmF2LHYrNi52Yog2LrZitixINmF2YjYrNmI2K8nLFxuICAgICAgICAgIGVycm9yX2ZyOiAnTGEgcmVzc291cmNlIHLDqWbDqXJlbmPDqWUgblxcJ2V4aXN0ZSBwYXMnXG4gICAgICAgIH0pO1xuICAgICAgY2FzZSAnMjM1MTQnOiAvLyBDaGVjayB2aW9sYXRpb25cbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogJ0RhdGEgY29uc3RyYWludCB2aW9sYXRpb24nLFxuICAgICAgICAgIGVycm9yX2FyOiAn2KfZhtiq2YfYp9mDINmC2YrZiNivINin2YTYqNmK2KfZhtin2KonLFxuICAgICAgICAgIGVycm9yX2ZyOiAnVmlvbGF0aW9uIGRlIGNvbnRyYWludGUgZGUgZG9ubsOpZXMnXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuICBcbiAgLy8gRGVmYXVsdCBlcnJvclxuICBjb25zdCBzdGF0dXNDb2RlID0gZXJyb3Iuc3RhdHVzQ29kZSB8fCA1MDA7XG4gIHJlcy5zdGF0dXMoc3RhdHVzQ29kZSkuanNvbih7XG4gICAgZXJyb3I6IHN0YXR1c0NvZGUgPT09IDUwMCA/ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIDogZXJyb3IubWVzc2FnZSxcbiAgICBlcnJvcl9hcjogc3RhdHVzQ29kZSA9PT0gNTAwID8gJ9iu2LfYoyDYr9in2K7ZhNmKINmB2Yog2KfZhNiu2KfYr9mFJyA6IGVycm9yLm1lc3NhZ2VfYXIsXG4gICAgZXJyb3JfZnI6IHN0YXR1c0NvZGUgPT09IDUwMCA/ICdFcnJldXIgaW50ZXJuZSBkdSBzZXJ2ZXVyJyA6IGVycm9yLm1lc3NhZ2VfZnIsXG4gICAgLi4uKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnICYmIHsgc3RhY2s6IGVycm9yLnN0YWNrIH0pXG4gIH0pO1xufSk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEdSQUNFRlVMIFNIVVRET1dOXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbnByb2Nlc3Mub24oJ1NJR1RFUk0nLCBhc3luYyAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKCdTSUdURVJNIHJlY2VpdmVkLCBzaHV0dGluZyBkb3duIGdyYWNlZnVsbHkuLi4nKTtcbiAgXG4gIC8vIENsb3NlIGRhdGFiYXNlIGNvbm5lY3Rpb25zXG4gIGF3YWl0IGRiLmNsb3NlKCk7XG4gIFxuICBwcm9jZXNzLmV4aXQoMCk7XG59KTtcblxucHJvY2Vzcy5vbignU0lHSU5UJywgYXN5bmMgKCkgPT4ge1xuICBjb25zb2xlLmxvZygnU0lHSU5UIHJlY2VpdmVkLCBzaHV0dGluZyBkb3duIGdyYWNlZnVsbHkuLi4nKTtcbiAgXG4gIC8vIENsb3NlIGRhdGFiYXNlIGNvbm5lY3Rpb25zXG4gIGF3YWl0IGRiLmNsb3NlKCk7XG4gIFxuICBwcm9jZXNzLmV4aXQoMCk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU1RBUlQgU0VSVkVSXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vIFRlc3QgZGF0YWJhc2UgY29ubmVjdGlvbiBiZWZvcmUgc3RhcnRpbmcgc2VydmVyXG5hc3luYyBmdW5jdGlvbiBzdGFydFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBhd2FpdCBkYi5xdWVyeSgnU0VMRUNUIDEnKTtcbiAgICBjb25zb2xlLmxvZygn4pyFIERhdGFiYXNlIGNvbm5lY3RlZCBzdWNjZXNzZnVsbHknKTtcbiAgICBcbiAgICBhcHAubGlzdGVuKFBPUlQsICcwLjAuMC4wJywgKCkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfmoAgR3JvY2VyeVZhcGUgTW9yb2NjbyBBUEkgU2VydmVyIHJ1bm5pbmcgb24gcG9ydCAke1BPUlR9YCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+MjSBFbnZpcm9ubWVudDogJHtwcm9jZXNzLmVudi5OT0RFX0VOViB8fCAnZGV2ZWxvcG1lbnQnfWApO1xuICAgICAgY29uc29sZS5sb2coYPCfk4ogSGVhbHRoIGNoZWNrOiBodHRwOi8vbG9jYWxob3N0OiR7UE9SVH0vaGVhbHRoYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TsSBBUEkgYmFzZSBVUkw6IGh0dHA6Ly9sb2NhbGhvc3Q6JHtQT1JUfS9hcGlgKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn4ey8J+HpiBTdXBwb3J0aW5nIGxhbmd1YWdlczogQXJhYmljLCBGcmVuY2gsIEVuZ2xpc2hgKTtcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGNvbm5lY3QgdG8gZGF0YWJhc2U6JywgZXJyb3JNZXNzYWdlKTtcbiAgICBjb25zb2xlLmVycm9yKCdQbGVhc2UgY2hlY2sgeW91ciBkYXRhYmFzZSBjb25maWd1cmF0aW9uIGluIC5lbnYgZmlsZScpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuXG5zdGFydFNlcnZlcigpO1xuXG5leHBvcnQgZGVmYXVsdCBhcHA7Il19