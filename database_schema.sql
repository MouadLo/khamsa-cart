-- =====================================================
-- Morocco Grocery & Vape Delivery App Database Schema
-- PostgreSQL 14+ with Multi-language Support
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- =====================================================
-- CORE SYSTEM TABLES
-- =====================================================

-- Languages table for multi-language support
CREATE TABLE languages (
    id SERIAL PRIMARY KEY,
    code VARCHAR(5) NOT NULL UNIQUE, -- 'ar', 'fr', 'en'
    name VARCHAR(50) NOT NULL,
    is_rtl BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- System settings with multi-language support
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL,
    value JSONB,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- USER MANAGEMENT
-- =====================================================

-- User roles
CREATE TABLE user_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    permissions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Main users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE, -- Morocco format: +212XXXXXXXXX
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(10),
    preferred_language VARCHAR(5) DEFAULT 'ar',
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    phone_verified_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT users_email_phone_check CHECK (email IS NOT NULL OR phone IS NOT NULL),
    CONSTRAINT users_phone_format CHECK (phone ~ '^\+212[0-9]{9}$'),
    CONSTRAINT users_gender_check CHECK (gender IN ('male', 'female', 'other'))
);

-- User profiles with additional information
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avatar_url VARCHAR(500),
    bio TEXT,
    date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    timezone VARCHAR(50) DEFAULT 'Africa/Casablanca',
    marketing_consent BOOLEAN DEFAULT FALSE,
    push_notifications BOOLEAN DEFAULT TRUE,
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User role assignments
CREATE TABLE user_role_assignments (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES user_roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

-- Guest sessions for non-registered users
CREATE TABLE guest_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_token VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20), -- For COD orders
    email VARCHAR(255),
    preferred_language VARCHAR(5) DEFAULT 'ar',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- LOCATION & ADDRESS MANAGEMENT
-- =====================================================

-- Morocco administrative divisions
CREATE TABLE morocco_regions (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE morocco_provinces (
    id SERIAL PRIMARY KEY,
    region_id INTEGER REFERENCES morocco_regions(id),
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE morocco_cities (
    id SERIAL PRIMARY KEY,
    province_id INTEGER REFERENCES morocco_provinces(id),
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    postal_code VARCHAR(10),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_delivery_available BOOLEAN DEFAULT FALSE,
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- User addresses
CREATE TABLE user_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'home', -- home, work, other
    title VARCHAR(100),
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    city_id INTEGER REFERENCES morocco_cities(id),
    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),
    landmark VARCHAR(255),
    postal_code VARCHAR(10),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT addresses_user_or_guest CHECK (
        (user_id IS NOT NULL AND guest_session_id IS NULL) OR 
        (user_id IS NULL AND guest_session_id IS NOT NULL)
    ),
    CONSTRAINT addresses_type_check CHECK (type IN ('home', 'work', 'other')),
    CONSTRAINT addresses_phone_format CHECK (phone ~ '^\+212[0-9]{9}$')
);

-- =====================================================
-- PRODUCT CATALOG
-- =====================================================

-- Product categories with multi-language support
CREATE TABLE product_categories (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER REFERENCES product_categories(id),
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description_ar TEXT,
    description_fr TEXT,
    description_en TEXT,
    image_url VARCHAR(500),
    icon_url VARCHAR(500),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product brands
CREATE TABLE product_brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description_ar TEXT,
    description_fr TEXT,
    description_en TEXT,
    logo_url VARCHAR(500),
    website_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product attributes (size, color, flavor, etc.)
CREATE TABLE product_attributes (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- text, number, boolean, select, multiselect
    is_required BOOLEAN DEFAULT FALSE,
    is_filterable BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product attribute values
CREATE TABLE product_attribute_values (
    id SERIAL PRIMARY KEY,
    attribute_id INTEGER REFERENCES product_attributes(id) ON DELETE CASCADE,
    value_ar VARCHAR(100) NOT NULL,
    value_fr VARCHAR(100) NOT NULL,
    value_en VARCHAR(100) NOT NULL,
    color_code VARCHAR(7), -- For color attributes
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Main products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) NOT NULL UNIQUE,
    name_ar VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description_ar TEXT,
    description_fr TEXT,
    description_en TEXT,
    short_description_ar TEXT,
    short_description_fr TEXT,
    short_description_en TEXT,
    category_id INTEGER REFERENCES product_categories(id),
    brand_id INTEGER REFERENCES product_brands(id),
    type VARCHAR(20) NOT NULL, -- simple, variable, grouped
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, out_of_stock
    price DECIMAL(10, 2) NOT NULL,
    compare_price DECIMAL(10, 2), -- Original price for sale items
    cost_price DECIMAL(10, 2), -- For profit calculation
    weight DECIMAL(8, 3), -- In grams
    dimensions JSONB, -- {length, width, height}
    requires_age_verification BOOLEAN DEFAULT FALSE, -- For vape products
    min_age_required INTEGER, -- 18 for vape products
    tax_rate DECIMAL(5, 2) DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    is_digital BOOLEAN DEFAULT FALSE,
    meta_title VARCHAR(255),
    meta_description TEXT,
    search_keywords TEXT,
    barcode VARCHAR(50),
    supplier_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT products_type_check CHECK (type IN ('simple', 'variable', 'grouped')),
    CONSTRAINT products_status_check CHECK (status IN ('active', 'inactive', 'out_of_stock')),
    CONSTRAINT products_price_positive CHECK (price >= 0),
    CONSTRAINT products_compare_price_check CHECK (compare_price IS NULL OR compare_price > price)
);

-- Product variants (for variable products)
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL UNIQUE,
    name_ar VARCHAR(255),
    name_fr VARCHAR(255),
    name_en VARCHAR(255),
    price DECIMAL(10, 2) NOT NULL,
    compare_price DECIMAL(10, 2),
    cost_price DECIMAL(10, 2),
    weight DECIMAL(8, 3),
    dimensions JSONB,
    barcode VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product variant attributes
CREATE TABLE product_variant_attributes (
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_id INTEGER REFERENCES product_attributes(id) ON DELETE CASCADE,
    value_id INTEGER REFERENCES product_attribute_values(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, attribute_id)
);

-- Product images
CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    alt_text_ar VARCHAR(255),
    alt_text_fr VARCHAR(255),
    alt_text_en VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT images_product_or_variant CHECK (
        (product_id IS NOT NULL AND variant_id IS NULL) OR 
        (product_id IS NULL AND variant_id IS NOT NULL)
    )
);

-- Product reviews
CREATE TABLE product_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID, -- Reference to orders table (will be created later)
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INVENTORY MANAGEMENT
-- =====================================================

-- Inventory locations/warehouses
CREATE TABLE inventory_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    city_id INTEGER REFERENCES morocco_cities(id),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product inventory
CREATE TABLE product_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES inventory_locations(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0, -- For pending orders
    reorder_point INTEGER DEFAULT 0,
    reorder_quantity INTEGER DEFAULT 0,
    last_restocked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT inventory_product_or_variant CHECK (
        (product_id IS NOT NULL AND variant_id IS NULL) OR 
        (product_id IS NULL AND variant_id IS NOT NULL)
    ),
    CONSTRAINT inventory_quantities_positive CHECK (
        quantity >= 0 AND reserved_quantity >= 0
    ),
    UNIQUE (product_id, variant_id, location_id)
);

-- Inventory movements (stock in/out tracking)
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id UUID REFERENCES product_inventory(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- in, out, adjustment, transfer
    quantity INTEGER NOT NULL,
    reference_type VARCHAR(50), -- order, purchase, adjustment, transfer
    reference_id UUID,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT movements_type_check CHECK (type IN ('in', 'out', 'adjustment', 'transfer'))
);

-- =====================================================
-- ORDER MANAGEMENT
-- =====================================================

-- Order statuses
CREATE TABLE order_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    color VARCHAR(7), -- Hex color code
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Main orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE SET NULL,
    status_id INTEGER REFERENCES order_statuses(id),
    
    -- Customer information
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20) NOT NULL,
    customer_first_name VARCHAR(100) NOT NULL,
    customer_last_name VARCHAR(100) NOT NULL,
    
    -- Billing address
    billing_address JSONB NOT NULL,
    
    -- Shipping address
    shipping_address JSONB NOT NULL,
    
    -- Order totals
    subtotal DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    shipping_amount DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    
    -- Payment information
    payment_method VARCHAR(50) NOT NULL, -- cod, card, bank_transfer
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, refunded
    is_cod BOOLEAN DEFAULT FALSE,
    cod_amount DECIMAL(10, 2),
    
    -- Delivery information
    delivery_date DATE,
    delivery_time_slot VARCHAR(50),
    delivery_instructions TEXT,
    
    -- Order metadata
    currency VARCHAR(3) DEFAULT 'MAD',
    language VARCHAR(5) DEFAULT 'ar',
    notes TEXT,
    admin_notes TEXT,
    
    -- Age verification for vape products
    requires_age_verification BOOLEAN DEFAULT FALSE,
    age_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT orders_customer_reference CHECK (
        (user_id IS NOT NULL AND guest_session_id IS NULL) OR 
        (user_id IS NULL AND guest_session_id IS NOT NULL)
    ),
    CONSTRAINT orders_payment_method_check CHECK (
        payment_method IN ('cod', 'card', 'bank_transfer')
    ),
    CONSTRAINT orders_payment_status_check CHECK (
        payment_status IN ('pending', 'paid', 'failed', 'refunded')
    ),
    CONSTRAINT orders_amounts_positive CHECK (
        subtotal >= 0 AND tax_amount >= 0 AND shipping_amount >= 0 AND 
        discount_amount >= 0 AND total_amount >= 0
    )
);

-- Order items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    sku VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    product_data JSONB, -- Snapshot of product data at time of order
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order status history
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    status_id INTEGER REFERENCES order_statuses(id),
    changed_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- PAYMENT MANAGEMENT
-- =====================================================

-- Payment methods
CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- cod, online, bank_transfer
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    configuration JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment transactions
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    payment_method_id INTEGER REFERENCES payment_methods(id),
    transaction_id VARCHAR(255), -- External payment gateway transaction ID
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MAD',
    status VARCHAR(20) NOT NULL, -- pending, completed, failed, cancelled, refunded
    gateway_response JSONB,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT transactions_status_check CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')
    ),
    CONSTRAINT transactions_amount_positive CHECK (amount > 0)
);

-- COD collections (for cash reconciliation)
CREATE TABLE cod_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    collected_by UUID REFERENCES users(id), -- Delivery person
    amount_collected DECIMAL(10, 2) NOT NULL,
    collection_date DATE NOT NULL,
    receipt_number VARCHAR(50),
    notes TEXT,
    is_reconciled BOOLEAN DEFAULT FALSE,
    reconciled_at TIMESTAMP WITH TIME ZONE,
    reconciled_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT cod_amount_positive CHECK (amount_collected >= 0)
);

-- =====================================================
-- DELIVERY MANAGEMENT
-- =====================================================

-- Delivery zones
CREATE TABLE delivery_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    cities INTEGER[] NOT NULL, -- Array of city IDs
    delivery_fee DECIMAL(10, 2) NOT NULL,
    free_delivery_threshold DECIMAL(10, 2),
    estimated_delivery_time VARCHAR(50), -- "1-2 hours", "Same day", etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Delivery personnel
CREATE TABLE delivery_personnel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    vehicle_type VARCHAR(50), -- motorcycle, car, bicycle
    license_number VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Delivery assignments
CREATE TABLE delivery_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    delivery_person_id UUID REFERENCES delivery_personnel(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id),
    pickup_time TIMESTAMP WITH TIME ZONE,
    delivery_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'assigned', -- assigned, picked_up, delivered, failed
    notes TEXT,
    customer_signature VARCHAR(500), -- Base64 encoded signature
    photo_proof VARCHAR(500), -- URL to delivery photo
    
    -- Constraints
    CONSTRAINT delivery_status_check CHECK (
        status IN ('assigned', 'picked_up', 'delivered', 'failed')
    )
);

-- =====================================================
-- DISCOUNTS AND PROMOTIONS
-- =====================================================

-- Discount types
CREATE TABLE discount_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- percentage, fixed_amount, free_shipping
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Coupons and promo codes
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    description_ar TEXT,
    description_fr TEXT,
    description_en TEXT,
    discount_type_id INTEGER REFERENCES discount_types(id),
    discount_value DECIMAL(10, 2) NOT NULL,
    minimum_amount DECIMAL(10, 2),
    maximum_discount DECIMAL(10, 2),
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    user_usage_limit INTEGER DEFAULT 1,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT coupons_dates_check CHECK (valid_from < valid_until),
    CONSTRAINT coupons_usage_positive CHECK (usage_limit IS NULL OR usage_limit > 0)
);

-- Coupon usage tracking
CREATE TABLE coupon_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    discount_amount DECIMAL(10, 2) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (coupon_id, order_id)
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

-- Notification types
CREATE TABLE notification_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    name_ar VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    channels VARCHAR(50)[] NOT NULL, -- email, sms, push, in_app
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notification templates
CREATE TABLE notification_templates (
    id SERIAL PRIMARY KEY,
    notification_type_id INTEGER REFERENCES notification_types(id),
    language VARCHAR(5) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    subject VARCHAR(255),
    template TEXT NOT NULL,
    variables JSONB, -- Template variables
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (notification_type_id, language, channel)
);

-- Notification queue
CREATE TABLE notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_type_id INTEGER REFERENCES notification_types(id),
    recipient_id UUID, -- user_id or guest_session_id
    recipient_type VARCHAR(20) NOT NULL, -- user, guest
    channel VARCHAR(20) NOT NULL,
    recipient_address VARCHAR(255) NOT NULL, -- email, phone, device_token
    subject VARCHAR(255),
    content TEXT NOT NULL,
    variables JSONB,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT notification_status_check CHECK (
        status IN ('pending', 'sent', 'failed')
    ),
    CONSTRAINT notification_recipient_check CHECK (
        recipient_type IN ('user', 'guest')
    ),
    CONSTRAINT notification_channel_check CHECK (
        channel IN ('email', 'sms', 'push', 'in_app')
    )
);

-- =====================================================
-- AUDIT AND LOGGING
-- =====================================================

-- Audit log for tracking changes
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT audit_action_check CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- System logs
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(10) NOT NULL, -- DEBUG, INFO, WARNING, ERROR, CRITICAL
    category VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    user_id UUID REFERENCES users(id),
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT log_level_check CHECK (
        level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')
    )
);

-- =====================================================
-- ANALYTICS AND REPORTING
-- =====================================================

-- Page views and user behavior
CREATE TABLE page_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    guest_session_id UUID REFERENCES guest_sessions(id),
    url VARCHAR(500) NOT NULL,
    referrer VARCHAR(500),
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(20), -- desktop, mobile, tablet
    browser VARCHAR(50),
    os VARCHAR(50),
    country VARCHAR(2),
    city VARCHAR(100),
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Product views
CREATE TABLE product_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    guest_session_id UUID REFERENCES guest_sessions(id),
    ip_address INET,
    referrer VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Search queries
CREATE TABLE search_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    guest_session_id UUID REFERENCES guest_sessions(id),
    query TEXT NOT NULL,
    results_count INTEGER NOT NULL,
    clicked_result_id UUID,
    language VARCHAR(5) DEFAULT 'ar',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- User indexes
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_users_created_at ON users(created_at);

-- Product indexes
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = TRUE;

-- Full-text search indexes for Arabic, French, and English
CREATE INDEX idx_products_name_ar_gin ON products USING gin(to_tsvector('arabic', name_ar));
CREATE INDEX idx_products_name_fr_gin ON products USING gin(to_tsvector('french', name_fr));
CREATE INDEX idx_products_name_en_gin ON products USING gin(to_tsvector('english', name_en));

-- Trigram indexes for fuzzy search
CREATE INDEX idx_products_name_ar_trgm ON products USING gin(name_ar gin_trgm_ops);
CREATE INDEX idx_products_name_fr_trgm ON products USING gin(name_fr gin_trgm_ops);
CREATE INDEX idx_products_name_en_trgm ON products USING gin(name_en gin_trgm_ops);

-- Order indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_guest_session_id ON orders(guest_session_id);
CREATE INDEX idx_orders_status ON orders(status_id);
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_is_cod ON orders(is_cod) WHERE is_cod = TRUE;
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);

-- Address indexes
CREATE INDEX idx_addresses_user_id ON user_addresses(user_id);
CREATE INDEX idx_addresses_guest_session_id ON user_addresses(guest_session_id);
CREATE INDEX idx_addresses_city_id ON user_addresses(city_id);
CREATE INDEX idx_addresses_default ON user_addresses(is_default) WHERE is_default = TRUE;

-- Inventory indexes
CREATE INDEX idx_inventory_product_id ON product_inventory(product_id);
CREATE INDEX idx_inventory_variant_id ON product_inventory(variant_id);
CREATE INDEX idx_inventory_location_id ON product_inventory(location_id);
CREATE INDEX idx_inventory_quantity ON product_inventory(quantity);

-- Notification indexes
CREATE INDEX idx_notifications_recipient ON notification_queue(recipient_id, recipient_type);
CREATE INDEX idx_notifications_status ON notification_queue(status);
CREATE INDEX idx_notifications_scheduled ON notification_queue(scheduled_at);

-- Audit indexes
CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_changed_by ON audit_log(changed_by);

-- Analytics indexes
CREATE INDEX idx_page_views_user_id ON page_views(user_id);
CREATE INDEX idx_page_views_created_at ON page_views(created_at);
CREATE INDEX idx_product_views_product_id ON product_views(product_id);
CREATE INDEX idx_product_views_created_at ON product_views(created_at);

-- =====================================================
-- INITIAL DATA SETUP
-- =====================================================

-- Insert default languages
INSERT INTO languages (code, name, is_rtl, is_active) VALUES 
('ar', 'العربية', TRUE, TRUE),
('fr', 'Français', FALSE, TRUE),
('en', 'English', FALSE, TRUE);

-- Insert default user roles
INSERT INTO user_roles (name, permissions) VALUES 
('admin', '{"all": true}'),
('manager', '{"orders": ["read", "update"], "products": ["read", "update"], "users": ["read"]}'),
('customer_service', '{"orders": ["read", "update"], "customers": ["read", "update"]}'),
('delivery_person', '{"orders": ["read", "update_delivery_status"]}'),
('customer', '{"orders": ["read_own"], "profile": ["read", "update"]}');

-- Insert default order statuses
INSERT INTO order_statuses (name, name_ar, name_fr, name_en, color, sort_order) VALUES 
('pending', 'في الانتظار', 'En attente', 'Pending', '#FFA500', 1),
('confirmed', 'مؤكد', 'Confirmé', 'Confirmed', '#28A745', 2),
('preparing', 'قيد التحضير', 'En préparation', 'Preparing', '#17A2B8', 3),
('out_for_delivery', 'خارج للتسليم', 'En cours de livraison', 'Out for delivery', '#6F42C1', 4),
('delivered', 'تم التسليم', 'Livré', 'Delivered', '#28A745', 5),
('cancelled', 'ملغى', 'Annulé', 'Cancelled', '#DC3545', 6);

-- Insert default payment methods
INSERT INTO payment_methods (name, name_ar, name_fr, name_en, type, sort_order) VALUES 
('cod', 'الدفع عند الاستلام', 'Paiement à la livraison', 'Cash on delivery', 'cod', 1),
('card', 'بطاقة ائتمان', 'Carte de crédit', 'Credit card', 'online', 2),
('bank_transfer', 'تحويل بنكي', 'Virement bancaire', 'Bank transfer', 'bank_transfer', 3);

-- Insert Morocco administrative data (sample)
INSERT INTO morocco_regions (name_ar, name_fr, name_en, code) VALUES 
('الدار البيضاء سطات', 'Casablanca-Settat', 'Casablanca-Settat', 'CS'),
('الرباط سلا القنيطرة', 'Rabat-Salé-Kénitra', 'Rabat-Salé-Kénitra', 'RSK'),
('مراكش آسفي', 'Marrakech-Safi', 'Marrakech-Safi', 'MS'),
('فاس مكناس', 'Fès-Meknès', 'Fès-Meknès', 'FM');

-- Insert sample product categories
INSERT INTO product_categories (name_ar, name_fr, name_en, slug, parent_id) VALUES 
('البقالة', 'Épicerie', 'Groceries', 'groceries', NULL),
('منتجات الفيب', 'Produits de vapotage', 'Vape products', 'vape-products', NULL),
('الفواكه والخضروات', 'Fruits et légumes', 'Fruits & vegetables', 'fruits-vegetables', 1),
('منتجات الألبان', 'Produits laitiers', 'Dairy products', 'dairy-products', 1),
('السجائر الإلكترونية', 'Cigarettes électroniques', 'E-cigarettes', 'e-cigarettes', 2),
('السوائل الإلكترونية', 'E-liquides', 'E-liquids', 'e-liquids', 2);

-- Insert sample notification types
INSERT INTO notification_types (name, name_ar, name_fr, name_en, channels) VALUES 
('order_confirmation', 'تأكيد الطلب', 'Confirmation de commande', 'Order confirmation', ARRAY['email', 'sms']),
('order_status_update', 'تحديث حالة الطلب', 'Mise à jour du statut', 'Order status update', ARRAY['email', 'sms', 'push']),
('delivery_notification', 'إشعار التسليم', 'Notification de livraison', 'Delivery notification', ARRAY['sms', 'push']),
('payment_reminder', 'تذكير الدفع', 'Rappel de paiement', 'Payment reminder', ARRAY['email', 'sms']),
('promotional_offer', 'عرض ترويجي', 'Offre promotionnelle', 'Promotional offer', ARRAY['email', 'push']);

-- Create trigger functions for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_addresses_updated_at BEFORE UPDATE ON user_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON product_inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_values, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), 
                COALESCE(current_setting('app.current_user_id', TRUE)::UUID, NULL));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, record_id, action, old_values, new_values, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW),
                COALESCE(current_setting('app.current_user_id', TRUE)::UUID, NULL));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, record_id, action, new_values, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW),
                COALESCE(current_setting('app.current_user_id', TRUE)::UUID, NULL));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_products_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for products with inventory
CREATE VIEW products_with_inventory AS
SELECT 
    p.id,
    p.sku,
    p.name_ar,
    p.name_fr,
    p.name_en,
    p.price,
    p.compare_price,
    p.status,
    c.name_ar as category_name_ar,
    c.name_fr as category_name_fr,
    c.name_en as category_name_en,
    b.name as brand_name,
    COALESCE(SUM(inv.quantity), 0) as total_stock,
    COALESCE(SUM(inv.reserved_quantity), 0) as reserved_stock,
    COALESCE(SUM(inv.quantity - inv.reserved_quantity), 0) as available_stock
FROM products p
LEFT JOIN product_categories c ON p.category_id = c.id
LEFT JOIN product_brands b ON p.brand_id = b.id
LEFT JOIN product_inventory inv ON p.id = inv.product_id
GROUP BY p.id, c.id, b.id;

-- View for order summaries
CREATE VIEW order_summaries AS
SELECT 
    o.id,
    o.order_number,
    o.customer_first_name,
    o.customer_last_name,
    o.customer_phone,
    o.total_amount,
    o.payment_method,
    o.is_cod,
    s.name as status_name,
    s.name_ar as status_name_ar,
    s.name_fr as status_name_fr,
    s.name_en as status_name_en,
    o.created_at,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_statuses s ON o.status_id = s.id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, s.id;

-- View for user statistics
CREATE VIEW user_statistics AS
SELECT 
    u.id,
    u.email,
    u.phone,
    u.first_name,
    u.last_name,
    u.created_at,
    COUNT(o.id) as total_orders,
    COALESCE(SUM(o.total_amount), 0) as total_spent,
    MAX(o.created_at) as last_order_date
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;

-- =====================================================
-- FUNCTIONS FOR COMMON OPERATIONS
-- =====================================================

-- Function to calculate available stock
CREATE OR REPLACE FUNCTION get_available_stock(product_id UUID, variant_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    available_stock INTEGER;
BEGIN
    IF variant_id IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity - reserved_quantity), 0) INTO available_stock
        FROM product_inventory
        WHERE product_inventory.variant_id = get_available_stock.variant_id;
    ELSE
        SELECT COALESCE(SUM(quantity - reserved_quantity), 0) INTO available_stock
        FROM product_inventory
        WHERE product_inventory.product_id = get_available_stock.product_id;
    END IF;
    
    RETURN COALESCE(available_stock, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to reserve stock
CREATE OR REPLACE FUNCTION reserve_stock(product_id UUID, variant_id UUID, quantity INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    available_stock INTEGER;
BEGIN
    -- Check available stock
    available_stock := get_available_stock(product_id, variant_id);
    
    IF available_stock >= quantity THEN
        -- Reserve the stock
        IF variant_id IS NOT NULL THEN
            UPDATE product_inventory 
            SET reserved_quantity = reserved_quantity + quantity
            WHERE product_inventory.variant_id = reserve_stock.variant_id;
        ELSE
            UPDATE product_inventory 
            SET reserved_quantity = reserved_quantity + quantity
            WHERE product_inventory.product_id = reserve_stock.product_id;
        END IF;
        
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    order_number VARCHAR(50);
    counter INTEGER;
BEGIN
    -- Get current date in YYYYMMDD format
    SELECT TO_CHAR(CURRENT_DATE, 'YYYYMMDD') INTO order_number;
    
    -- Get count of orders created today
    SELECT COUNT(*) + 1 INTO counter
    FROM orders
    WHERE DATE(created_at) = CURRENT_DATE;
    
    -- Combine date and counter
    order_number := order_number || LPAD(counter::TEXT, 4, '0');
    
    RETURN order_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PERFORMANCE MONITORING
-- =====================================================

-- Table for tracking slow queries
CREATE TABLE slow_query_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_hash VARCHAR(64) NOT NULL,
    query_text TEXT NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_slow_queries_hash ON slow_query_log(query_hash);
CREATE INDEX idx_slow_queries_time ON slow_query_log(execution_time_ms);
CREATE INDEX idx_slow_queries_created_at ON slow_query_log(created_at);