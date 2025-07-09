import { Pool, PoolClient, QueryResult } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// Type definitions
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  min: number;
  idle: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  query_timeout: number;
  ssl: boolean | { rejectUnauthorized: boolean };
  application_name: string;
}

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  active_connections?: number;
  total_transactions?: number;
  database_size_mb?: number;
  pool_info?: {
    total_connections: number;
    idle_connections: number;
    waiting_requests: number;
  };
  error?: string;
}

interface DatabaseStats {
  active_connections: string;
  transactions_committed: string;
  transactions_rolled_back: string;
  database_size_bytes: string;
}

interface ConnectionTestResult {
  version: string;
  database: string;
  user: string;
  morocco_time: string;
  database_size: string;
}

// Database configuration for PostgreSQL
const dbConfig: DatabaseConfig = {
  // Connection parameters
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'groceryvape_morocco',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum number of connections
  min: parseInt(process.env.DB_POOL_MIN || '5'),  // Minimum number of connections
  idle: parseInt(process.env.DB_POOL_IDLE || '10000'), // Close connections after 10 seconds of inactivity
  
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
pool.on('connect', (client: PoolClient) => {
  console.log(`📦 New database connection established (PID: ${(client as any).processID || 'unknown'})`);
  
  // Set default timezone to Morocco
  client.query("SET timezone = 'Africa/Casablanca'");
  
  // Set default character encoding for Arabic support
  client.query("SET client_encoding = 'UTF8'");
});

pool.on('error', (err: Error, client?: PoolClient) => {
  console.error('❌ Database pool error:', err);
  console.error(`Client PID: ${(client as any)?.processID || 'unknown'}`);
});

pool.on('acquire', (client: PoolClient) => {
  console.log(`🔗 Database connection acquired (PID: ${(client as any).processID || 'unknown'})`);
});

pool.on('release', (err: Error, client: PoolClient) => {
  console.log(`🔓 Database connection released (PID: ${(client as any)?.processID || 'unknown'})`);
});

// Test database connection
async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result: QueryResult<ConnectionTestResult> = await client.query(`
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Database connection test failed:', errorMessage);
    return false;
  }
}

// Query wrapper with error handling and logging
async function query<T extends Record<string, any> = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
  const start = Date.now();
  
  try {
    const result: QueryResult<T> = await pool.query(text, params);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Database query error:', errorMessage);
    console.error('   Query:', text);
    if (params.length > 0) {
      console.error('   Parameters:', params);
    }
    throw error;
  }
}

// Transaction wrapper
async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Execute the callback with the client
    const result = await callback(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Transaction rolled back:', errorMessage);
    throw error;
  } finally {
    client.release();
  }
}

// Helper function for paginated queries
function buildPaginationQuery(baseQuery: string, page: number = 1, limit: number = 20, orderBy: string = 'created_at DESC'): string {
  const offset = (page - 1) * limit;
  return `
    ${baseQuery}
    ORDER BY ${orderBy}
    LIMIT $${baseQuery.split('$').length} OFFSET $${baseQuery.split('$').length + 1}
  `;
}

// Helper function for search queries with Arabic support
function buildSearchQuery(searchTerm: string, language: 'ar' | 'fr' | 'en' = 'ar'): string {
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
async function healthCheck(): Promise<HealthCheckResult> {
  try {
    const result: QueryResult<DatabaseStats> = await query(`
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
      active_connections: parseInt(stats.active_connections),
      total_transactions: parseInt(stats.transactions_committed) + parseInt(stats.transactions_rolled_back),
      database_size_mb: Math.round(parseInt(stats.database_size_bytes) / 1024 / 1024),
      pool_info: {
        total_connections: pool.totalCount,
        idle_connections: pool.idleCount,
        waiting_requests: pool.waitingCount
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'unhealthy',
      error: errorMessage
    };
  }
}

// Graceful shutdown
async function close(): Promise<void> {
  console.log('🔌 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
}

export {
  pool,
  query,
  transaction,
  testConnection,
  healthCheck,
  close,
  buildPaginationQuery,
  buildSearchQuery,
  DatabaseConfig,
  HealthCheckResult
};