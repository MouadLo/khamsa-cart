-- Setup database permissions for groceryvape_user
-- Run this on your EC2 PostgreSQL instance

-- Connect as postgres superuser first
-- \c groceryvape_morocco postgres

-- Create user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'groceryvape_user') THEN
        CREATE USER groceryvape_user WITH PASSWORD 'GroceryVape2024!Morocco';
    END IF;
END
$$;

-- Grant database access
GRANT CONNECT ON DATABASE groceryvape_morocco TO groceryvape_user;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO groceryvape_user;

-- Grant table permissions (essential for the app to work)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO groceryvape_user;

-- Grant sequence permissions (for auto-increment IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO groceryvape_user;

-- Grant permissions on future tables (important!)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO groceryvape_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO groceryvape_user;

-- Verify permissions
SELECT 
    schemaname,
    tablename,
    has_table_privilege('groceryvape_user', schemaname||'.'||tablename, 'SELECT') as can_select,
    has_table_privilege('groceryvape_user', schemaname||'.'||tablename, 'INSERT') as can_insert
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;