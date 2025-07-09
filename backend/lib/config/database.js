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
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.transaction = transaction;
exports.testConnection = testConnection;
exports.healthCheck = healthCheck;
exports.close = close;
exports.buildPaginationQuery = buildPaginationQuery;
exports.buildSearchQuery = buildSearchQuery;
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
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false,
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
// Graceful shutdown
async function close() {
    console.log('🔌 Closing database connections...');
    await pool.end();
    console.log('✅ Database connections closed');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29uZmlnL2RhdGFiYXNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWtRRSxzQkFBSztBQUNMLGtDQUFXO0FBQ1gsd0NBQWM7QUFDZCxrQ0FBVztBQUNYLHNCQUFLO0FBQ0wsb0RBQW9CO0FBQ3BCLDRDQUFnQjtBQXhRbEIsMkJBQW1EO0FBQ25ELCtDQUFpQztBQUVqQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7QUErQ2hCLHdDQUF3QztBQUN4QyxNQUFNLFFBQVEsR0FBbUI7SUFDL0Isd0JBQXdCO0lBQ3hCLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxXQUFXO0lBQ3hDLElBQUksRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksTUFBTSxDQUFDO0lBQzdDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sSUFBSSxxQkFBcUI7SUFDdEQsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxJQUFJLFVBQVU7SUFDdkMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLFVBQVU7SUFFL0MsMkJBQTJCO0lBQzNCLEdBQUcsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLEVBQUUsZ0NBQWdDO0lBQ2hGLEdBQUcsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksR0FBRyxDQUFDLEVBQUcsZ0NBQWdDO0lBQ2hGLElBQUksRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksT0FBTyxDQUFDLEVBQUUsbURBQW1EO0lBRXhHLHNCQUFzQjtJQUN0Qix1QkFBdUIsRUFBRSxLQUFLLEVBQUUs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WyJpbXBvcnQgeyBQb29sLCBQb29sQ2xpZW50LCBRdWVyeVJlc3VsdCB9IGZyb20gJ3BnJztcbmltcG9ydCAqIGFzIGRvdGVudiBmcm9tICdkb3RlbnYnO1xuXG5kb3RlbnYuY29uZmlnKCk7XG5cbi8vIFR5cGUgZGVmaW5pdGlvbnNcbmludGVyZmFjZSBEYXRhYmFzZUNvbmZpZyB7XG4gIGhvc3Q6IHN0cmluZztcbiAgcG9ydDogbnVtYmVyO1xuICBkYXRhYmFzZTogc3RyaW5nO1xuICB1c2VyOiBzdHJpbmc7XG4gIHBhc3N3b3JkOiBzdHJpbmc7XG4gIG1heDogbnVtYmVyO1xuICBtaW46IG51bWJlcjtcbiAgaWRsZTogbnVtYmVyO1xuICBjb25uZWN0aW9uVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBpZGxlVGltZW91dE1pbGxpczogbnVtYmVyO1xuICBxdWVyeV90aW1lb3V0OiBudW1iZXI7XG4gIHNzbDogYm9vbGVhbiB8IHsgcmVqZWN0VW5hdXRob3JpemVkOiBib29sZWFuIH07XG4gIGFwcGxpY2F0aW9uX25hbWU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEhlYWx0aENoZWNrUmVzdWx0IHtcbiAgc3RhdHVzOiAnaGVhbHRoeScgfCAndW5oZWFsdGh5JztcbiAgYWN0aXZlX2Nvbm5lY3Rpb25zPzogbnVtYmVyO1xuICB0b3RhbF90cmFuc2FjdGlvbnM/OiBudW1iZXI7XG4gIGRhdGFiYXNlX3NpemVfbWI/OiBudW1iZXI7XG4gIHBvb2xfaW5mbz86IHtcbiAgICB0b3RhbF9jb25uZWN0aW9uczogbnVtYmVyO1xuICAgIGlkbGVfY29ubmVjdGlvbnM6IG51bWJlcjtcbiAgICB3YWl0aW5nX3JlcXVlc3RzOiBudW1iZXI7XG4gIH07XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRGF0YWJhc2VTdGF0cyB7XG4gIGFjdGl2ZV9jb25uZWN0aW9uczogc3RyaW5nO1xuICB0cmFuc2FjdGlvbnNfY29tbWl0dGVkOiBzdHJpbmc7XG4gIHRyYW5zYWN0aW9uc19yb2xsZWRfYmFjazogc3RyaW5nO1xuICBkYXRhYmFzZV9zaXplX2J5dGVzOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDb25uZWN0aW9uVGVzdFJlc3VsdCB7XG4gIHZlcnNpb246IHN0cmluZztcbiAgZGF0YWJhc2U6IHN0cmluZztcbiAgdXNlcjogc3RyaW5nO1xuICBtb3JvY2NvX3RpbWU6IHN0cmluZztcbiAgZGF0YWJhc2Vfc2l6ZTogc3RyaW5nO1xufVxuXG4vLyBEYXRhYmFzZSBjb25maWd1cmF0aW9uIGZvciBQb3N0Z3JlU1FMXG5jb25zdCBkYkNvbmZpZzogRGF0YWJhc2VDb25maWcgPSB7XG4gIC8vIENvbm5lY3Rpb24gcGFyYW1ldGVyc1xuICBob3N0OiBwcm9jZXNzLmVudi5EQl9IT1NUIHx8ICdsb2NhbGhvc3QnLFxuICBwb3J0OiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT1JUIHx8ICc1NDMyJyksXG4gIGRhdGFiYXNlOiBwcm9jZXNzLmVudi5EQl9OQU1FIHx8ICdncm9jZXJ5dmFwZV9tb3JvY2NvJyxcbiAgdXNlcjogcHJvY2Vzcy5lbnYuREJfVVNFUiB8fCAncG9zdGdyZXMnLFxuICBwYXNzd29yZDogcHJvY2Vzcy5lbnYuREJfUEFTU1dPUkQgfHwgJ3Bhc3N3b3JkJyxcbiAgXG4gIC8vIENvbm5lY3Rpb24gcG9vbCBzZXR0aW5nc1xuICBtYXg6IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUFYIHx8ICcyMCcpLCAvLyBNYXhpbXVtIG51bWJlciBvZiBjb25uZWN0aW9uc1xuICBtaW46IHBhcnNlSW50KHByb2Nlc3MuZW52LkRCX1BPT0xfTUlOIHx8ICc1JyksICAvLyBNaW5pbXVtIG51bWJlciBvZiBjb25uZWN0aW9uc1xuICBpZGxlOiBwYXJzZUludChwcm9jZXNzLmVudi5EQl9QT09MX0lETEUgfHwgJzEwMDAwJyksIC8vIENsb3NlIGNvbm5lY3Rpb25zIGFmdGVyIDEwIHNlY29uZHMgb2YgaW5hY3Rpdml0eVxuICBcbiAgLy8gQ29ubmVjdGlvbiB0aW1lb3V0c1xuICBjb25uZWN0aW9uVGltZW91dE1pbGxpczogMzAwMDAsIC8vIDMwIHNlY29uZHNcbiAgaWRsZVRpbWVvdXRNaWxsaXM6IDMwMDAwLCAgICAgICAvLyAzMCBzZWNvbmRzXG4gIHF1ZXJ5X3RpbWVvdXQ6IDYwMDAwLCAgICAgICAgICAgLy8gNjAgc2Vjb25kc1xuICBcbiAgLy8gU1NMIGNvbmZpZ3VyYXRpb24gKGltcG9ydGFudCBmb3IgcHJvZHVjdGlvbilcbiAgc3NsOiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nID8ge1xuICAgIHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2VcbiAgfSA6IGZhbHNlLFxuICBcbiAgLy8gQXBwbGljYXRpb24gbmFtZSBmb3IgbW9uaXRvcmluZ1xuICBhcHBsaWNhdGlvbl9uYW1lOiAnZ3JvY2VyeXZhcGVfbW9yb2Njb19hcGknXG59O1xuXG4vLyBDcmVhdGUgY29ubmVjdGlvbiBwb29sXG5jb25zdCBwb29sID0gbmV3IFBvb2woZGJDb25maWcpO1xuXG4vLyBQb29sIGV2ZW50IGhhbmRsZXJzXG5wb29sLm9uKCdjb25uZWN0JywgKGNsaWVudDogUG9vbENsaWVudCkgPT4ge1xuICBjb25zb2xlLmxvZyhg8J+TpiBOZXcgZGF0YWJhc2UgY29ubmVjdGlvbiBlc3RhYmxpc2hlZCAoUElEOiAkeyhjbGllbnQgYXMgYW55KS5wcm9jZXNzSUQgfHwgJ3Vua25vd24nfSlgKTtcbiAgXG4gIC8vIFNldCBkZWZhdWx0IHRpbWV6b25lIHRvIE1vcm9jY29cbiAgY2xpZW50LnF1ZXJ5KFwiU0VUIHRpbWV6b25lID0gJ0FmcmljYS9DYXNhYmxhbmNhJ1wiKTtcbiAgXG4gIC8vIFNldCBkZWZhdWx0IGNoYXJhY3RlciBlbmNvZGluZyBmb3IgQXJhYmljIHN1cHBvcnRcbiAgY2xpZW50LnF1ZXJ5KFwiU0VUIGNsaWVudF9lbmNvZGluZyA9ICdVVEY4J1wiKTtcbn0pO1xuXG5wb29sLm9uKCdlcnJvcicsIChlcnI6IEVycm9yLCBjbGllbnQ/OiBQb29sQ2xpZW50KSA9PiB7XG4gIGNvbnNvbGUuZXJyb3IoJ+KdjCBEYXRhYmFzZSBwb29sIGVycm9yOicsIGVycik7XG4gIGNvbnNvbGUuZXJyb3IoYENsaWVudCBQSUQ6ICR7KGNsaWVudCBhcyBhbnkpPy5wcm9jZXNzSUQgfHwgJ3Vua25vd24nfWApO1xufSk7XG5cbnBvb2wub24oJ2FjcXVpcmUnLCAoY2xpZW50OiBQb29sQ2xpZW50KSA9PiB7XG4gIGNvbnNvbGUubG9nKGDwn5SXIERhdGFiYXNlIGNvbm5lY3Rpb24gYWNxdWlyZWQgKFBJRDogJHsoY2xpZW50IGFzIGFueSkucHJvY2Vzc0lEIHx8ICd1bmtub3duJ30pYCk7XG59KTtcblxucG9vbC5vbigncmVsZWFzZScsIChlcnI6IEVycm9yLCBjbGllbnQ6IFBvb2xDbGllbnQpID0+IHtcbiAgY29uc29sZS5sb2coYPCflJMgRGF0YWJhc2UgY29ubmVjdGlvbiByZWxlYXNlZCAoUElEOiAkeyhjbGllbnQgYXMgYW55KT8ucHJvY2Vzc0lEIHx8ICd1bmtub3duJ30pYCk7XG59KTtcblxuLy8gVGVzdCBkYXRhYmFzZSBjb25uZWN0aW9uXG5hc3luYyBmdW5jdGlvbiB0ZXN0Q29ubmVjdGlvbigpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBjbGllbnQgPSBhd2FpdCBwb29sLmNvbm5lY3QoKTtcbiAgICBjb25zdCByZXN1bHQ6IFF1ZXJ5UmVzdWx0PENvbm5lY3Rpb25UZXN0UmVzdWx0PiA9IGF3YWl0IGNsaWVudC5xdWVyeShgXG4gICAgICBTRUxFQ1QgXG4gICAgICAgIHZlcnNpb24oKSBhcyB2ZXJzaW9uLFxuICAgICAgICBjdXJyZW50X2RhdGFiYXNlKCkgYXMgZGF0YWJhc2UsXG4gICAgICAgIGN1cnJlbnRfdXNlciBhcyB1c2VyLFxuICAgICAgICBOT1coKSBBVCBUSU1FIFpPTkUgJ0FmcmljYS9DYXNhYmxhbmNhJyBhcyBtb3JvY2NvX3RpbWUsXG4gICAgICAgIHBnX3NpemVfcHJldHR5KHBnX2RhdGFiYXNlX3NpemUoY3VycmVudF9kYXRhYmFzZSgpKSkgYXMgZGF0YWJhc2Vfc2l6ZVxuICAgIGApO1xuICAgIFxuICAgIGNvbnNvbGUubG9nKCfinIUgRGF0YWJhc2UgY29ubmVjdGlvbiB0ZXN0IHN1Y2Nlc3NmdWw6Jyk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfk4ogRGF0YWJhc2U6ICR7cmVzdWx0LnJvd3NbMF0uZGF0YWJhc2V9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfkaQgVXNlcjogJHtyZXN1bHQucm93c1swXS51c2VyfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5WQIE1vcm9jY28gVGltZTogJHtyZXN1bHQucm93c1swXS5tb3JvY2NvX3RpbWV9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIPCfkr4gU2l6ZTogJHtyZXN1bHQucm93c1swXS5kYXRhYmFzZV9zaXplfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICDwn5eE77iPICBWZXJzaW9uOiAke3Jlc3VsdC5yb3dzWzBdLnZlcnNpb24uc3BsaXQoJyAnKS5zbGljZSgwLCAyKS5qb2luKCcgJyl9YCk7XG4gICAgXG4gICAgY2xpZW50LnJlbGVhc2UoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRGF0YWJhc2UgY29ubmVjdGlvbiB0ZXN0IGZhaWxlZDonLCBlcnJvck1lc3NhZ2UpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vLyBRdWVyeSB3cmFwcGVyIHdpdGggZXJyb3IgaGFuZGxpbmcgYW5kIGxvZ2dpbmdcbmFzeW5jIGZ1bmN0aW9uIHF1ZXJ5PFQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0gYW55Pih0ZXh0OiBzdHJpbmcsIHBhcmFtczogYW55W10gPSBbXSk6IFByb21pc2U8UXVlcnlSZXN1bHQ8VD4+IHtcbiAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuICBcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQ6IFF1ZXJ5UmVzdWx0PFQ+ID0gYXdhaXQgcG9vbC5xdWVyeSh0ZXh0LCBwYXJhbXMpO1xuICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0O1xuICAgIFxuICAgIC8vIExvZyBzbG93IHF1ZXJpZXMgKD4gMSBzZWNvbmQpXG4gICAgaWYgKGR1cmF0aW9uID4gMTAwMCkge1xuICAgICAgY29uc29sZS53YXJuKGDwn5CMIFNsb3cgcXVlcnkgKCR7ZHVyYXRpb259bXMpOmAsIHRleHQuc3Vic3RyaW5nKDAsIDEwMCkgKyAnLi4uJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIExvZyBpbiBkZXZlbG9wbWVudCBtb2RlXG4gICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnICYmIHByb2Nlc3MuZW52LkxPR19RVUVSSUVTID09PSAndHJ1ZScpIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OdIFF1ZXJ5ICgke2R1cmF0aW9ufW1zKTpgLCB0ZXh0KTtcbiAgICAgIGlmIChwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZygnICAgUGFyYW1ldGVyczonLCBwYXJhbXMpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InO1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBEYXRhYmFzZSBxdWVyeSBlcnJvcjonLCBlcnJvck1lc3NhZ2UpO1xuICAgIGNvbnNvbGUuZXJyb3IoJyAgIFF1ZXJ5OicsIHRleHQpO1xuICAgIGlmIChwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5lcnJvcignICAgUGFyYW1ldGVyczonLCBwYXJhbXMpO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vLyBUcmFuc2FjdGlvbiB3cmFwcGVyXG5hc3luYyBmdW5jdGlvbiB0cmFuc2FjdGlvbjxUPihjYWxsYmFjazogKGNsaWVudDogUG9vbENsaWVudCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuICBjb25zdCBjbGllbnQgPSBhd2FpdCBwb29sLmNvbm5lY3QoKTtcbiAgXG4gIHRyeSB7XG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdCRUdJTicpO1xuICAgIFxuICAgIC8vIEV4ZWN1dGUgdGhlIGNhbGxiYWNrIHdpdGggdGhlIGNsaWVudFxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhbGxiYWNrKGNsaWVudCk7XG4gICAgXG4gICAgYXdhaXQgY2xpZW50LnF1ZXJ5KCdDT01NSVQnKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGF3YWl0IGNsaWVudC5xdWVyeSgnUk9MTEJBQ0snKTtcbiAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcbiAgICBjb25zb2xlLmVycm9yKCfinYwgVHJhbnNhY3Rpb24gcm9sbGVkIGJhY2s6JywgZXJyb3JNZXNzYWdlKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfSBmaW5hbGx5IHtcbiAgICBjbGllbnQucmVsZWFzZSgpO1xuICB9XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiBmb3IgcGFnaW5hdGVkIHF1ZXJpZXNcbmZ1bmN0aW9uIGJ1aWxkUGFnaW5hdGlvblF1ZXJ5KGJhc2VRdWVyeTogc3RyaW5nLCBwYWdlOiBudW1iZXIgPSAxLCBsaW1pdDogbnVtYmVyID0gMjAsIG9yZGVyQnk6IHN0cmluZyA9ICdjcmVhdGVkX2F0IERFU0MnKTogc3RyaW5nIHtcbiAgY29uc3Qgb2Zmc2V0ID0gKHBhZ2UgLSAxKSAqIGxpbWl0O1xuICByZXR1cm4gYFxuICAgICR7YmFzZVF1ZXJ5fVxuICAgIE9SREVSIEJZICR7b3JkZXJCeX1cbiAgICBMSU1JVCAkJHtiYXNlUXVlcnkuc3BsaXQoJyQnKS5sZW5ndGh9IE9GRlNFVCAkJHtiYXNlUXVlcnkuc3BsaXQoJyQnKS5sZW5ndGggKyAxfVxuICBgO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gZm9yIHNlYXJjaCBxdWVyaWVzIHdpdGggQXJhYmljIHN1cHBvcnRcbmZ1bmN0aW9uIGJ1aWxkU2VhcmNoUXVlcnkoc2VhcmNoVGVybTogc3RyaW5nLCBsYW5ndWFnZTogJ2FyJyB8ICdmcicgfCAnZW4nID0gJ2FyJyk6IHN0cmluZyB7XG4gIGlmICghc2VhcmNoVGVybSkgcmV0dXJuICcnO1xuICBcbiAgY29uc3Qgc2VhcmNoQ29uZmlnID0ge1xuICAgIGFyOiAnYXJhYmljJyxcbiAgICBmcjogJ2ZyZW5jaCcsIFxuICAgIGVuOiAnZW5nbGlzaCdcbiAgfTtcbiAgXG4gIGNvbnN0IGNvbmZpZyA9IHNlYXJjaENvbmZpZ1tsYW5ndWFnZV0gfHwgJ3NpbXBsZSc7XG4gIHJldHVybiBgdG9fdHN2ZWN0b3IoJyR7Y29uZmlnfScsIENPQUxFU0NFKG5hbWVfJHtsYW5ndWFnZX0sICcnKSkgQEAgcGxhaW50b190c3F1ZXJ5KCcke2NvbmZpZ30nLCAkMSlgO1xufVxuXG4vLyBEYXRhYmFzZSBoZWFsdGggY2hlY2tcbmFzeW5jIGZ1bmN0aW9uIGhlYWx0aENoZWNrKCk6IFByb21pc2U8SGVhbHRoQ2hlY2tSZXN1bHQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQ6IFF1ZXJ5UmVzdWx0PERhdGFiYXNlU3RhdHM+ID0gYXdhaXQgcXVlcnkoYFxuICAgICAgU0VMRUNUIFxuICAgICAgICBwZ19zdGF0X2RhdGFiYXNlLm51bWJhY2tlbmRzIGFzIGFjdGl2ZV9jb25uZWN0aW9ucyxcbiAgICAgICAgcGdfc3RhdF9kYXRhYmFzZS54YWN0X2NvbW1pdCBhcyB0cmFuc2FjdGlvbnNfY29tbWl0dGVkLFxuICAgICAgICBwZ19zdGF0X2RhdGFiYXNlLnhhY3Rfcm9sbGJhY2sgYXMgdHJhbnNhY3Rpb25zX3JvbGxlZF9iYWNrLFxuICAgICAgICBwZ19kYXRhYmFzZV9zaXplKHBnX2RhdGFiYXNlLmRhdG5hbWUpIGFzIGRhdGFiYXNlX3NpemVfYnl0ZXNcbiAgICAgIEZST00gcGdfc3RhdF9kYXRhYmFzZVxuICAgICAgSk9JTiBwZ19kYXRhYmFzZSBPTiBwZ19zdGF0X2RhdGFiYXNlLmRhdG5hbWUgPSBwZ19kYXRhYmFzZS5kYXRuYW1lXG4gICAgICBXSEVSRSBwZ19zdGF0X2RhdGFiYXNlLmRhdG5hbWUgPSBjdXJyZW50X2RhdGFiYXNlKClcbiAgICBgKTtcbiAgICBcbiAgICBjb25zdCBzdGF0cyA9IHJlc3VsdC5yb3dzWzBdO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICdoZWFsdGh5JyxcbiAgICAgIGFjdGl2ZV9jb25uZWN0aW9uczogcGFyc2VJbnQoc3RhdHMuYWN0aXZlX2Nvbm5lY3Rpb25zKSxcbiAgICAgIHRvdGFsX3RyYW5zYWN0aW9uczogcGFyc2VJbnQoc3RhdHMudHJhbnNhY3Rpb25zX2NvbW1pdHRlZCkgKyBwYXJzZUludChzdGF0cy50cmFuc2FjdGlvbnNfcm9sbGVkX2JhY2spLFxuICAgICAgZGF0YWJhc2Vfc2l6ZV9tYjogTWF0aC5yb3VuZChwYXJzZUludChzdGF0cy5kYXRhYmFzZV9zaXplX2J5dGVzKSAvIDEwMjQgLyAxMDI0KSxcbiAgICAgIHBvb2xfaW5mbzoge1xuICAgICAgICB0b3RhbF9jb25uZWN0aW9uczogcG9vbC50b3RhbENvdW50LFxuICAgICAgICBpZGxlX2Nvbm5lY3Rpb25zOiBwb29sLmlkbGVDb3VudCxcbiAgICAgICAgd2FpdGluZ19yZXF1ZXN0czogcG9vbC53YWl0aW5nQ291bnRcbiAgICAgIH1cbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXM6ICd1bmhlYWx0aHknLFxuICAgICAgZXJyb3I6IGVycm9yTWVzc2FnZVxuICAgIH07XG4gIH1cbn1cblxuLy8gR3JhY2VmdWwgc2h1dGRvd25cbmFzeW5jIGZ1bmN0aW9uIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zb2xlLmxvZygn8J+UjCBDbG9zaW5nIGRhdGFiYXNlIGNvbm5lY3Rpb25zLi4uJyk7XG4gIGF3YWl0IHBvb2wuZW5kKCk7XG4gIGNvbnNvbGUubG9nKCfinIUgRGF0YWJhc2UgY29ubmVjdGlvbnMgY2xvc2VkJyk7XG59XG5cbmV4cG9ydCB7XG4gIHBvb2wsXG4gIHF1ZXJ5LFxuICB0cmFuc2FjdGlvbixcbiAgdGVzdENvbm5lY3Rpb24sXG4gIGhlYWx0aENoZWNrLFxuICBjbG9zZSxcbiAgYnVpbGRQYWdpbmF0aW9uUXVlcnksXG4gIGJ1aWxkU2VhcmNoUXVlcnksXG4gIERhdGFiYXNlQ29uZmlnLFxuICBIZWFsdGhDaGVja1Jlc3VsdFxufTsiXX0=