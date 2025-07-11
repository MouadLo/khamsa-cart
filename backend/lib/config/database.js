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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSearchQuery = exports.buildPaginationQuery = exports.close = exports.healthCheck = exports.testConnection = exports.transaction = exports.query = exports.pool = void 0;
const pg_1 = require("pg");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// Database configuration for PostgreSQL
const dbConfig = {
    // Connection parameters
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'groceryvape_morocco',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum number of connections
    min: parseInt(process.env.DB_POOL_MIN || '5'), // Minimum number of connections
    idle: parseInt(process.env.DB_POOL_IDLE || '10000'), // Close connections after 10 seconds of inactivity
    // Connection timeouts
    connectionTimeoutMillis: 30000, // 30 seconds
    idleTimeoutMillis: 30000, // 30 seconds
    query_timeout: 60000, // 60 seconds
    // SSL configuration (important for production)
    ssl: false, // Disable SSL for development
    // Application name for monitoring
    application_name: 'groceryvape_morocco_api'
};
// Create connection pool
const pool = new pg_1.Pool(dbConfig);
exports.pool = pool;
// Pool event handlers
pool.on('connect', (client) => {
    console.log(`📦 New database connection established (PID: ${client.processID || 'unknown'})`);
    // Set default timezone to Morocco
    client.query("SET timezone = 'Africa/Casablanca'");
    // Set default character encoding for Arabic support
    client.query("SET client_encoding = 'UTF8'");
});
pool.on('error', (err, client) => {
    console.error('❌ Database pool error:', err);
    console.error(`Client PID: ${client?.processID || 'unknown'}`);
});
pool.on('acquire', (client) => {
    console.log(`🔗 Database connection acquired (PID: ${client.processID || 'unknown'})`);
});
pool.on('release', (err, client) => {
    console.log(`🔓 Database connection released (PID: ${client?.processID || 'unknown'})`);
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Database connection test failed:', errorMessage);
        return false;
    }
}
exports.testConnection = testConnection;
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Database query error:', errorMessage);
        console.error('   Query:', text);
        if (params.length > 0) {
            console.error('   Parameters:', params);
        }
        throw error;
    }
}
exports.query = query;
// Transaction wrapper
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Execute the callback with the client
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Transaction rolled back:', errorMessage);
        throw error;
    }
    finally {
        client.release();
    }
}
exports.transaction = transaction;
// Helper function for paginated queries
function buildPaginationQuery(baseQuery, page = 1, limit = 20, orderBy = 'created_at DESC') {
    const offset = (page - 1) * limit;
    return `
    ${baseQuery}
    ORDER BY ${orderBy}
    LIMIT $${baseQuery.split('$').length} OFFSET $${baseQuery.split('$').length + 1}
  `;
}
exports.buildPaginationQuery = buildPaginationQuery;
// Helper function for search queries with Arabic support
function buildSearchQuery(searchTerm, language = 'ar') {
    if (!searchTerm)
        return '';
    const searchConfig = {
        ar: 'arabic',
        fr: 'french',
        en: 'english'
    };
    const config = searchConfig[language] || 'simple';
    return `to_tsvector('${config}', COALESCE(name_${language}, '')) @@ plainto_tsquery('${config}', $1)`;
}
exports.buildSearchQuery = buildSearchQuery;
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
            active_connections: parseInt(stats.active_connections),
            total_transactions: parseInt(stats.transactions_committed) + parseInt(stats.transactions_rolled_back),
            database_size_mb: Math.round(parseInt(stats.database_size_bytes) / 1024 / 1024),
            pool_info: {
                total_connections: pool.totalCount,
                idle_connections: pool.idleCount,
                waiting_requests: pool.waitingCount
            }
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            status: 'unhealthy',
            error: errorMessage
        };
    }
}
exports.healthCheck = healthCheck;
// Graceful shutdown
async function close() {
    console.log('🔌 Closing database connections...');
    await pool.end();
    console.log('✅ Database connections closed');
}
exports.close = close;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29uZmlnL2RhdGFiYXNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkJBQW1EO0FBQ25ELCtDQUFpQztBQUVqQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7QUErQ2hCLHdDQUF3QztBQUN4QyxNQUFNLFFBQVEsR0FBbUI7SUFDL0Isd0JBQXdCO0lBQ3hCLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxXQUFXO0lBQ3hDLElBQUksRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksTUFBTSxDQUFDO0lBQzdDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxxQkFBcUI7SUFDdEQsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxJQUFJLFVBQVU7SUFDdkMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLFVBQVU7SUFFL0MsMkJBQTJCO0lBQzNCLEdBQUcsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLEVBQUUsZ0NBQWdDO0lBQ2hGLEdBQUcsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksR0FBRyxDQUFDLEVBQUcsZ0NBQWdDO0lBQ2hGLElBQUksRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksT0FBTyxDQUFDLEVBQUUsbURBQW1EO0lBRXhHLHNCQUFzQjtJQUN0Qix1QkFBdUIsRUFBRSxLQUFLLEVBQUUsYUFBYTtJQUM3QyxpQkFBaUIsRUFBRSxLQUFLLEVBQVEsYUFBYTtJQUM3QyxhQUFhLEVBQUUsS0FBSyxFQUFZLGFBQWE7SUFFN0MsK0NBQStDO0lBQy9DLEdBQUcsRUFBRSxLQUFLLEVBQUUsOEJBQThCO0lBRTFDLGtDQUFrQztJQUNsQyxnQkFBZ0IsRUFBRSx5QkFBeUI7Q0FDNUMsQ0FBQztBQUVGLHlCQUF5QjtBQUN6QixNQUFNLElBQUksR0FBRyxJQUFJLFNBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztBQWtMOUIsb0JBQUk7QUFoTE4sc0JBQXNCO0FBQ3RCLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsTUFBa0IsRUFBRSxFQUFFO0lBQ3hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0RBQWlELE1BQWMsQ0FBQyxTQUFTLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztJQUV2RyxrQ0FBa0M7SUFDbEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO0lBRW5ELG9EQUFvRDtJQUNwRCxNQUFNLENBQUMsS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7QUFDL0MsQ0FBQyxDQUFDLENBQUM7QUFFSCxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQVUsRUFBRSxNQUFtQixFQUFFLEVBQUU7SUFDbkQsT0FBTyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUM3QyxPQUFPLENBQUMsS0FBSyxDQUFDLGVBQWdCLE1BQWMsRUFBRSxTQUFTLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztBQUMxRSxDQUFDLENBQUMsQ0FBQztBQUVILElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsTUFBa0IsRUFBRSxFQUFFO0lBQ3hDLE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQTBDLE1BQWMsQ0FBQyxTQUFTLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUNsRyxDQUFDLENBQUMsQ0FBQztBQUVILElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBVSxFQUFFLE1BQWtCLEVBQUUsRUFBRTtJQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLHlDQUEwQyxNQUFjLEVBQUUsU0FBUyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbkcsQ0FBQyxDQUFDLENBQUM7QUFFSCwyQkFBMkI7QUFDM0IsS0FBSyxVQUFVLGNBQWM7SUFDM0IsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDcEMsTUFBTSxNQUFNLEdBQXNDLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQzs7Ozs7OztLQU9wRSxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDM0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUUzRixNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sWUFBWSxHQUFHLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQztRQUM5RSxPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztBQUNILENBQUM7QUFnSUMsd0NBQWM7QUE5SGhCLGdEQUFnRDtBQUNoRCxLQUFLLFVBQVUsS0FBSyxDQUFzQyxJQUFZLEVBQUUsU0FBZ0IsRUFBRTtJQUN4RixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFekIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQW1CLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDOUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUVwQyxnQ0FBZ0M7UUFDaEMsSUFBSSxRQUFRLEdBQUcsSUFBSSxFQUFFLENBQUM7WUFDcEIsT0FBTyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsUUFBUSxNQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFDakYsQ0FBQztRQUVELDBCQUEwQjtRQUMxQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxLQUFLLGFBQWEsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUNqRixPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsUUFBUSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0MsSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN0QixPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3hDLENBQUM7UUFDSCxDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixNQUFNLFlBQVksR0FBRyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUM7UUFDOUUsT0FBTyxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN2RCxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNqQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDdEIsT0FBTyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBQ0QsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQTZGQyxzQkFBSztBQTNGUCxzQkFBc0I7QUFDdEIsS0FBSyxVQUFVLFdBQVcsQ0FBSSxRQUE0QztJQUN4RSxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUVwQyxJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFNUIsdUNBQXVDO1FBQ3ZDLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXRDLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3QixPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvQixNQUFNLFlBQVksR0FBRyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUM7UUFDOUUsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMxRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7WUFBUyxDQUFDO1FBQ1QsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUM7QUFDSCxDQUFDO0FBd0VDLGtDQUFXO0FBdEViLHdDQUF3QztBQUN4QyxTQUFTLG9CQUFvQixDQUFDLFNBQWlCLEVBQUUsT0FBZSxDQUFDLEVBQUUsUUFBZ0IsRUFBRSxFQUFFLFVBQWtCLGlCQUFpQjtJQUN4SCxNQUFNLE1BQU0sR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUM7SUFDbEMsT0FBTztNQUNILFNBQVM7ZUFDQSxPQUFPO2FBQ1QsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLFlBQVksU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQztHQUNoRixDQUFDO0FBQ0osQ0FBQztBQWtFQyxvREFBb0I7QUFoRXRCLHlEQUF5RDtBQUN6RCxTQUFTLGdCQUFnQixDQUFDLFVBQWtCLEVBQUUsV0FBK0IsSUFBSTtJQUMvRSxJQUFJLENBQUMsVUFBVTtRQUFFLE9BQU8sRUFBRSxDQUFDO0lBRTNCLE1BQU0sWUFBWSxHQUFHO1FBQ25CLEVBQUUsRUFBRSxRQUFRO1FBQ1osRUFBRSxFQUFFLFFBQVE7UUFDWixFQUFFLEVBQUUsU0FBUztLQUNkLENBQUM7SUFFRixNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksUUFBUSxDQUFDO0lBQ2xELE9BQU8sZ0JBQWdCLE1BQU0sb0JBQW9CLFFBQVEsOEJBQThCLE1BQU0sUUFBUSxDQUFDO0FBQ3hHLENBQUM7QUFxREMsNENBQWdCO0FBbkRsQix3QkFBd0I7QUFDeEIsS0FBSyxVQUFVLFdBQVc7SUFDeEIsSUFBSSxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQStCLE1BQU0sS0FBSyxDQUFDOzs7Ozs7Ozs7S0FTdEQsQ0FBQyxDQUFDO1FBRUgsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3QixPQUFPO1lBQ0wsTUFBTSxFQUFFLFNBQVM7WUFDakIsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQztZQUN0RCxrQkFBa0IsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQztZQUNyRyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO1lBQy9FLFNBQVMsRUFBRTtnQkFDVCxpQkFBaUIsRUFBRSxJQUFJLENBQUMsVUFBVTtnQkFDbEMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLFNBQVM7Z0JBQ2hDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxZQUFZO2FBQ3BDO1NBQ0YsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxZQUFZLEdBQUcsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDO1FBQzlFLE9BQU87WUFDTCxNQUFNLEVBQUUsV0FBVztZQUNuQixLQUFLLEVBQUUsWUFBWTtTQUNwQixDQUFDO0lBQ0osQ0FBQztBQUNILENBQUM7QUFjQyxrQ0FBVztBQVpiLG9CQUFvQjtBQUNwQixLQUFLLFVBQVUsS0FBSztJQUNsQixPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7SUFDbEQsTUFBTSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFRQyxzQkFBSyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBvb2wsIFBvb2xDbGllbnQsIFF1ZXJ5UmVzdWx0IH0gZnJvbSAncGcnO1xuaW1wb3J0ICogYXMgZG90ZW52IGZyb20gJ2RvdGVudic7XG5cbmRvdGVudi5jb25maWcoKTtcblxuLy8gVHlwZSBkZWZpbml0aW9uc1xuaW50ZXJmYWNlIERhdGFiYXNlQ29uZmlnIHtcbiAgaG9zdDogc3RyaW5nO1xuICBwb3J0OiBudW1iZXI7XG4gIGRhdGFiYXNlOiBzdHJpbmc7XG4gIHVzZXI6IHN0cmluZztcbiAgcGFzc3dvcmQ6IHN0cmluZztcbiAgbWF4OiBudW1iZXI7XG4gIG1pbjogbnVtYmVyO1xuICBpZGxlOiBudW1iZXI7XG4gIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIGlkbGVUaW1lb3V0TWlsbGlzOiBudW1iZXI7XG4gIHF1ZXJ5X3RpbWVvdXQ6IG51bWJlcjtcbiAgc3NsOiBib29sZWFuIHwgeyByZWplY3RVbmF1dGhvcml6ZWQ6IGJvb2xlYW4gfTtcbiAgYXBwbGljYXRpb25fbmFtZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSGVhbHRoQ2hlY2tSZXN1bHQge1xuICBzdGF0dXM6ICdoZWFsdGh5JyB8ICd1bmhlYWx0aHknO1xuICBhY3RpdmVfY29ubmVjdGlvbnM/OiBudW1iZXI7XG4gIHRvdGFsX3RyYW5zYWN0aW9ucz86IG51bWJlcjtcbiAgZGF0YWJhc2Vfc2l6ZV9tYj86IG51bWJlcjtcbiAgcG9vbF9pbmZvPzoge1xuICAgIHRvdGFsX2Nvbm5lY3Rpb25zOiBudW1iZXI7XG4gICAgaWRsZV9jb25uZWN0aW9uczogbnVtYmVyO1xuICAgIHdhaXRpbmdfcmVxdWVzdHM6IG51bWJlcjtcbiAgfTtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBEYXRhYmFzZVN0YXRzIHtcbiAgYWN0aXZlX2Nvbm5lY3Rpb25zOiBzdHJpbmc7XG4gIHRyYW5zYWN0aW9uc19jb21taXR0ZWQ6IHN0cmluZztcbiAgdHJhbnNhY3Rpb25zX3JvbGxlZF9iYWNrOiBzdHJpbmc7XG4gIGRhdGFiYXNlX3NpemVfYnl0ZXM6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENvbm5lY3Rpb25UZXN0UmVzdWx0IHtcbiAgdmVyc2lvbjogc3RyaW5nO1xuICBkYXRhYmFzZTogc3RyaW5nO1xuICB1c2VyOiBzdHJpbmc7XG4gIG1vcm9jY29fdGltZTogc3RyaW5nO1xuICBkYXRhYmFzZV9zaXplOiBzdHJpbmc7XG59XG5cbi8vIERhdGFiYXNlIGNvbmZpZ3VyYXRpb24gZm9yIFBvc3RncmVTUUxcbmNvbnN0IGRiQ29uZmlnOiBEYXRhYmFzZUNvbmZpZyA9IHtcbiAgLy8gQ29ubmVjdGlvbiBwYXJhbWV0ZXJzXG4gIGhvc3Q6IHByb2Nlc3MuZW52LkRCX0hPU1QgfHwgJ2xvY2FsaG9zdCcsXG4gIHBvcnQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPUlQgfHwgJzU0MzInKSxcbiAgZGF0YWJhc2U6IHByb2Nlc3MuZW52LkRCX05BTUUgfHwgJ2dyb2Nlcnl2YXBlX21vcm9jY28nLFxuICB1c2VyOiBwcm9jZXNzLmVudi5EQl9VU0VSIHx8ICdwb3N0Z3JlcycsXG4gIHBhc3N3b3JkOiBwcm9jZXNzLmVudi5EQl9QQVNTV09SRCB8fCAncGFzc3dvcmQnLFxuICBcbiAgLy8gQ29ubmVjdGlvbiBwb29sIHNldHRpbmdzXG4gIG1heDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9NQVggfHwgJzIwJyksIC8vIE1heGltdW0gbnVtYmVyIG9mIGNvbm5lY3Rpb25zXG4gIG1pbjogcGFyc2VJbnQocHJvY2Vzcy5lbnYuREJfUE9PTF9NSU4gfHwgJzUnKSwgIC8vIE1pbmltdW0gbnVtYmVyIG9mIGNvbm5lY3Rpb25zXG4gIGlkbGU6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfSURMRSB8fCAnMTAwMDAnKSwgLy8gQ2xvc2UgY29ubmVjdGlvbnMgYWZ0ZXIgMTAgc2Vjb25kcyBvZiBpbmFjdGl2aXR5XG4gIFxuICAvLyBDb25uZWN0aW9uIHRpbWVvdXRzXG4gIGNvbm5lY3Rpb25UaW1lb3V0TWlsbGlzOiAzMDAwMCwgLy8gMzAgc2Vjb25kc1xuICBpZGxlVGltZW91dE1pbGxpczogMzAwMDAsICAgICAgIC8vIDMwIHNlY29uZHNcbiAgcXVlcnlfdGltZW91dDogNjAwMDAsICAgICAgICAgICAvLyA2MCBzZWNvbmRzXG4gIFxuICAvLyBTU0wgY29uZmlndXJhdGlvbiAoaW1wb3J0YW50IGZvciBwcm9kdWN0aW9uKVxuICBzc2w6IGZhbHNlLCAvLyBEaXNhYmxlIFNTTCBmb3IgZGV2ZWxvcG1lbnRcbiAgXG4gIC8vIEFwcGxpY2F0aW9uIG5hbWUgZm9yIG1vbml0b3JpbmdcbiAgYXBwbGljYXRpb25fbmFtZTogJ2dyb2Nlcnl2YXBlX21vcm9jY29fYXBpJ1xufTtcblxuLy8gQ3JlYXRlIGNvbm5lY3Rpb24gcG9vbFxuY29uc3QgcG9vbCA9IG5ldyBQb29sKGRiQ29uZmlnKTtcblxuLy8gUG9vbCBldmVudCBoYW5kbGVyc1xucG9vbC5vbignY29ubmVjdCcsIChjbGllbnQ6IFBvb2xDbGllbnQpID0+IHtcbiAgY29uc29sZS5sb2coYPCfk6YgTmV3IGRhdGFiYXNlIGNvbm5lY3Rpb24gZXN0YWJsaXNoZWQgKFBJRDogJHsoY2xpZW50IGFzIGFueSkucHJvY2Vzc0lEIHx8ICd1bmtub3duJ30pYCk7XG4gIFxuICAvLyBTZXQgZGVmYXVsdCB0aW1lem9uZSB0byBNb3JvY2NvXG4gIGNsaWVudC5xdWVyeShcIlNFVCB0aW1lem9uZSA9ICdBZnJpY2EvQ2FzYWJsYW5jYSdcIik7XG4gIFxuICAvLyBTZXQgZGVmYXVsdCBjaGFyYWN0ZXIgZW5jb2RpbmcgZm9yIEFyYWJpYyBzdXBwb3J0XG4gIGNsaWVudC5xdWVyeShcIlNFVCBjbGllbnRfZW5jb2RpbmcgPSAnVVRGOCdcIik7XG59KTtcblxucG9vbC5vbignZXJyb3InLCAoZXJyOiBFcnJvciwgY2xpZW50PzogUG9vbENsaWVudCkgPT4ge1xuICBjb25zb2xlLmVycm9yKCfinYwgRGF0YWJhc2UgcG9vbCBlcnJvcjonLCBlcnIpO1xuICBjb25zb2xlLmVycm9yKGBDbGllbnQgUElEOiAkeyhjbGllbnQgYXMgYW55KT8ucHJvY2Vzc0lEIHx8ICd1bmtub3duJ31gKTtcbn0pO1xuXG5wb29sLm9uKCdhY3F1aXJlJywgKGNsaWVudDogUG9vbENsaWVudCkgPT4ge1xuICBjb25zb2xlLmxvZyhg8J+UlyBEYXRhYmFzZSBjb25uZWN0aW9uIGFjcXVpcmVkIChQSUQ6ICR7KGNsaWVudCBhcyBhbnkpLnByb2Nlc3NJRCB8fCAndW5rbm93bid9KWApO1xufSk7XG5cbnBvb2wub24oJ3JlbGVhc2UnLCAoZXJyOiBFcnJvciwgY2xpZW50OiBQb29sQ2xpZW50KSA9PiB7XG4gIGNvbnNvbGUubG9nKGDwn5STIERhdGFiYXNlIGNvbm5lY3Rpb24gcmVsZWFzZWQgKFBJRDogJHsoY2xpZW50IGFzIGFueSk/LnByb2Nlc3NJRCB8fCAndW5rbm93bid9KWApO1xufSk7XG5cbi8vIFRlc3QgZGF0YWJhc2UgY29ubmVjdGlvblxuYXN5bmMgZnVuY3Rpb24gdGVzdENvbm5lY3Rpb24oKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY2xpZW50ID0gYXdhaXQgcG9vbC5jb25uZWN0KCk7XG4gICAgY29uc3QgcmVzdWx0OiBRdWVyeVJlc3VsdDxDb25uZWN0aW9uVGVzdFJlc3VsdD4gPSBhd2FpdCBjbGllbnQucXVlcnkoYFxuICAgICAgU0VMRUNUIFxuICAgICAgICB2ZXJzaW9uKCkgYXMgdmVyc2lvbixcbiAgICAgICAgY3VycmVudF9kYXRhYmFzZSgpIGFzIGRhdGFiYXNlLFxuICAgICAgICBjdXJyZW50X3VzZXIgYXMgdXNlcixcbiAgICAgICAgTk9XKCkgQVQgVElNRSBaT05FICdBZnJpY2EvQ2FzYWJsYW5jYScgYXMgbW9yb2Njb190aW1lLFxuICAgICAgICBwZ19zaXplX3ByZXR0eShwZ19kYXRhYmFzZV9zaXplKGN1cnJlbnRfZGF0YWJhc2UoKSkpIGFzIGRhdGFiYXNlX3NpemVcbiAgICBgKTtcbiAgICBcbiAgICBjb25zb2xlLmxvZygn4pyFIERhdGFiYXNlIGNvbm5lY3Rpb24gdGVzdCBzdWNjZXNzZnVsOicpO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5OKIERhdGFiYXNlOiAke3Jlc3VsdC5yb3dzWzBdLmRhdGFiYXNlfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5GkIFVzZXI6ICR7cmVzdWx0LnJvd3NbMF0udXNlcn1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+VkCBNb3JvY2NvIFRpbWU6ICR7cmVzdWx0LnJvd3NbMF0ubW9yb2Njb190aW1lfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5K+IFNpemU6ICR7cmVzdWx0LnJvd3NbMF0uZGF0YWJhc2Vfc2l6ZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAg8J+XhO+4jyAgVmVyc2lvbjogJHtyZXN1bHQucm93c1swXS52ZXJzaW9uLnNwbGl0KCcgJykuc2xpY2UoMCwgMikuam9pbignICcpfWApO1xuICAgIFxuICAgIGNsaWVudC5yZWxlYXNlKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcic7XG4gICAgY29uc29sZS5lcnJvcign4p2MIERhdGFiYXNlIGNvbm5lY3Rpb24gdGVzdCBmYWlsZWQ6JywgZXJyb3JNZXNzYWdlKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLy8gUXVlcnkgd3JhcHBlciB3aXRoIGVycm9yIGhhbmRsaW5nIGFuZCBsb2dnaW5nXG5hc3luYyBmdW5jdGlvbiBxdWVyeTxUIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgYW55PiA9IGFueT4odGV4dDogc3RyaW5nLCBwYXJhbXM6IGFueVtdID0gW10pOiBQcm9taXNlPFF1ZXJ5UmVzdWx0PFQ+PiB7XG4gIGNvbnN0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0OiBRdWVyeVJlc3VsdDxUPiA9IGF3YWl0IHBvb2wucXVlcnkodGV4dCwgcGFyYW1zKTtcbiAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydDtcbiAgICBcbiAgICAvLyBMb2cgc2xvdyBxdWVyaWVzICg+IDEgc2Vjb25kKVxuICAgIGlmIChkdXJhdGlvbiA+IDEwMDApIHtcbiAgICAgIGNvbnNvbGUud2Fybihg8J+QjCBTbG93IHF1ZXJ5ICgke2R1cmF0aW9ufW1zKTpgLCB0ZXh0LnN1YnN0cmluZygwLCAxMDApICsgJy4uLicpO1xuICAgIH1cbiAgICBcbiAgICAvLyBMb2cgaW4gZGV2ZWxvcG1lbnQgbW9kZVxuICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JyAmJiBwcm9jZXNzLmVudi5MT0dfUVVFUklFUyA9PT0gJ3RydWUnKSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+TnSBRdWVyeSAoJHtkdXJhdGlvbn1tcyk6YCwgdGV4dCk7XG4gICAgICBpZiAocGFyYW1zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc29sZS5sb2coJyAgIFBhcmFtZXRlcnM6JywgcGFyYW1zKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRGF0YWJhc2UgcXVlcnkgZXJyb3I6JywgZXJyb3JNZXNzYWdlKTtcbiAgICBjb25zb2xlLmVycm9yKCcgICBRdWVyeTonLCB0ZXh0KTtcbiAgICBpZiAocGFyYW1zLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyAgIFBhcmFtZXRlcnM6JywgcGFyYW1zKTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLy8gVHJhbnNhY3Rpb24gd3JhcHBlclxuYXN5bmMgZnVuY3Rpb24gdHJhbnNhY3Rpb248VD4oY2FsbGJhY2s6IChjbGllbnQ6IFBvb2xDbGllbnQpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcbiAgY29uc3QgY2xpZW50ID0gYXdhaXQgcG9vbC5jb25uZWN0KCk7XG4gIFxuICB0cnkge1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnQkVHSU4nKTtcbiAgICBcbiAgICAvLyBFeGVjdXRlIHRoZSBjYWxsYmFjayB3aXRoIHRoZSBjbGllbnRcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjYWxsYmFjayhjbGllbnQpO1xuICAgIFxuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnQ09NTUlUJyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBhd2FpdCBjbGllbnQucXVlcnkoJ1JPTExCQUNLJyk7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcic7XG4gICAgY29uc29sZS5lcnJvcign4p2MIFRyYW5zYWN0aW9uIHJvbGxlZCBiYWNrOicsIGVycm9yTWVzc2FnZSk7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH0gZmluYWxseSB7XG4gICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gZm9yIHBhZ2luYXRlZCBxdWVyaWVzXG5mdW5jdGlvbiBidWlsZFBhZ2luYXRpb25RdWVyeShiYXNlUXVlcnk6IHN0cmluZywgcGFnZTogbnVtYmVyID0gMSwgbGltaXQ6IG51bWJlciA9IDIwLCBvcmRlckJ5OiBzdHJpbmcgPSAnY3JlYXRlZF9hdCBERVNDJyk6IHN0cmluZyB7XG4gIGNvbnN0IG9mZnNldCA9IChwYWdlIC0gMSkgKiBsaW1pdDtcbiAgcmV0dXJuIGBcbiAgICAke2Jhc2VRdWVyeX1cbiAgICBPUkRFUiBCWSAke29yZGVyQnl9XG4gICAgTElNSVQgJCR7YmFzZVF1ZXJ5LnNwbGl0KCckJykubGVuZ3RofSBPRkZTRVQgJCR7YmFzZVF1ZXJ5LnNwbGl0KCckJykubGVuZ3RoICsgMX1cbiAgYDtcbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIGZvciBzZWFyY2ggcXVlcmllcyB3aXRoIEFyYWJpYyBzdXBwb3J0XG5mdW5jdGlvbiBidWlsZFNlYXJjaFF1ZXJ5KHNlYXJjaFRlcm06IHN0cmluZywgbGFuZ3VhZ2U6ICdhcicgfCAnZnInIHwgJ2VuJyA9ICdhcicpOiBzdHJpbmcge1xuICBpZiAoIXNlYXJjaFRlcm0pIHJldHVybiAnJztcbiAgXG4gIGNvbnN0IHNlYXJjaENvbmZpZyA9IHtcbiAgICBhcjogJ2FyYWJpYycsXG4gICAgZnI6ICdmcmVuY2gnLCBcbiAgICBlbjogJ2VuZ2xpc2gnXG4gIH07XG4gIFxuICBjb25zdCBjb25maWcgPSBzZWFyY2hDb25maWdbbGFuZ3VhZ2VdIHx8ICdzaW1wbGUnO1xuICByZXR1cm4gYHRvX3RzdmVjdG9yKCcke2NvbmZpZ30nLCBDT0FMRVNDRShuYW1lXyR7bGFuZ3VhZ2V9LCAnJykpIEBAIHBsYWludG9fdHNxdWVyeSgnJHtjb25maWd9JywgJDEpYDtcbn1cblxuLy8gRGF0YWJhc2UgaGVhbHRoIGNoZWNrXG5hc3luYyBmdW5jdGlvbiBoZWFsdGhDaGVjaygpOiBQcm9taXNlPEhlYWx0aENoZWNrUmVzdWx0PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0OiBRdWVyeVJlc3VsdDxEYXRhYmFzZVN0YXRzPiA9IGF3YWl0IHF1ZXJ5KGBcbiAgICAgIFNFTEVDVCBcbiAgICAgICAgcGdfc3RhdF9kYXRhYmFzZS5udW1iYWNrZW5kcyBhcyBhY3RpdmVfY29ubmVjdGlvbnMsXG4gICAgICAgIHBnX3N0YXRfZGF0YWJhc2UueGFjdF9jb21taXQgYXMgdHJhbnNhY3Rpb25zX2NvbW1pdHRlZCxcbiAgICAgICAgcGdfc3RhdF9kYXRhYmFzZS54YWN0X3JvbGxiYWNrIGFzIHRyYW5zYWN0aW9uc19yb2xsZWRfYmFjayxcbiAgICAgICAgcGdfZGF0YWJhc2Vfc2l6ZShwZ19kYXRhYmFzZS5kYXRuYW1lKSBhcyBkYXRhYmFzZV9zaXplX2J5dGVzXG4gICAgICBGUk9NIHBnX3N0YXRfZGF0YWJhc2VcbiAgICAgIEpPSU4gcGdfZGF0YWJhc2UgT04gcGdfc3RhdF9kYXRhYmFzZS5kYXRuYW1lID0gcGdfZGF0YWJhc2UuZGF0bmFtZVxuICAgICAgV0hFUkUgcGdfc3RhdF9kYXRhYmFzZS5kYXRuYW1lID0gY3VycmVudF9kYXRhYmFzZSgpXG4gICAgYCk7XG4gICAgXG4gICAgY29uc3Qgc3RhdHMgPSByZXN1bHQucm93c1swXTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAnaGVhbHRoeScsXG4gICAgICBhY3RpdmVfY29ubmVjdGlvbnM6IHBhcnNlSW50KHN0YXRzLmFjdGl2ZV9jb25uZWN0aW9ucyksXG4gICAgICB0b3RhbF90cmFuc2FjdGlvbnM6IHBhcnNlSW50KHN0YXRzLnRyYW5zYWN0aW9uc19jb21taXR0ZWQpICsgcGFyc2VJbnQoc3RhdHMudHJhbnNhY3Rpb25zX3JvbGxlZF9iYWNrKSxcbiAgICAgIGRhdGFiYXNlX3NpemVfbWI6IE1hdGgucm91bmQocGFyc2VJbnQoc3RhdHMuZGF0YWJhc2Vfc2l6ZV9ieXRlcykgLyAxMDI0IC8gMTAyNCksXG4gICAgICBwb29sX2luZm86IHtcbiAgICAgICAgdG90YWxfY29ubmVjdGlvbnM6IHBvb2wudG90YWxDb3VudCxcbiAgICAgICAgaWRsZV9jb25uZWN0aW9uczogcG9vbC5pZGxlQ291bnQsXG4gICAgICAgIHdhaXRpbmdfcmVxdWVzdHM6IHBvb2wud2FpdGluZ0NvdW50XG4gICAgICB9XG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzOiAndW5oZWFsdGh5JyxcbiAgICAgIGVycm9yOiBlcnJvck1lc3NhZ2VcbiAgICB9O1xuICB9XG59XG5cbi8vIEdyYWNlZnVsIHNodXRkb3duXG5hc3luYyBmdW5jdGlvbiBjbG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc29sZS5sb2coJ/CflIwgQ2xvc2luZyBkYXRhYmFzZSBjb25uZWN0aW9ucy4uLicpO1xuICBhd2FpdCBwb29sLmVuZCgpO1xuICBjb25zb2xlLmxvZygn4pyFIERhdGFiYXNlIGNvbm5lY3Rpb25zIGNsb3NlZCcpO1xufVxuXG5leHBvcnQge1xuICBwb29sLFxuICBxdWVyeSxcbiAgdHJhbnNhY3Rpb24sXG4gIHRlc3RDb25uZWN0aW9uLFxuICBoZWFsdGhDaGVjayxcbiAgY2xvc2UsXG4gIGJ1aWxkUGFnaW5hdGlvblF1ZXJ5LFxuICBidWlsZFNlYXJjaFF1ZXJ5LFxuICBEYXRhYmFzZUNvbmZpZyxcbiAgSGVhbHRoQ2hlY2tSZXN1bHRcbn07Il19