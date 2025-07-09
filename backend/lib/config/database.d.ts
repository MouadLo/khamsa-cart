import { Pool, PoolClient, QueryResult } from 'pg';
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
    ssl: boolean | {
        rejectUnauthorized: boolean;
    };
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
declare const pool: Pool;
declare function testConnection(): Promise<boolean>;
declare function query<T extends Record<string, any> = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
declare function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
declare function buildPaginationQuery(baseQuery: string, page?: number, limit?: number, orderBy?: string): string;
declare function buildSearchQuery(searchTerm: string, language?: 'ar' | 'fr' | 'en'): string;
declare function healthCheck(): Promise<HealthCheckResult>;
declare function close(): Promise<void>;
export { pool, query, transaction, testConnection, healthCheck, close, buildPaginationQuery, buildSearchQuery, DatabaseConfig, HealthCheckResult };
