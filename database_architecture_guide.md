# Morocco Grocery & Vape Delivery App - Database Architecture Guide

## Overview

This document provides a comprehensive guide to the database schema designed for a Morocco-based grocery and vape delivery application. The schema is optimized for PostgreSQL 14+ and includes support for multi-language content, COD payments, guest checkout, and Morocco-specific requirements.

## Key Design Principles

### 1. Multi-Language Support
- **Strategy**: Dedicated columns for each language (Arabic, French, English)
- **Rationale**: Better performance than JSON or separate translation tables
- **Implementation**: `name_ar`, `name_fr`, `name_en` columns
- **Benefits**: Direct querying, better indexing, simpler joins

### 2. COD-First Payment Architecture
- **Primary Focus**: 85% COD, 15% online payments
- **COD Tracking**: Dedicated `cod_collections` table for cash reconciliation
- **Workflow**: Order → Assignment → Collection → Reconciliation

### 3. Guest Checkout Support
- **Session Management**: `guest_sessions` table with UUID tokens
- **Data Persistence**: Guest data linked to orders for future reference
- **Conversion Path**: Easy upgrade from guest to registered user

### 4. Morocco-Specific Features
- **Administrative Divisions**: Region → Province → City hierarchy
- **Phone Format**: Enforced +212XXXXXXXXX format
- **Delivery Zones**: City-based delivery fee calculation
- **Address Validation**: Structured address with landmarks

## Table Structure & Relationships

### Core System Tables

#### `languages`
- Manages supported languages (Arabic, French, English)
- RTL support for Arabic
- Extensible for future languages

#### `users` & `user_profiles`
- Split design: Core auth data vs. extended profile
- Flexible authentication: Email or phone number
- Morocco phone format validation
- Soft deletion support

#### `guest_sessions`
- Temporary user sessions for non-registered users
- Automatic expiration
- Order association for data persistence

### Product Management

#### `products` & `product_variants`
- Variable product support (size, color, flavor variations)
- Multi-language content
- Age verification for vape products
- Comprehensive pricing structure

#### `product_categories`
- Hierarchical category structure
- Multi-language names and descriptions
- Grocery/Vape main categories

#### `product_inventory`
- Location-based inventory tracking
- Reserved quantity for pending orders
- Reorder point management
- Atomic stock operations

### Order Management

#### `orders`
- Comprehensive order tracking
- Guest and registered user support
- COD-optimized fields
- Age verification workflow
- JSONB for flexible address storage

#### `order_items`
- Product snapshot at order time
- Variant support
- Price protection

#### `order_status_history`
- Complete status change tracking
- Audit trail for order lifecycle
- User attribution for changes

### Payment & COD System

#### `payment_transactions`
- Multi-gateway support
- Transaction status tracking
- Gateway response storage

#### `cod_collections`
- Cash collection tracking
- Reconciliation workflow
- Receipt management
- Delivery person attribution

### Delivery System

#### `delivery_zones`
- City-based delivery areas
- Dynamic fee calculation
- Free delivery thresholds
- Estimated delivery times

#### `delivery_personnel`
- Driver management
- Vehicle tracking
- Performance metrics

#### `delivery_assignments`
- Order-to-driver assignment
- Real-time status updates
- Proof of delivery

## Indexing Strategy

### Primary Indexes

1. **User Lookup**
   ```sql
   CREATE INDEX idx_users_email ON users(email);
   CREATE INDEX idx_users_phone ON users(phone);
   ```

2. **Product Search**
   ```sql
   -- Full-text search for each language
   CREATE INDEX idx_products_name_ar_gin ON products USING gin(to_tsvector('arabic', name_ar));
   CREATE INDEX idx_products_name_fr_gin ON products USING gin(to_tsvector('french', name_fr));
   CREATE INDEX idx_products_name_en_gin ON products USING gin(to_tsvector('english', name_en));
   
   -- Fuzzy search with trigrams
   CREATE INDEX idx_products_name_ar_trgm ON products USING gin(name_ar gin_trgm_ops);
   ```

3. **Order Performance**
   ```sql
   CREATE INDEX idx_orders_user_id ON orders(user_id);
   CREATE INDEX idx_orders_status ON orders(status_id);
   CREATE INDEX idx_orders_created_at ON orders(created_at);
   CREATE INDEX idx_orders_is_cod ON orders(is_cod) WHERE is_cod = TRUE;
   ```

### Composite Indexes

1. **Order History**
   ```sql
   CREATE INDEX idx_orders_user_status_date ON orders(user_id, status_id, created_at DESC);
   ```

2. **Product Catalog**
   ```sql
   CREATE INDEX idx_products_category_status_price ON products(category_id, status, price);
   ```

3. **Inventory Lookup**
   ```sql
   CREATE INDEX idx_inventory_product_location ON product_inventory(product_id, location_id);
   ```

## Query Optimization Patterns

### 1. Product Search with Multi-Language

```sql
-- Arabic search with ranking
SELECT p.id, p.name_ar, p.price,
       ts_rank(to_tsvector('arabic', p.name_ar), plainto_tsquery('arabic', :search_term)) as rank
FROM products p
WHERE to_tsvector('arabic', p.name_ar) @@ plainto_tsquery('arabic', :search_term)
   AND p.status = 'active'
ORDER BY rank DESC, p.is_featured DESC, p.created_at DESC;
```

### 2. Order History with Status

```sql
-- Efficient order history for user
SELECT o.id, o.order_number, o.total_amount, o.created_at,
       s.name_ar as status_name
FROM orders o
JOIN order_statuses s ON o.status_id = s.id
WHERE o.user_id = :user_id
ORDER BY o.created_at DESC
LIMIT 20;
```

### 3. COD Orders for Reconciliation

```sql
-- COD orders pending reconciliation
SELECT o.id, o.order_number, o.total_amount, o.customer_phone,
       da.delivery_person_id, da.delivery_time
FROM orders o
JOIN delivery_assignments da ON o.id = da.order_id
LEFT JOIN cod_collections cc ON o.id = cc.order_id
WHERE o.is_cod = TRUE
  AND da.status = 'delivered'
  AND cc.id IS NULL
ORDER BY da.delivery_time DESC;
```

### 4. Inventory Availability

```sql
-- Check product availability across locations
SELECT p.id, p.name_ar, p.price,
       SUM(pi.quantity - pi.reserved_quantity) as available_stock
FROM products p
JOIN product_inventory pi ON p.id = pi.product_id
WHERE p.status = 'active'
  AND pi.quantity > pi.reserved_quantity
GROUP BY p.id, p.name_ar, p.price
HAVING SUM(pi.quantity - pi.reserved_quantity) > 0;
```

## Scalability Considerations

### 1. Partitioning Strategy

**Orders Table Partitioning (for 100K+ orders/month)**
```sql
-- Monthly partitioning for orders
CREATE TABLE orders_2024_01 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Automatic partition creation
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    partition_name text;
    start_date date;
    end_date date;
BEGIN
    start_date := date_trunc('month', CURRENT_DATE);
    end_date := start_date + interval '1 month';
    partition_name := 'orders_' || to_char(start_date, 'YYYY_MM');
    
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF orders
                   FOR VALUES FROM (%L) TO (%L)',
                   partition_name, start_date, end_date);
END;
$$ LANGUAGE plpgsql;
```

### 2. Read Replicas

**Query Routing Strategy**
- Write operations: Master database
- Product catalog: Read replica
- Order history: Read replica
- Analytics: Dedicated analytics replica

### 3. Caching Strategy

**Redis Caching Layers**
```
1. Product catalog cache (TTL: 1 hour)
2. User session cache (TTL: 30 minutes)
3. Cart contents cache (TTL: 24 hours)
4. Search results cache (TTL: 15 minutes)
```

## Morocco-Specific Implementation

### 1. Address Validation

```sql
-- Address validation function
CREATE OR REPLACE FUNCTION validate_morocco_address(
    city_id INTEGER,
    phone VARCHAR(20),
    address_line_1 VARCHAR(255)
) RETURNS BOOLEAN AS $$
BEGIN
    -- Check if city exists and delivery is available
    IF NOT EXISTS (
        SELECT 1 FROM morocco_cities 
        WHERE id = city_id AND is_delivery_available = TRUE
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Validate phone format
    IF phone !~ '^\+212[0-9]{9}$' THEN
        RETURN FALSE;
    END IF;
    
    -- Check minimum address length
    IF length(trim(address_line_1)) < 10 THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### 2. Delivery Fee Calculation

```sql
-- Dynamic delivery fee calculation
CREATE OR REPLACE FUNCTION calculate_delivery_fee(
    city_id INTEGER,
    order_total DECIMAL(10,2)
) RETURNS DECIMAL(10,2) AS $$
DECLARE
    base_fee DECIMAL(10,2);
    free_threshold DECIMAL(10,2);
BEGIN
    SELECT dz.delivery_fee, dz.free_delivery_threshold
    INTO base_fee, free_threshold
    FROM delivery_zones dz
    WHERE city_id = ANY(dz.cities)
    AND dz.is_active = TRUE;
    
    IF order_total >= COALESCE(free_threshold, 999999) THEN
        RETURN 0;
    END IF;
    
    RETURN COALESCE(base_fee, 0);
END;
$$ LANGUAGE plpgsql;
```

### 3. Multi-Language Content Retrieval

```sql
-- Function to get localized content
CREATE OR REPLACE FUNCTION get_localized_name(
    name_ar TEXT,
    name_fr TEXT,
    name_en TEXT,
    user_language VARCHAR(5) DEFAULT 'ar'
) RETURNS TEXT AS $$
BEGIN
    CASE user_language
        WHEN 'ar' THEN RETURN COALESCE(name_ar, name_fr, name_en);
        WHEN 'fr' THEN RETURN COALESCE(name_fr, name_ar, name_en);
        WHEN 'en' THEN RETURN COALESCE(name_en, name_fr, name_ar);
        ELSE RETURN COALESCE(name_ar, name_fr, name_en);
    END CASE;
END;
$$ LANGUAGE plpgsql;
```

## Data Normalization vs Denormalization

### Normalized Tables
- **User management**: Separate profiles, roles, addresses
- **Product catalog**: Categories, brands, attributes
- **Order workflow**: Orders, items, status history

### Denormalized Elements
- **Multi-language content**: Separate columns vs. translation tables
- **Order snapshots**: Product data copied to order items
- **Address storage**: JSONB for billing/shipping addresses

### Trade-off Analysis

| Aspect | Normalized | Denormalized | Choice |
|--------|------------|--------------|---------|
| Multi-language | Translation tables | Column per language | **Denormalized** - Better performance |
| Product data in orders | Reference only | Snapshot data | **Denormalized** - Data integrity |
| Address storage | Structured tables | JSONB fields | **Mixed** - Structured for user addresses, JSONB for order addresses |

## Performance Monitoring

### 1. Query Performance Tracking

```sql
-- Track slow queries
CREATE OR REPLACE FUNCTION log_slow_query(
    query_text TEXT,
    execution_time_ms INTEGER,
    user_id UUID DEFAULT NULL
) RETURNS void AS $$
BEGIN
    IF execution_time_ms > 1000 THEN -- Log queries > 1 second
        INSERT INTO slow_query_log (
            query_hash, query_text, execution_time_ms, user_id
        ) VALUES (
            md5(query_text), query_text, execution_time_ms, user_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql;
```

### 2. Key Performance Metrics

```sql
-- Daily performance report
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_orders,
    COUNT(*) FILTER (WHERE is_cod = TRUE) as cod_orders,
    AVG(total_amount) as avg_order_value,
    COUNT(DISTINCT user_id) as unique_customers
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Backup and Recovery Strategy

### 1. Backup Schedule
- **Full backup**: Daily at 2 AM
- **Incremental backup**: Every 6 hours
- **Transaction log backup**: Every 15 minutes

### 2. Critical Data Priority
1. Orders and payment data
2. User accounts and profiles
3. Product inventory
4. Audit logs
5. Analytics data

### 3. Recovery Procedures
- **RTO**: 2 hours maximum
- **RPO**: 15 minutes maximum
- **Testing**: Monthly recovery drills

## Security Considerations

### 1. Data Encryption
- **At rest**: AES-256 encryption for sensitive tables
- **In transit**: TLS 1.3 for all connections
- **Application level**: Bcrypt for passwords

### 2. Access Control
- **Role-based access**: Separate roles for different user types
- **Row-level security**: Users can only access their own data
- **API access**: JWT tokens with proper scoping

### 3. Audit Trail
- **Complete tracking**: All data changes logged
- **Immutable logs**: Audit table with append-only access
- **Compliance**: GDPR-ready data handling

## Migration Strategy

### 1. Version Control
- **Schema versioning**: Sequential migration files
- **Rollback capability**: Down migrations for each change
- **Testing**: Automated migration testing

### 2. Zero-Downtime Deployments
- **Blue-green deployments**: Parallel environment setup
- **Feature flags**: Database-level feature toggling
- **Gradual rollout**: Phased deployment approach

This comprehensive database schema provides a solid foundation for a Morocco-based grocery and vape delivery application, with careful consideration of local requirements, performance optimization, and scalability needs.