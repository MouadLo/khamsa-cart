-- COD Order Lifecycle and State Machine Models
-- Designed for Morocco's cash-heavy e-commerce environment

-- =============================================
-- ORDER LIFECYCLE MODELS
-- =============================================

-- Main orders table with COD-specific fields
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL, -- Human-readable order ID
    
    -- Customer and address
    customer_id UUID NOT NULL REFERENCES customers(id),
    delivery_address_id UUID NOT NULL REFERENCES customer_addresses(id),
    
    -- Order details
    subtotal_mad DECIMAL(10, 2) NOT NULL,
    delivery_fee_mad DECIMAL(10, 2) DEFAULT 0.00,
    total_amount_mad DECIMAL(10, 2) NOT NULL,
    
    -- Payment method (95% will be COD)
    payment_method VARCHAR(20) NOT NULL DEFAULT 'cod', -- 'cod', 'card', 'bank_transfer'
    payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'refunded'
    
    -- COD-specific fields
    cod_amount_mad DECIMAL(10, 2), -- Amount to collect on delivery
    cod_collected_amount_mad DECIMAL(10, 2) DEFAULT 0.00,
    cod_change_amount_mad DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Order status and workflow
    status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation',
    -- Status flow: pending_confirmation -> confirmed -> preparing -> ready_for_pickup -> 
    -- out_for_delivery -> delivered -> completed OR failed/cancelled
    
    -- Delivery assignment
    assigned_driver_id UUID REFERENCES drivers(id),
    delivery_date DATE,
    delivery_time_slot VARCHAR(50), -- 'morning', 'afternoon', 'evening'
    estimated_delivery_time TIMESTAMP,
    actual_delivery_time TIMESTAMP,
    
    -- Order source and channel
    order_source VARCHAR(50) DEFAULT 'web', -- 'web', 'mobile', 'whatsapp', 'phone'
    sales_channel VARCHAR(50) DEFAULT 'direct', -- 'direct', 'marketplace', 'social'
    
    -- Age verification for vape products
    age_verification_required BOOLEAN DEFAULT FALSE,
    age_verification_completed BOOLEAN DEFAULT FALSE,
    age_verification_method VARCHAR(50), -- 'id_check', 'customer_declaration', 'family_head'
    
    -- Attempt tracking
    delivery_attempts INTEGER DEFAULT 0,
    max_delivery_attempts INTEGER DEFAULT 3,
    
    -- Special instructions
    delivery_instructions TEXT,
    customer_notes TEXT,
    internal_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Order items with product details
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    product_id UUID NOT NULL REFERENCES products(id),
    
    -- Product snapshot at time of order
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100) NOT NULL,
    unit_price_mad DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    total_price_mad DECIMAL(10, 2) NOT NULL,
    
    -- Age verification per item
    age_verification_required BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order status history for tracking state changes
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    
    -- Status change details
    from_status VARCHAR(30),
    to_status VARCHAR(30) NOT NULL,
    change_reason VARCHAR(255),
    change_notes TEXT,
    
    -- Who made the change
    changed_by_type VARCHAR(20) NOT NULL, -- 'system', 'admin', 'driver', 'customer'
    changed_by_id UUID, -- Reference to user/driver/admin
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery attempts tracking
CREATE TABLE delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    
    -- Attempt details
    attempt_number INTEGER NOT NULL,
    attempt_date DATE NOT NULL,
    attempt_time TIMESTAMP NOT NULL,
    
    -- Outcome
    attempt_status VARCHAR(30) NOT NULL, -- 'successful', 'failed', 'rescheduled'
    failure_reason VARCHAR(100), -- 'customer_not_available', 'address_not_found', 'payment_refused'
    
    -- Customer interaction
    customer_contacted BOOLEAN DEFAULT FALSE,
    contact_method VARCHAR(20), -- 'phone', 'whatsapp', 'sms'
    customer_response TEXT,
    
    -- Location and timing
    arrival_time TIMESTAMP,
    departure_time TIMESTAMP,
    gps_location_lat DECIMAL(10, 8),
    gps_location_lng DECIMAL(11, 8),
    
    -- Reschedule information
    reschedule_date DATE,
    reschedule_time_slot VARCHAR(50),
    reschedule_reason TEXT,
    
    -- Driver notes
    driver_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- COD-specific order state machine
CREATE TABLE cod_order_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    
    -- Current state
    current_state VARCHAR(30) NOT NULL,
    
    -- State-specific data
    state_data JSONB, -- Flexible storage for state-specific information
    
    -- Timing
    entered_state_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expected_next_state_at TIMESTAMP,
    
    -- Actions required
    pending_actions TEXT[], -- Array of required actions
    blocked_by TEXT, -- What's preventing state progression
    
    -- Escalation
    escalation_level INTEGER DEFAULT 0, -- 0=normal, 1=attention, 2=urgent
    escalation_reason TEXT,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order scheduling for delivery windows
CREATE TABLE order_delivery_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    
    -- Requested delivery timing
    requested_delivery_date DATE,
    requested_time_slot VARCHAR(50), -- 'morning', 'afternoon', 'evening'
    specific_time_requested TIMESTAMP,
    
    -- Confirmed delivery timing
    confirmed_delivery_date DATE,
    confirmed_time_slot VARCHAR(50),
    confirmed_time_window_start TIMESTAMP,
    confirmed_time_window_end TIMESTAMP,
    
    -- Capacity management
    delivery_zone VARCHAR(100),
    zone_capacity_slot INTEGER,
    
    -- Scheduling status
    schedule_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'rescheduled'
    
    -- Rescheduling history
    reschedule_count INTEGER DEFAULT 0,
    last_reschedule_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order cancellation tracking
CREATE TABLE order_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    
    -- Cancellation details
    cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_by_type VARCHAR(20) NOT NULL, -- 'customer', 'admin', 'system', 'driver'
    cancelled_by_id UUID,
    
    -- Reason and category
    cancellation_reason VARCHAR(100) NOT NULL,
    cancellation_category VARCHAR(50), -- 'customer_request', 'payment_issue', 'delivery_failed'
    detailed_reason TEXT,
    
    -- Financial impact
    refund_required BOOLEAN DEFAULT FALSE,
    refund_amount_mad DECIMAL(10, 2),
    refund_processed BOOLEAN DEFAULT FALSE,
    refund_processed_at TIMESTAMP,
    
    -- Inventory impact
    inventory_restored BOOLEAN DEFAULT FALSE,
    
    -- Customer impact
    customer_notified BOOLEAN DEFAULT FALSE,
    notification_method VARCHAR(20)
);

-- COD payment collection details
CREATE TABLE cod_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    
    -- Collection details
    collection_date DATE NOT NULL,
    collection_time TIMESTAMP NOT NULL,
    
    -- Payment breakdown
    order_amount_mad DECIMAL(10, 2) NOT NULL,
    customer_paid_mad DECIMAL(10, 2) NOT NULL,
    change_given_mad DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Payment method details
    payment_notes TEXT, -- Notes about payment (exact change, large bills, etc.)
    
    -- Driver wallet impact
    added_to_driver_wallet BOOLEAN DEFAULT FALSE,
    wallet_transaction_id UUID,
    
    -- Verification
    customer_signature_required BOOLEAN DEFAULT FALSE,
    customer_signature_collected BOOLEAN DEFAULT FALSE,
    
    -- GPS location of collection
    collection_location_lat DECIMAL(10, 8),
    collection_location_lng DECIMAL(11, 8),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for order lifecycle tables
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_driver ON orders(assigned_driver_id);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_created_at ON orders(created_at);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX idx_order_status_history_status ON order_status_history(to_status);

CREATE INDEX idx_delivery_attempts_order ON delivery_attempts(order_id);
CREATE INDEX idx_delivery_attempts_driver ON delivery_attempts(driver_id);
CREATE INDEX idx_delivery_attempts_date ON delivery_attempts(attempt_date);

CREATE INDEX idx_cod_collections_order ON cod_collections(order_id);
CREATE INDEX idx_cod_collections_driver ON cod_collections(driver_id);
CREATE INDEX idx_cod_collections_date ON cod_collections(collection_date);