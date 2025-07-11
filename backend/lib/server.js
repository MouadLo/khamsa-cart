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
const categories_1 = __importDefault(require("./routes/categories"));
const cart_1 = __importDefault(require("./routes/cart"));
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
app.use('/api/categories', categories_1.default);
app.use('/api/cart', cart_1.default);
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
            categories: '/api/categories',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3NlcnZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsc0RBQWdGO0FBQ2hGLGdEQUF3QjtBQUN4QixvREFBNEI7QUFDNUIsb0RBQTRCO0FBQzVCLDhEQUFzQztBQUN0Qyw0RUFBMkM7QUFDM0MsK0NBQWlDO0FBQ2pDLDZEQUErQztBQUUvQyxzREFBd0M7QUFFeEMsZ0JBQWdCO0FBQ2hCLHlEQUF1QztBQUN2QyxpRUFBOEM7QUFDOUMscUVBQWlEO0FBQ2pELHlEQUF1QztBQUN2Qyw2REFBMEM7QUFDMUMsdURBQXFDO0FBQ3JDLDJEQUF5QztBQUV6QyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7QUE2Q2hCLE1BQU0sR0FBRyxHQUFnQixJQUFBLGlCQUFPLEdBQUUsQ0FBQztBQUNuQyxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLENBQUM7QUFFbEQsK0VBQStFO0FBQy9FLGFBQWE7QUFDYiwrRUFBK0U7QUFFL0Usc0JBQXNCO0FBQ3RCLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBQSxnQkFBTSxFQUFDO0lBQ2IseUJBQXlCLEVBQUUsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFO0lBQ3JELHFCQUFxQixFQUFFLEtBQUssQ0FBQywwQkFBMEI7Q0FDeEQsQ0FBQyxDQUFDLENBQUM7QUFFSixpQ0FBaUM7QUFDakMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFBLGNBQUksRUFBQztJQUNYLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsS0FBSyxZQUFZO1FBQzNDLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixFQUFFLG9CQUFvQixDQUFDO1FBQy9DLENBQUMsQ0FBQyxJQUFJO0lBQ1IsV0FBVyxFQUFFLElBQUk7SUFDakIsT0FBTyxFQUFFLENBQUMs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Q0FBQyxDQUFDO1lBQzdELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0RBQW9ELENBQUMsQ0FBQztRQUNwRSxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxZQUFZLEdBQUcsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDO1FBQzlFLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDaEUsT0FBTyxDQUFDLEtBQUssQ0FBQyx1REFBdUQsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztBQUNILENBQUM7QUFFRCxXQUFXLEVBQUUsQ0FBQztBQUVkLGtCQUFlLEdBQUcsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBleHByZXNzLCB7IFJlcXVlc3QsIFJlc3BvbnNlLCBOZXh0RnVuY3Rpb24sIEFwcGxpY2F0aW9uIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgY29ycyBmcm9tICdjb3JzJztcbmltcG9ydCBoZWxtZXQgZnJvbSAnaGVsbWV0JztcbmltcG9ydCBtb3JnYW4gZnJvbSAnbW9yZ2FuJztcbmltcG9ydCBjb21wcmVzc2lvbiBmcm9tICdjb21wcmVzc2lvbic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgKiBhcyBkb3RlbnYgZnJvbSAnZG90ZW52JztcbmltcG9ydCAqIGFzIHBhY2thZ2VKc29uIGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5cbmltcG9ydCAqIGFzIGRiIGZyb20gJy4vY29uZmlnL2RhdGFiYXNlJztcblxuLy8gSW1wb3J0IHJvdXRlc1xuaW1wb3J0IGF1dGhSb3V0ZXMgZnJvbSAnLi9yb3V0ZXMvYXV0aCc7XG5pbXBvcnQgcHJvZHVjdFJvdXRlcyBmcm9tICcuL3JvdXRlcy9wcm9kdWN0cyc7XG5pbXBvcnQgY2F0ZWdvcnlSb3V0ZXMgZnJvbSAnLi9yb3V0ZXMvY2F0ZWdvcmllcyc7XG5pbXBvcnQgY2FydFJvdXRlcyBmcm9tICcuL3JvdXRlcy9jYXJ0JztcbmltcG9ydCBvcmRlclJvdXRlcyBmcm9tICcuL3JvdXRlcy9vcmRlcnMnO1xuaW1wb3J0IGNvZFJvdXRlcyBmcm9tICcuL3JvdXRlcy9jb2QnO1xuaW1wb3J0IGFkbWluUm91dGVzIGZyb20gJy4vcm91dGVzL2FkbWluJztcblxuZG90ZW52LmNvbmZpZygpO1xuXG4vLyBDdXN0b20gcHJvcGVydGllcyBhcmUgZGVmaW5lZCBpbiB0eXBlcy9leHByZXNzLmQudHNcblxuLy8gQ3VzdG9tIEVycm9yIGludGVyZmFjZVxuaW50ZXJmYWNlIEN1c3RvbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBzdGF0dXNDb2RlPzogbnVtYmVyO1xuICBjb2RlPzogc3RyaW5nO1xuICBjb25zdHJhaW50Pzogc3RyaW5nO1xuICBkZXRhaWxzPzogYW55O1xuICBtZXNzYWdlX2FyPzogc3RyaW5nO1xuICBtZXNzYWdlX2ZyPzogc3RyaW5nO1xufVxuXG4vLyBIZWFsdGggY2hlY2sgcmVzcG9uc2UgaW50ZXJmYWNlXG5pbnRlcmZhY2UgSGVhbHRoUmVzcG9uc2Uge1xuICBzdGF0dXM6ICdoZWFsdGh5JyB8ICd1bmhlYWx0aHknO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgc2VydmVyX3RpbWU/OiBzdHJpbmc7XG4gIGRhdGFiYXNlPzogc3RyaW5nO1xuICBkYXRhYmFzZV92ZXJzaW9uPzogc3RyaW5nO1xuICBlbnZpcm9ubWVudD86IHN0cmluZztcbiAgdmVyc2lvbjogc3RyaW5nO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuLy8gQVBJIGluZm8gcmVzcG9uc2UgaW50ZXJmYWNlXG5pbnRlcmZhY2UgQXBpSW5mb1Jlc3BvbnNlIHtcbiAgbmFtZTogc3RyaW5nO1xuICB2ZXJzaW9uOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGZlYXR1cmVzOiBzdHJpbmdbXTtcbiAgZW5kcG9pbnRzOiB7XG4gICAgaGVhbHRoOiBzdHJpbmc7XG4gICAgYXV0aDogc3RyaW5nO1xuICAgIHByb2R1Y3RzOiBzdHJpbmc7XG4gICAgY2F0ZWdvcmllczogc3RyaW5nO1xuICAgIG9yZGVyczogc3RyaW5nO1xuICAgIGNvZDogc3RyaW5nO1xuICAgIGFkbWluOiBzdHJpbmc7XG4gIH07XG4gIGxhbmd1YWdlOiBzdHJpbmc7XG4gIGRvY3VtZW50YXRpb246IHN0cmluZztcbn1cblxuY29uc3QgYXBwOiBBcHBsaWNhdGlvbiA9IGV4cHJlc3MoKTtcbmNvbnN0IFBPUlQgPSBwYXJzZUludChwcm9jZXNzLmVudi5QT1JUIHx8ICczMDAwJyk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1JRERMRVdBUkVcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gU2VjdXJpdHkgbWlkZGxld2FyZVxuYXBwLnVzZShoZWxtZXQoe1xuICBjcm9zc09yaWdpblJlc291cmNlUG9saWN5OiB7IHBvbGljeTogXCJjcm9zcy1vcmlnaW5cIiB9LFxuICBjb250ZW50U2VjdXJpdHlQb2xpY3k6IGZhbHNlIC8vIERpc2FibGUgZm9yIGRldmVsb3BtZW50XG59KSk7XG5cbi8vIENPUlMgY29uZmlndXJhdGlvbiBmb3IgTW9yb2Njb1xuYXBwLnVzZShjb3JzKHtcbiAgb3JpZ2luOiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nIFxuICAgID8gWydodHRwczovL3lvdXJhcHAuY29tJywgJ2h0dHA6Ly95b3VyLWVjMi1pcCddIFxuICAgIDogdHJ1ZSxcbiAgY3JlZGVudGlhbHM6IHRydWUsXG4gIG1ldGhvZHM6IFsnR0VUJywgJ1BPU1QnLCAnUFVUJywgJ0RFTEVURScsICdQQVRDSCddLFxuICBhbGxvd2VkSGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbicsICdBY2NlcHQtTGFuZ3VhZ2UnXVxufSkpO1xuXG4vLyBDb21wcmVzc2lvbiBtaWRkbGV3YXJlXG5hcHAudXNlKGNvbXByZXNzaW9uKCkpO1xuXG4vLyBSYXRlIGxpbWl0aW5nXG5jb25zdCBsaW1pdGVyID0gcmF0ZUxpbWl0KHtcbiAgd2luZG93TXM6IDE1ICogNjAgKiAxMDAwLCAvLyAxNSBtaW51dGVzXG4gIG1heDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJyA/IDEwMCA6IDEwMDAsIC8vIExpbWl0IGVhY2ggSVBcbiAgbWVzc2FnZToge1xuICAgIGVycm9yOiAnVG9vIG1hbnkgcmVxdWVzdHMgZnJvbSB0aGlzIElQLCBwbGVhc2UgdHJ5IGFnYWluIGxhdGVyLicsXG4gICAgZXJyb3JfYXI6ICfYt9mE2KjYp9iqINmD2KvZitix2Kkg2KzYr9in2Ysg2YXZhiDZh9iw2Kcg2KfZhNi52YbZiNin2YbYjCDZitix2KzZiSDYp9mE2YXYrdin2YjZhNipINmE2KfYrdmC2KfZiydcbiAgfSxcbiAgc3RhbmRhcmRIZWFkZXJzOiB0cnVlLFxuICBsZWdhY3lIZWFkZXJzOiBmYWxzZVxufSk7XG5hcHAudXNlKCcvYXBpLycsIGxpbWl0ZXIpO1xuXG4vLyBCb2R5IHBhcnNpbmcgbWlkZGxld2FyZVxuYXBwLnVzZShleHByZXNzLmpzb24oeyBsaW1pdDogJzEwbWInIH0pKTtcbmFwcC51c2UoZXhwcmVzcy51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IHRydWUsIGxpbWl0OiAnMTBtYicgfSkpO1xuXG4vLyBMb2dnaW5nIG1pZGRsZXdhcmVcbmlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Rlc3QnKSB7XG4gIGFwcC51c2UobW9yZ2FuKCdjb21iaW5lZCcpKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ1VTVE9NIE1JRERMRVdBUkVcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gTGFuZ3VhZ2UgZGV0ZWN0aW9uIG1pZGRsZXdhcmVcbmFwcC51c2UoKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIGNvbnN0IGFjY2VwdExhbmd1YWdlID0gcmVxLmhlYWRlcnNbJ2FjY2VwdC1sYW5ndWFnZSddO1xuICBjb25zdCBzdXBwb3J0ZWRMYW5ndWFnZXM6IEFycmF5PCdhcicgfCAnZnInIHwgJ2VuJz4gPSBbJ2FyJywgJ2ZyJywgJ2VuJ107XG4gIFxuICAvLyBEZWZhdWx0IHRvIEFyYWJpYyBmb3IgTW9yb2Njb1xuICBsZXQgbGFuZ3VhZ2U6ICdhcicgfCAnZnInIHwgJ2VuJyA9ICdhcic7XG4gIFxuICBpZiAoYWNjZXB0TGFuZ3VhZ2UpIHtcbiAgICBjb25zdCBwcmVmZXJyZWRMYW5ndWFnZSA9IGFjY2VwdExhbmd1YWdlLnNwbGl0KCcsJylbMF0uc3BsaXQoJy0nKVswXSBhcyAnYXInIHwgJ2ZyJyB8ICdlbic7XG4gICAgaWYgKHN1cHBvcnRlZExhbmd1YWdlcy5pbmNsdWRlcyhwcmVmZXJyZWRMYW5ndWFnZSkpIHtcbiAgICAgIGxhbmd1YWdlID0gcHJlZmVycmVkTGFuZ3VhZ2U7XG4gICAgfVxuICB9XG4gIFxuICByZXEubGFuZ3VhZ2UgPSBsYW5ndWFnZTtcbiAgbmV4dCgpO1xufSk7XG5cbi8vIFJlcXVlc3QgdGltaW5nIG1pZGRsZXdhcmVcbmFwcC51c2UoKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIHJlcS5zdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICBuZXh0KCk7XG59KTtcblxuLy8gUmVzcG9uc2UgdGltaW5nIG1pZGRsZXdhcmVcbmFwcC51c2UoKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gIGNvbnN0IG9yaWdpbmFsU2VuZCA9IHJlcy5zZW5kO1xuICByZXMuc2VuZCA9IGZ1bmN0aW9uKGRhdGE6IGFueSkge1xuICAgIGNvbnN0IHJlc3BvbnNlVGltZSA9IERhdGUubm93KCkgLSAocmVxLnN0YXJ0VGltZSB8fCBEYXRlLm5vdygpKTtcbiAgICByZXMuaGVhZGVyKCdYLVJlc3BvbnNlLVRpbWUnLCBgJHtyZXNwb25zZVRpbWV9bXNgKTtcbiAgICByZXR1cm4gb3JpZ2luYWxTZW5kLmNhbGwodGhpcywgZGF0YSk7XG4gIH07XG4gIG5leHQoKTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBST1VURVNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gSGVhbHRoIGNoZWNrIGVuZHBvaW50XG5hcHAuZ2V0KCcvaGVhbHRoJywgYXN5bmMgKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICB0cnkge1xuICAgIC8vIFRlc3QgZGF0YWJhc2UgY29ubmVjdGlvblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRiLnF1ZXJ5PHtzZXJ2ZXJfdGltZTogc3RyaW5nLCBkYl92ZXJzaW9uOiBzdHJpbmd9PignU0VMRUNUIE5PVygpIGFzIHNlcnZlcl90aW1lLCB2ZXJzaW9uKCkgYXMgZGJfdmVyc2lvbicpO1xuICAgIFxuICAgIGNvbnN0IHJlc3BvbnNlOiBIZWFsdGhSZXNwb25zZSA9IHtcbiAgICAgIHN0YXR1czogJ2hlYWx0aHknLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBzZXJ2ZXJfdGltZTogcmVzdWx0LnJvd3NbMF0uc2VydmVyX3RpbWUsXG4gICAgICBkYXRhYmFzZTogJ2Nvbm5lY3RlZCcsXG4gICAgICBkYXRhYmFzZV92ZXJzaW9uOiByZXN1bHQucm93c1swXS5kYl92ZXJzaW9uLnNwbGl0KCcgJylbMF0sXG4gICAgICBlbnZpcm9ubWVudDogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgfHwgJ2RldmVsb3BtZW50JyxcbiAgICAgIHZlcnNpb246IHBhY2thZ2VKc29uLnZlcnNpb25cbiAgICB9O1xuXG4gICAgcmVzLmpzb24ocmVzcG9uc2UpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IHJlc3BvbnNlOiBIZWFsdGhSZXNwb25zZSA9IHtcbiAgICAgIHN0YXR1czogJ3VuaGVhbHRoeScsXG4gICAgICBlcnJvcjogJ0RhdGFiYXNlIGNvbm5lY3Rpb24gZmFpbGVkJyxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgdmVyc2lvbjogcGFja2FnZUpzb24udmVyc2lvblxuICAgIH07XG5cbiAgICByZXMuc3RhdHVzKDUwMykuanNvbihyZXNwb25zZSk7XG4gIH1cbn0pO1xuXG4vLyBBUEkgcm91dGVzXG5hcHAudXNlKCcvYXBpL2F1dGgnLCBhdXRoUm91dGVzKTtcbmFwcC51c2UoJy9hcGkvcHJvZHVjdHMnLCBwcm9kdWN0Um91dGVzKTtcbmFwcC51c2UoJy9hcGkvY2F0ZWdvcmllcycsIGNhdGVnb3J5Um91dGVzKTtcbmFwcC51c2UoJy9hcGkvY2FydCcsIGNhcnRSb3V0ZXMpO1xuYXBwLnVzZSgnL2FwaS9vcmRlcnMnLCBvcmRlclJvdXRlcyk7XG5hcHAudXNlKCcvYXBpL2NvZCcsIGNvZFJvdXRlcyk7XG5hcHAudXNlKCcvYXBpL2FkbWluJywgYWRtaW5Sb3V0ZXMpO1xuXG4vLyBSb290IGVuZHBvaW50IHdpdGggQVBJIGluZm9cbmFwcC5nZXQoJy8nLCAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gIGNvbnN0IHJlc3BvbnNlOiBBcGlJbmZvUmVzcG9uc2UgPSB7XG4gICAgbmFtZTogJ0toYW1zYSBDYXJ0IEFQSScsXG4gICAgdmVyc2lvbjogcGFja2FnZUpzb24udmVyc2lvbixcbiAgICBkZXNjcmlwdGlvbjogJ01vcm9jY29cXCdzIGJsZXNzZWQgbWFya2V0cGxhY2UgLSBFLWNvbW1lcmNlIEFQSSB3aXRoIHByb3RlY3Rpb24gYW5kIHByb3NwZXJpdHknLFxuICAgIGZlYXR1cmVzOiBbXG4gICAgICAnTXVsdGktbGFuZ3VhZ2Ugc3VwcG9ydCAoQXJhYmljLCBGcmVuY2gsIEVuZ2xpc2gpJyxcbiAgICAgICdDYXNoIG9uIERlbGl2ZXJ5IChDT0QpIHN1cHBvcnQnLFxuICAgICAgJ1Byb2R1Y3QgdmFyaWFudHMgYW5kIGludmVudG9yeSBtYW5hZ2VtZW50JyxcbiAgICAgICdPcmRlciB0cmFja2luZyBhbmQgbWFuYWdlbWVudCcsXG4gICAgICAnQWdlIHZlcmlmaWNhdGlvbiBmb3IgdmFwZSBwcm9kdWN0cycsXG4gICAgICAnTW9yb2Njby1zcGVjaWZpYyBkZWxpdmVyeSB6b25lcydcbiAgICBdLFxuICAgIGVuZHBvaW50czoge1xuICAgICAgaGVhbHRoOiAnL2hlYWx0aCcsXG4gICAgICBhdXRoOiAnL2FwaS9hdXRoJyxcbiAgICAgIHByb2R1Y3RzOiAnL2FwaS9wcm9kdWN0cycsXG4gICAgICBjYXRlZ29yaWVzOiAnL2FwaS9jYXRlZ29yaWVzJyxcbiAgICAgIG9yZGVyczogJy9hcGkvb3JkZXJzJyxcbiAgICAgIGNvZDogJy9hcGkvY29kJyxcbiAgICAgIGFkbWluOiAnL2FwaS9hZG1pbidcbiAgICB9LFxuICAgIGxhbmd1YWdlOiByZXEubGFuZ3VhZ2UgfHwgJ2FyJyxcbiAgICBkb2N1bWVudGF0aW9uOiAnL2FwaS9kb2NzJyAvLyBUT0RPOiBBZGQgQVBJIGRvY3VtZW50YXRpb25cbiAgfTtcblxuICByZXMuanNvbihyZXNwb25zZSk7XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRVJST1IgSEFORExJTkdcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gNDA0IGhhbmRsZXJcbmFwcC51c2UoKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICByZXMuc3RhdHVzKDQwNCkuanNvbih7XG4gICAgZXJyb3I6ICdFbmRwb2ludCBub3QgZm91bmQnLFxuICAgIGVycm9yX2FyOiAn2KfZhNi12YHYrdipINi62YrYsSDZhdmI2KzZiNiv2KknLFxuICAgIGVycm9yX2ZyOiAnUG9pbnQgZGUgdGVybWluYWlzb24gbm9uIHRyb3V2w6knLFxuICAgIHBhdGg6IHJlcS5wYXRoLFxuICAgIG1ldGhvZDogcmVxLm1ldGhvZCxcbiAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICB9KTtcbn0pO1xuXG4vLyBHbG9iYWwgZXJyb3IgaGFuZGxlclxuYXBwLnVzZSgoZXJyb3I6IEN1c3RvbUVycm9yLCByZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UsIG5leHQ6IE5leHRGdW5jdGlvbik6IFJlc3BvbnNlIHwgdm9pZCA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOicsIGVycm9yKTtcbiAgXG4gIC8vIERhdGFiYXNlIGNvbm5lY3Rpb24gZXJyb3JzXG4gIGlmIChlcnJvci5jb2RlID09PSAnRUNPTk5SRUZVU0VEJykge1xuICAgIHJldHVybiByZXMuc3RhdHVzKDUwMykuanNvbih7XG4gICAgICBlcnJvcjogJ0RhdGFiYXNlIGNvbm5lY3Rpb24gZmFpbGVkJyxcbiAgICAgIGVycm9yX2FyOiAn2YHYtNmEINin2YTYp9iq2LXYp9mEINio2YLYp9i52K/YqSDYp9mE2KjZitin2YbYp9iqJyxcbiAgICAgIGVycm9yX2ZyOiAnw4ljaGVjIGRlIGxhIGNvbm5leGlvbiDDoCBsYSBiYXNlIGRlIGRvbm7DqWVzJ1xuICAgIH0pO1xuICB9XG4gIFxuICAvLyBWYWxpZGF0aW9uIGVycm9yc1xuICBpZiAoZXJyb3IubmFtZSA9PT0gJ1ZhbGlkYXRpb25FcnJvcicpIHtcbiAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgZXJyb3I6ICdWYWxpZGF0aW9uIGZhaWxlZCcsXG4gICAgICBlcnJvcl9hcjogJ9mB2LTZhCDZgdmKINin2YTYqtit2YLZgiDZhdmGINin2YTYqNmK2KfZhtin2KonLFxuICAgICAgZXJyb3JfZnI6ICfDiWNoZWMgZGUgbGEgdmFsaWRhdGlvbicsXG4gICAgICBkZXRhaWxzOiBlcnJvci5kZXRhaWxzXG4gICAgfSk7XG4gIH1cbiAgXG4gIC8vIEpXVCBlcnJvcnNcbiAgaWYgKGVycm9yLm5hbWUgPT09ICdKc29uV2ViVG9rZW5FcnJvcicpIHtcbiAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDEpLmpzb24oe1xuICAgICAgZXJyb3I6ICdJbnZhbGlkIHRva2VuJyxcbiAgICAgIGVycm9yX2FyOiAn2LHZhdiyINi62YrYsSDYtdit2YrYrScsXG4gICAgICBlcnJvcl9mcjogJ0pldG9uIGludmFsaWRlJ1xuICAgIH0pO1xuICB9XG4gIFxuICAvLyBQb3N0Z3JlU1FMIGVycm9yc1xuICBpZiAoZXJyb3IuY29kZSkge1xuICAgIHN3aXRjaCAoZXJyb3IuY29kZSkge1xuICAgICAgY2FzZSAnMjM1MDUnOiAvLyBVbmlxdWUgdmlvbGF0aW9uXG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwOSkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdSZXNvdXJjZSBhbHJlYWR5IGV4aXN0cycsXG4gICAgICAgICAgZXJyb3JfYXI6ICfYp9mE2YXZiNix2K8g2YXZiNis2YjYryDYqNin2YTZgdi52YQnLFxuICAgICAgICAgIGVycm9yX2ZyOiAnTGEgcmVzc291cmNlIGV4aXN0ZSBkw6lqw6AnLFxuICAgICAgICAgIGZpZWxkOiBlcnJvci5jb25zdHJhaW50XG4gICAgICAgIH0pO1xuICAgICAgY2FzZSAnMjM1MDMnOiAvLyBGb3JlaWduIGtleSB2aW9sYXRpb25cbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogJ1JlZmVyZW5jZWQgcmVzb3VyY2UgZG9lcyBub3QgZXhpc3QnLFxuICAgICAgICAgIGVycm9yX2FyOiAn2KfZhNmF2YjYsdivINin2YTZhdix2KzYudmKINi62YrYsSDZhdmI2KzZiNivJyxcbiAgICAgICAgICBlcnJvcl9mcjogJ0xhIHJlc3NvdXJjZSByw6lmw6lyZW5jw6llIG5cXCdleGlzdGUgcGFzJ1xuICAgICAgICB9KTtcbiAgICAgIGNhc2UgJzIzNTE0JzogLy8gQ2hlY2sgdmlvbGF0aW9uXG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdEYXRhIGNvbnN0cmFpbnQgdmlvbGF0aW9uJyxcbiAgICAgICAgICBlcnJvcl9hcjogJ9in2YbYqtmH2KfZgyDZgtmK2YjYryDYp9mE2KjZitin2YbYp9iqJyxcbiAgICAgICAgICBlcnJvcl9mcjogJ1Zpb2xhdGlvbiBkZSBjb250cmFpbnRlIGRlIGRvbm7DqWVzJ1xuICAgICAgICB9KTtcbiAgICB9XG4gIH1cbiAgXG4gIC8vIERlZmF1bHQgZXJyb3JcbiAgY29uc3Qgc3RhdHVzQ29kZSA9IGVycm9yLnN0YXR1c0NvZGUgfHwgNTAwO1xuICByZXMuc3RhdHVzKHN0YXR1c0NvZGUpLmpzb24oe1xuICAgIGVycm9yOiBzdGF0dXNDb2RlID09PSA1MDAgPyAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyA6IGVycm9yLm1lc3NhZ2UsXG4gICAgZXJyb3JfYXI6IHN0YXR1c0NvZGUgPT09IDUwMCA/ICfYrti32KMg2K/Yp9iu2YTZiiDZgdmKINin2YTYrtin2K/ZhScgOiBlcnJvci5tZXNzYWdlX2FyLFxuICAgIGVycm9yX2ZyOiBzdGF0dXNDb2RlID09PSA1MDAgPyAnRXJyZXVyIGludGVybmUgZHUgc2VydmV1cicgOiBlcnJvci5tZXNzYWdlX2ZyLFxuICAgIC4uLihwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JyAmJiB7IHN0YWNrOiBlcnJvci5zdGFjayB9KVxuICB9KTtcbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBHUkFDRUZVTCBTSFVURE9XTlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5wcm9jZXNzLm9uKCdTSUdURVJNJywgYXN5bmMgKCkgPT4ge1xuICBjb25zb2xlLmxvZygnU0lHVEVSTSByZWNlaXZlZCwgc2h1dHRpbmcgZG93biBncmFjZWZ1bGx5Li4uJyk7XG4gIFxuICAvLyBDbG9zZSBkYXRhYmFzZSBjb25uZWN0aW9uc1xuICBhd2FpdCBkYi5jbG9zZSgpO1xuICBcbiAgcHJvY2Vzcy5leGl0KDApO1xufSk7XG5cbnByb2Nlc3Mub24oJ1NJR0lOVCcsIGFzeW5jICgpID0+IHtcbiAgY29uc29sZS5sb2coJ1NJR0lOVCByZWNlaXZlZCwgc2h1dHRpbmcgZG93biBncmFjZWZ1bGx5Li4uJyk7XG4gIFxuICAvLyBDbG9zZSBkYXRhYmFzZSBjb25uZWN0aW9uc1xuICBhd2FpdCBkYi5jbG9zZSgpO1xuICBcbiAgcHJvY2Vzcy5leGl0KDApO1xufSk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNUQVJUIFNFUlZFUlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyBUZXN0IGRhdGFiYXNlIGNvbm5lY3Rpb24gYmVmb3JlIHN0YXJ0aW5nIHNlcnZlclxuYXN5bmMgZnVuY3Rpb24gc3RhcnRTZXJ2ZXIoKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgYXdhaXQgZGIucXVlcnkoJ1NFTEVDVCAxJyk7XG4gICAgY29uc29sZS5sb2coJ+KchSBEYXRhYmFzZSBjb25uZWN0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgXG4gICAgYXBwLmxpc3RlbihQT1JULCAnMC4wLjAuMCcsICgpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5qAIEdyb2NlcnlWYXBlIE1vcm9jY28gQVBJIFNlcnZlciBydW5uaW5nIG9uIHBvcnQgJHtQT1JUfWApO1xuICAgICAgY29uc29sZS5sb2coYPCfjI0gRW52aXJvbm1lbnQ6ICR7cHJvY2Vzcy5lbnYuTk9ERV9FTlYgfHwgJ2RldmVsb3BtZW50J31gKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OKIEhlYWx0aCBjaGVjazogaHR0cDovL2xvY2FsaG9zdDoke1BPUlR9L2hlYWx0aGApO1xuICAgICAgY29uc29sZS5sb2coYPCfk7EgQVBJIGJhc2UgVVJMOiBodHRwOi8vbG9jYWxob3N0OiR7UE9SVH0vYXBpYCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+HsvCfh6YgU3VwcG9ydGluZyBsYW5ndWFnZXM6IEFyYWJpYywgRnJlbmNoLCBFbmdsaXNoYCk7XG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcic7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBjb25uZWN0IHRvIGRhdGFiYXNlOicsIGVycm9yTWVzc2FnZSk7XG4gICAgY29uc29sZS5lcnJvcignUGxlYXNlIGNoZWNrIHlvdXIgZGF0YWJhc2UgY29uZmlndXJhdGlvbiBpbiAuZW52IGZpbGUnKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuc3RhcnRTZXJ2ZXIoKTtcblxuZXhwb3J0IGRlZmF1bHQgYXBwOyJdfQ==