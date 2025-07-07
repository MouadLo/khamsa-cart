-- ============================================================================
-- GroceryVape Morocco E-commerce Database Schema
-- Full-featured schema with variants, inventory, reviews, and delivery zones
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Custom Types
CREATE TYPE language_code AS ENUM ('ar', 'fr', 'en');
CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'preparing', 'ready_for_pickup', 
    'out_for_delivery', 'delivered', 'cod_collected', 'completed', 'cancelled'
);
CREATE TYPE payment_type AS ENUM ('cod', 'card', 'bank_transfer');
CREATE TYPE delivery_status AS ENUM ('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed');
CREATE TYPE user_role AS ENUM ('customer', 'admin', 'driver', 'manager');
CREATE TYPE inventory_movement_type AS ENUM ('purchase', 'sale', 'adjustment', 'return', 'damage', 'expired');

-- ============================================================================
-- CORE USER MANAGEMENT
-- ============================================================================

-- Users (unified table for customers, admins, drivers)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(15) NOT NULL UNIQUE, -- +212XXXXXXXXX format
    email VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    role user_role DEFAULT 'customer',
    preferred_language language_code DEFAULT 'ar',
    
    -- Authentication
    password_hash VARCHAR(255), -- NULL for guest users
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    
    -- Age verification (for vape products)
    age_verified BOOLEAN DEFAULT false,
    age_verification_date TIMESTAMP,
    birth_date DATE,
    id_document_url VARCHAR(500), -- Stored in S3
    
    -- Guest management
    is_guest BOOLEAN DEFAULT true,
    guest_session_id VARCHAR(50),
    guest_expires_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP
);

-- User addresses
CREATE TABLE user_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Address components
    label VARCHAR(100), -- 'Home', 'Work', etc.
    address_line TEXT NOT NULL,
    neighborhood VARCHAR(100), -- Quartier/Hay
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL,
    postal_code VARCHAR(10),
    country VARCHAR(10) DEFAULT 'MA',
    
    -- Morocco-specific
    landmark TEXT, -- Important for navigation
    delivery_instructions TEXT,
    
    -- Geographic data
    coordinates POINT, -- PostGIS point (lat, lng)
    
    -- Status
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- DELIVERY ZONES AND LOGISTICS
-- ============================================================================

-- Delivery zones with geographic boundaries
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255),
    name_en VARCHAR(255),
    
    -- Geographic boundary (PostGIS geometry)
    boundary GEOMETRY(POLYGON, 4326),
    
    -- Zone configuration
    is_active BOOLEAN DEFAULT true,
    delivery_fee DECIMAL(8,2) DEFAULT 0,
    free_delivery_threshold DECIMAL(10,2), -- Free delivery above this amount
    cod_available BOOLEAN DEFAULT true,
    
    -- Delivery timing
    min_delivery_hours INTEGER DEFAULT 2,
    max_delivery_hours INTEGER DEFAULT 6,
    
    -- Restrictions
    max_cod_amount DECIMAL(10,2) DEFAULT 500.00,
    min_order_amount DECIMAL(8,2) DEFAULT 20.00,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Drivers
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Driver details
    license_number VARCHAR(50) NOT NULL UNIQUE,
    vehicle_type VARCHAR(50), -- 'motorcycle', 'car', 'bicycle'
    vehicle_plate VARCHAR(20),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_available BOOLEAN DEFAULT false,
    current_location POINT, -- Real-time location
    
    -- Cash management
    cash_on_hand DECIMAL(10,2) DEFAULT 0,
    max_cash_limit DECIMAL(10,2) DEFAULT 2000.00,
    
    -- Performance metrics
    total_deliveries INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 5.00,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- PRODUCT CATALOG WITH VARIANTS
-- ============================================================================

-- Product categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255),
    name_en VARCHAR(255),
    
    description_ar TEXT,
    description_fr TEXT,
    description_en TEXT,
    
    -- Hierarchy
    parent_id UUID REFERENCES categories(id),
    sort_order INTEGER DEFAULT 0,
    
    -- Category properties
    is_vape_category BOOLEAN DEFAULT false,
    age_restricted BOOLEAN DEFAULT false,
    
    -- Display
    image_url VARCHAR(500),
    icon_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Base products (parent products)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id),
    
    -- Multi-language content
    name_ar VARCHAR(255) NOT NULL,
    name_fr VARCHAR(255),
    name_en VARCHAR(255),
    
    description_ar TEXT,
    description_fr TEXT,
    description_en TEXT,
    
    -- Product classification
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(50),
    brand VARCHAR(100),
    
    -- Vape-specific
    is_vape_product BOOLEAN DEFAULT false,
    age_restricted BOOLEAN DEFAULT false,
    nicotine_content VARCHAR(50), -- For vape products
    
    -- Pricing (base price, variants can override)
    base_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2), -- For profit calculations
    
    -- Display and status
    image_urls TEXT[], -- Array of image URLs
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    
    -- SEO
    meta_title_ar VARCHAR(255),
    meta_title_fr VARCHAR(255),
    meta_title_en VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Product variants (size, color, flavor, etc.)
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Variant identification
    variant_name_ar VARCHAR(255) NOT NULL,
    variant_name_fr VARCHAR(255),
    variant_name_en VARCHAR(255),
    
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(50),
    
    -- Variant attributes (JSONB for flexibility)
    attributes JSONB, -- {"size": "500ml", "flavor": "مانجو", "nicotine": "6mg"}
    
    -- Pricing (can override base product price)
    price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2),
    
    -- Variant-specific details
    weight_grams INTEGER,
    dimensions JSONB, -- {"length": 10, "width": 5, "height": 15}
    
    -- Display
    image_urls TEXT[],
    is_default BOOLEAN DEFAULT false, -- Default variant for product
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INVENTORY MANAGEMENT
-- ============================================================================

-- Inventory tracking per variant
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    
    -- Stock levels
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0, -- Reserved for pending orders
    available_quantity INTEGER GENERATED ALWAYS AS (stock_quantity - reserved_quantity) STORED,
    
    -- Thresholds
    low_stock_threshold INTEGER DEFAULT 10,
    reorder_point INTEGER DEFAULT 5,
    max_stock_level INTEGER DEFAULT 1000,
    
    -- Cost and valuation
    unit_cost DECIMAL(10,2),
    total_value DECIMAL(12,2) GENERATED ALWAYS AS (stock_quantity * unit_cost) STORED,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Location (if multiple warehouses)
    warehouse_location VARCHAR(100) DEFAULT 'main',
    
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Inventory movements (audit trail)
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_variant_id UUID NOT NULL REFERENCES product_variants(id),
    
    -- Movement details
    movement_type inventory_movement_type NOT NULL,
    quantity_change INTEGER NOT NULL, -- Positive for increase, negative for decrease
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    
    -- Cost information
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(12,2),
    
    -- Reference information
    reference_type VARCHAR(50), -- 'order', 'purchase', 'adjustment', etc.
    reference_id UUID, -- ID of related order, purchase, etc.
    
    -- Details
    notes TEXT,
    performed_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- ORDERS AND TRANSACTIONS
-- ============================================================================

-- Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) UNIQUE NOT NULL, -- Human-readable order number
    customer_id UUID NOT NULL REFERENCES users(id),
    
    -- Order status
    status order_status DEFAULT 'pending',
    delivery_status delivery_status DEFAULT 'pending',
    
    -- Payment information
    payment_method payment_type DEFAULT 'cod',
    payment_status VARCHAR(20) DEFAULT 'pending',
    
    -- COD specific
    cod_amount DECIMAL(10,2),
    cod_collected BOOLEAN DEFAULT false,
    cod_verification_code VARCHAR(6),
    cod_collected_at TIMESTAMP,
    
    -- Amounts
    subtotal DECIMAL(10,2) NOT NULL,
    delivery_fee DECIMAL(8,2) DEFAULT 0,
    tax_amount DECIMAL(8,2) DEFAULT 0,
    discount_amount DECIMAL(8,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Delivery information
    delivery_address JSONB NOT NULL,
    delivery_zone_id UUID REFERENCES delivery_zones(id),
    delivery_notes TEXT,
    estimated_delivery_at TIMESTAMP,
    delivered_at TIMESTAMP,
    
    -- Assignment
    driver_id UUID REFERENCES drivers(id),
    assigned_at TIMESTAMP,
    
    -- Special instructions
    age_verification_required BOOLEAN DEFAULT false,
    special_instructions TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Order items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_variant_id UUID NOT NULL REFERENCES product_variants(id),
    
    -- Item details
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    
    -- Snapshot of product info (in case product changes later)
    product_name_ar VARCHAR(255) NOT NULL,
    product_name_fr VARCHAR(255),
    product_name_en VARCHAR(255),
    variant_name_ar VARCHAR(255),
    variant_name_fr VARCHAR(255),
    variant_name_en VARCHAR(255),
    product_sku VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- COD AND CASH MANAGEMENT
-- ============================================================================

-- COD collections for cash reconciliation
CREATE TABLE cod_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    
    -- Collection details
    amount_collected DECIMAL(10,2) NOT NULL,
    verification_code VARCHAR(6),
    collection_method VARCHAR(20) DEFAULT 'cash', -- 'cash', 'card_on_delivery'
    
    -- Verification
    customer_confirmed BOOLEAN DEFAULT false,
    customer_signature_url VARCHAR(500), -- Image of signature
    photo_proof_url VARCHAR(500), -- Photo of delivery
    
    -- Reconciliation
    reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMP,
    reconciled_by UUID REFERENCES users(id),
    
    -- Timestamps
    collected_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Driver cash reconciliation
CREATE TABLE driver_cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    
    -- Reconciliation period
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Cash summary
    opening_balance DECIMAL(10,2) DEFAULT 0,
    total_collected DECIMAL(10,2) NOT NULL,
    total_deposited DECIMAL(10,2) DEFAULT 0,
    closing_balance DECIMAL(10,2) NOT NULL,
    
    -- Variance tracking
    expected_balance DECIMAL(10,2) NOT NULL,
    variance DECIMAL(10,2) GENERATED ALWAYS AS (closing_balance - expected_balance) STORED,
    
    -- Status
    is_reconciled BOOLEAN DEFAULT false,
    reconciled_by UUID REFERENCES users(id),
    reconciled_at TIMESTAMP,
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- REVIEWS AND RATINGS
-- ============================================================================

-- Product reviews
CREATE TABLE product_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id),
    product_variant_id UUID REFERENCES product_variants(id), -- Optional: review specific variant
    customer_id UUID NOT NULL REFERENCES users(id),
    order_id UUID REFERENCES orders(id), -- Must have purchased to review
    
    -- Review content
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title_ar VARCHAR(255),
    title_fr VARCHAR(255),
    title_en VARCHAR(255),
    review_text_ar TEXT,
    review_text_fr TEXT,
    review_text_en TEXT,
    
    -- Review metadata
    is_verified_purchase BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    
    -- Helpful votes
    helpful_votes INTEGER DEFAULT 0,
    total_votes INTEGER DEFAULT 0,
    
    -- Review images
    image_urls TEXT[],
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure one review per customer per product
    UNIQUE(customer_id, product_id)
);

-- Delivery/driver reviews
CREATE TABLE delivery_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    
    -- Rating
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    
    -- Review aspects
    punctuality_rating INTEGER CHECK (punctuality_rating >= 1 AND punctuality_rating <= 5),
    politeness_rating INTEGER CHECK (politeness_rating >= 1 AND politeness_rating <= 5),
    professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
    
    -- Comments
    comment TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- One review per order
    UNIQUE(order_id)
);

-- ============================================================================
-- NOTIFICATIONS AND COMMUNICATION
-- ============================================================================

-- Communication logs (SMS, WhatsApp, Email)
CREATE TABLE communication_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    
    -- Communication details
    type VARCHAR(20) NOT NULL, -- 'sms', 'whatsapp', 'email', 'push'
    recipient VARCHAR(255) NOT NULL, -- phone, email, device_token
    subject VARCHAR(255),
    message TEXT NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    
    -- Provider details
    provider VARCHAR(50), -- 'twilio', 'whatsapp_business', 'ses'
    provider_message_id VARCHAR(255),
    provider_response JSONB,
    
    -- Cost tracking
    cost_mad DECIMAL(6,4), -- Cost in MAD
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- ANALYTICS AND REPORTING
-- ============================================================================

-- Order analytics (for business intelligence)
CREATE TABLE order_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    
    -- Customer analytics
    customer_lifetime_orders INTEGER,
    customer_lifetime_value DECIMAL(12,2),
    is_first_order BOOLEAN,
    is_repeat_customer BOOLEAN,
    
    -- Order analytics
    order_source VARCHAR(50), -- 'mobile_app', 'web', 'whatsapp'
    device_type VARCHAR(20), -- 'ios', 'android', 'web'
    referral_source VARCHAR(100),
    
    -- Timing analytics
    order_hour INTEGER, -- Hour of day (0-23)
    order_day_of_week INTEGER, -- Day of week (1-7)
    time_to_delivery_minutes INTEGER,
    
    -- Geographic analytics
    delivery_distance_km DECIMAL(6,2),
    delivery_zone_name VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- User indexes
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_guest ON users(is_guest, guest_expires_at);

-- Address indexes
CREATE INDEX idx_user_addresses_user ON user_addresses(user_id);
CREATE INDEX idx_user_addresses_city ON user_addresses(city);
CREATE INDEX idx_user_addresses_default ON user_addresses(user_id, is_default);

-- Product indexes
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_featured ON products(is_featured);
CREATE INDEX idx_products_vape ON products(is_vape_product);

-- Full-text search indexes
CREATE INDEX idx_products_search_ar ON products USING gin(to_tsvector('arabic', name_ar || ' ' || COALESCE(description_ar, '')));
CREATE INDEX idx_products_search_fr ON products USING gin(to_tsvector('french', name_fr || ' ' || COALESCE(description_fr, '')));
CREATE INDEX idx_products_search_en ON products USING gin(to_tsvector('english', name_en || ' ' || COALESCE(description_en, '')));

-- Variant indexes
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_variants_active ON product_variants(is_active);

-- Inventory indexes
CREATE INDEX idx_inventory_variant ON inventory(product_variant_id);
CREATE INDEX idx_inventory_low_stock ON inventory(low_stock_threshold) WHERE available_quantity <= low_stock_threshold;

-- Order indexes
CREATE INDEX idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_orders_driver ON orders(driver_id, created_at DESC);
CREATE INDEX idx_orders_cod ON orders(payment_method, cod_collected) WHERE payment_method = 'cod';
CREATE INDEX idx_orders_delivery_zone ON orders(delivery_zone_id);

-- Review indexes
CREATE INDEX idx_reviews_product ON product_reviews(product_id, is_approved);
CREATE INDEX idx_reviews_customer ON product_reviews(customer_id);
CREATE INDEX idx_reviews_rating ON product_reviews(rating);

-- Geographic indexes
CREATE INDEX idx_delivery_zones_boundary ON delivery_zones USING gist(boundary);
CREATE INDEX idx_user_addresses_location ON user_addresses USING gist(coordinates);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := 'GV' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(EXTRACT(EPOCH FROM NOW())::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for order number generation
CREATE TRIGGER trg_generate_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_number();

-- Function to update inventory on order
CREATE OR REPLACE FUNCTION update_inventory_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Reserve inventory when order item is added
        UPDATE inventory 
        SET reserved_quantity = reserved_quantity + NEW.quantity
        WHERE product_variant_id = NEW.product_variant_id;
        
        -- Log inventory movement
        INSERT INTO inventory_movements (
            product_variant_id, movement_type, quantity_change, 
            previous_quantity, new_quantity, reference_type, reference_id
        )
        SELECT 
            NEW.product_variant_id, 'sale', -NEW.quantity,
            i.stock_quantity, i.stock_quantity - NEW.quantity,
            'order', NEW.order_id
        FROM inventory i 
        WHERE i.product_variant_id = NEW.product_variant_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Release reserved inventory when order item is removed
        UPDATE inventory 
        SET reserved_quantity = reserved_quantity - OLD.quantity
        WHERE product_variant_id = OLD.product_variant_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for inventory updates
CREATE TRIGGER trg_update_inventory_on_order
    AFTER INSERT OR DELETE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_order();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Insert sample delivery zone (Casablanca center)
INSERT INTO delivery_zones (id, name_ar, name_fr, name_en, boundary, delivery_fee, free_delivery_threshold, cod_available)
VALUES (
    uuid_generate_v4(),
    'وسط الدار البيضاء',
    'Centre de Casablanca', 
    'Casablanca Center',
    ST_GeomFromText('POLYGON((-7.65 33.58, -7.55 33.58, -7.55 33.62, -7.65 33.62, -7.65 33.58))', 4326),
    15.00,
    200.00,
    true
);

-- This schema provides a comprehensive foundation for your Morocco e-commerce platform
-- with full support for variants, inventory tracking, reviews, and delivery zones.