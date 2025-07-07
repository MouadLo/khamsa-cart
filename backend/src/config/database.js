const { Pool } = require('pg');
require('dotenv').config();

// Database configuration for PostgreSQL
const dbConfig = {
  // Connection parameters
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'groceryvape_morocco',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  
  // Connection pool settings
  max: process.env.DB_POOL_MAX || 20, // Maximum number of connections
  min: process.env.DB_POOL_MIN || 5,  // Minimum number of connections
  idle: process.env.DB_POOL_IDLE || 10000, // Close connections after 10 seconds of inactivity
  
  // Connection timeouts
  connectionTimeoutMillis: 30000, // 30 seconds
  idleTimeoutMillis: 30000,       // 30 seconds
  query_timeout: 60000,           // 60 seconds
  
  // SSL configuration (important for production)
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  
  // Application name for monitoring
  application_name: 'groceryvape_morocco_api'
};

// Create connection pool
const pool = new Pool(dbConfig);

// Pool event handlers
pool.on('connect', (client) => {
  console.log(`📦 New database connection established (PID: ${client.processID})`);
  
  // Set default timezone to Morocco
  client.query("SET timezone = 'Africa/Casablanca'");
  
  // Set default character encoding for Arabic support
  client.query("SET client_encoding = 'UTF8'");
});

pool.on('error', (err, client) => {
  console.error('❌ Database pool error:', err);
  console.error(`Client PID: ${client?.processID}`);
});

pool.on('acquire', (client) => {
  console.log(`🔗 Database connection acquired (PID: ${client.processID})`);
});

pool.on('release', (client) => {
  console.log(`🔓 Database connection released (PID: ${client.processID})`);
});

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query(`
      SELECT 
        version() as version,
        current_database() as database,
        current_user as user,
        NOW() AT TIME ZONE 'Africa/Casablanca' as morocco_time,
        pg_size_pretty(pg_database_size(current_database())) as database_size
    `);
    
    console.log('✅ Database connection test successful:');
    console.log(`   📊 Database: ${result.rows[0].database}`);
    console.log(`   👤 User: ${result.rows[0].user}`);
    console.log(`   🕐 Morocco Time: ${result.rows[0].morocco_time}`);
    console.log(`   💾 Size: ${result.rows[0].database_size}`);
    console.log(`   🗄️  Version: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
    
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

// Query wrapper with error handling and logging
async function query(text, params = []) {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (> 1 second)
    if (duration > 1000) {
      console.warn(`🐌 Slow query (${duration}ms):`, text.substring(0, 100) + '...');
    }
    
    // Log in development mode
    if (process.env.NODE_ENV === 'development' && process.env.LOG_QUERIES === 'true') {
      console.log(`📝 Query (${duration}ms):`, text);
      if (params.length > 0) {
        console.log('   Parameters:', params);
      }
    }
    
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error.message);
    console.error('   Query:', text);
    if (params.length > 0) {
      console.error('   Parameters:', params);
    }
    throw error;
  }
}

// Transaction wrapper
async function transaction(callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Execute the callback with the client
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction rolled back:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Helper function for paginated queries
function buildPaginationQuery(baseQuery, page = 1, limit = 20, orderBy = 'created_at DESC') {
  const offset = (page - 1) * limit;
  return `
    ${baseQuery}
    ORDER BY ${orderBy}
    LIMIT $${baseQuery.split('$').length} OFFSET $${baseQuery.split('$').length + 1}
  `;
}

// Helper function for search queries with Arabic support
function buildSearchQuery(searchTerm, language = 'ar') {
  if (!searchTerm) return '';
  
  const searchConfig = {
    ar: 'arabic',
    fr: 'french', 
    en: 'english'
  };
  
  const config = searchConfig[language] || 'simple';
  return `to_tsvector('${config}', COALESCE(name_${language}, '')) @@ plainto_tsquery('${config}', $1)`;
}

// Database health check
async function healthCheck() {
  try {
    const result = await query(`
      SELECT 
        pg_stat_database.numbackends as active_connections,
        pg_stat_database.xact_commit as transactions_committed,
        pg_stat_database.xact_rollback as transactions_rolled_back,
        pg_database_size(pg_database.datname) as database_size_bytes
      FROM pg_stat_database
      JOIN pg_database ON pg_stat_database.datname = pg_database.datname
      WHERE pg_stat_database.datname = current_database()
    `);
    
    const stats = result.rows[0];
    
    return {
      status: 'healthy',
      active_connections: stats.active_connections,
      total_transactions: parseInt(stats.transactions_committed) + parseInt(stats.transactions_rolled_back),
      database_size_mb: Math.round(stats.database_size_bytes / 1024 / 1024),
      pool_info: {
        total_connections: pool.totalCount,
        idle_connections: pool.idleCount,
        waiting_requests: pool.waitingCount
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

// Graceful shutdown
async function close() {
  console.log('🔌 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  healthCheck,
  close,
  buildPaginationQuery,
  buildSearchQuery
};