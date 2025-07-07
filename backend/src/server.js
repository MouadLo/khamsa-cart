const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const codRoutes = require('./routes/cod');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Disable for development
}));

// CORS configuration for Morocco
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourapp.com', 'http://your-ec2-ip'] 
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language']
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
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
  res.send = function(data) {
    const responseTime = Date.now() - req.startTime;
    res.header('X-Response-Time', `${responseTime}ms`);
    originalSend.call(this, data);
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
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      server_time: result.rows[0].server_time,
      database: 'connected',
      database_version: result.rows[0].db_version.split(' ')[0],
      environment: process.env.NODE_ENV || 'development',
      version: require('../package.json').version
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cod', codRoutes);
app.use('/api/admin', adminRoutes);

// Root endpoint with API info
app.get('/', (req, res) => {
  res.json({
    name: 'Khamsa Cart API',
    version: require('../package.json').version,
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
    language: req.language,
    documentation: '/api/docs' // TODO: Add API documentation
  });
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
  await db.end();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  // Close database connections
  await db.end();
  
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
  } catch (error) {
    console.error('❌ Failed to connect to database:', error.message);
    console.error('Please check your database configuration in .env file');
    process.exit(1);
  }
}

startServer();

module.exports = app;