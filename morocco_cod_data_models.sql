-- Morocco COD E-commerce Data Models
-- Optimized for cash-heavy market with WhatsApp/SMS communication
-- Focus on vape products with age verification requirements

-- =============================================
-- CORE ENTITY MODELS
-- =============================================

-- Customer management with Morocco-specific fields
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Personal Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    first_name_arabic VARCHAR(100), -- Arabic script name
    last_name_arabic VARCHAR(100),
    
    -- Age verification for vape products
    date_of_birth DATE,
    age_verified BOOLEAN DEFAULT FALSE,
    age_verification_method VARCHAR(50), -- 'manual', 'document', 'family_head'
    age_verification_date TIMESTAMP,
    age_verification_notes TEXT,
    
    -- Contact Information
    primary_phone VARCHAR(20) NOT NULL, -- Morocco format +212...
    secondary_phone VARCHAR(20),
    whatsapp_number VARCHAR(20), -- Often different from primary
    email VARCHAR(255),
    preferred_language VARCHAR(10) DEFAULT 'ar', -- 'ar', 'fr', 'en'
    
    -- Communication preferences
    preferred_contact_method VARCHAR(20) DEFAULT 'whatsapp', -- 'whatsapp', 'sms', 'call'
    whatsapp_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT TRUE,
    call_notifications BOOLEAN DEFAULT FALSE,
    
    -- Family/Household context
    is_family_head BOOLEAN DEFAULT FALSE,
    family_head_customer_id UUID REFERENCES customers(id),
    household_members_count INTEGER DEFAULT 1,
    
    -- Customer behavior tracking
    total_orders INTEGER DEFAULT 0,
    total_cod_orders INTEGER DEFAULT 0,
    successful_cod_orders INTEGER DEFAULT 0,
    failed_cod_orders INTEGER DEFAULT 0,
    cod_success_rate DECIMAL(5,2) DEFAULT 0.00,
    
    -- Risk assessment
    risk_score INTEGER DEFAULT 0, -- 0-100 scale
    risk_level VARCHAR(20) DEFAULT 'low', -- 'low', 'medium', 'high'
    blacklisted BOOLEAN DEFAULT FALSE,
    blacklist_reason TEXT,
    
    -- Account status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'suspended'
    registration_source VARCHAR(50), -- 'web', 'mobile', 'whatsapp', 'referral'
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    last_order_date TIMESTAMP
);

-- Morocco-specific address handling
CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    
    -- Address components
    label VARCHAR(100), -- 'Home', 'Work', 'Family House'
    recipient_name VARCHAR(200), -- May differ from customer name
    
    -- Morocco address structure
    region VARCHAR(100), -- Région (12 regions)
    province VARCHAR(100), -- Province/Préfecture
    city VARCHAR(100), -- Ville/Commune
    district VARCHAR(100), -- Quartier/Arrondissement
    neighborhood VARCHAR(100), -- Hay/Secteur
    
    -- Detailed location
    street_address TEXT, -- Street name and number if available
    building_name VARCHAR(100), -- Building or residence name
    landmark VARCHAR(200), -- Near mosque, school, etc.
    floor_apartment VARCHAR(50), -- Floor and apartment details
    
    -- GPS coordinates for delivery optimization
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Delivery instructions
    delivery_instructions TEXT, -- Detailed instructions in Arabic/French
    access_code VARCHAR(20), -- Building access code
    preferred_delivery_time VARCHAR(100), -- 'morning', 'afternoon', 'evening'
    
    -- Contact for this address
    contact_phone VARCHAR(20), -- May differ from customer phone
    whatsapp_number VARCHAR(20),
    
    -- Address validation
    is_validated BOOLEAN DEFAULT FALSE,
    validation_date TIMESTAMP,
    validation_method VARCHAR(50), -- 'gps', 'driver_confirm', 'customer_confirm'
    
    -- Usage tracking
    is_default BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    last_used_date TIMESTAMP,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product catalog with vape-specific attributes
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic product info
    name VARCHAR(255) NOT NULL,
    name_arabic VARCHAR(255),
    name_french VARCHAR(255),
    sku VARCHAR(100) UNIQUE NOT NULL,
    
    -- Vape product specifics
    product_type VARCHAR(50) NOT NULL, -- 'vape_device', 'liquid', 'accessory'
    category VARCHAR(100),
    subcategory VARCHAR(100),
    
    -- Age restriction compliance
    age_restricted BOOLEAN DEFAULT TRUE,
    minimum_age INTEGER DEFAULT 18,
    
    -- Pricing
    price_mad DECIMAL(10, 2) NOT NULL, -- Moroccan Dirham
    cost_mad DECIMAL(10, 2),
    
    -- Physical attributes
    weight_grams INTEGER,
    dimensions VARCHAR(100), -- L x W x H in cm
    
    -- Inventory
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    
    -- Product status
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Driver management
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Personal info
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    first_name_arabic VARCHAR(100),
    last_name_arabic VARCHAR(100),
    
    -- Contact
    phone VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20),
    email VARCHAR(255),
    
    -- Employment details
    employee_id VARCHAR(50) UNIQUE,
    hire_date DATE,
    employment_type VARCHAR(20), -- 'full_time', 'part_time', 'freelance'
    
    -- Vehicle information
    vehicle_type VARCHAR(50), -- 'motorcycle', 'car', 'bicycle'
    vehicle_plate VARCHAR(20),
    
    -- Work areas
    assigned_regions TEXT[], -- Array of regions they cover
    
    -- Driver status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'suspended'
    is_available BOOLEAN DEFAULT TRUE,
    current_location_lat DECIMAL(10, 8),
    current_location_lng DECIMAL(11, 8),
    last_location_update TIMESTAMP,
    
    -- Performance metrics
    total_deliveries INTEGER DEFAULT 0,
    successful_deliveries INTEGER DEFAULT 0,
    failed_deliveries INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2) DEFAULT 0.00,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Driver cash wallet management
CREATE TABLE driver_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    
    -- Cash balances
    cash_balance_mad DECIMAL(10, 2) DEFAULT 0.00,
    pending_collections_mad DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Daily limits
    daily_cash_limit_mad DECIMAL(10, 2) DEFAULT 5000.00,
    current_daily_collections_mad DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Status
    wallet_status VARCHAR(20) DEFAULT 'active', -- 'active', 'suspended', 'reconciling'
    last_reconciliation_date TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index definitions for core tables
CREATE INDEX idx_customers_phone ON customers(primary_phone);
CREATE INDEX idx_customers_whatsapp ON customers(whatsapp_number);
CREATE INDEX idx_customers_risk_level ON customers(risk_level);
CREATE INDEX idx_customers_family_head ON customers(family_head_customer_id);

CREATE INDEX idx_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX idx_addresses_region_city ON customer_addresses(region, city);
CREATE INDEX idx_addresses_default ON customer_addresses(is_default);

CREATE INDEX idx_products_type ON products(product_type);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_age_restricted ON products(age_restricted);

CREATE INDEX idx_drivers_status ON drivers(status);
CREATE INDEX idx_drivers_regions ON drivers USING gin(assigned_regions);
CREATE INDEX idx_drivers_availability ON drivers(is_available);