-- Cash Management and Reconciliation Models
-- Comprehensive cash flow tracking for COD operations

-- =============================================
-- CASH MANAGEMENT MODELS
-- =============================================

-- Driver wallet transactions
CREATE TABLE driver_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    wallet_id UUID NOT NULL REFERENCES driver_wallets(id),
    
    -- Transaction details
    transaction_type VARCHAR(30) NOT NULL, -- 'cod_collection', 'deposit', 'withdrawal', 'adjustment'
    amount_mad DECIMAL(10, 2) NOT NULL,
    
    -- Related entities
    order_id UUID REFERENCES orders(id), -- For COD collections
    collection_id UUID REFERENCES cod_collections(id),
    
    -- Transaction metadata
    description TEXT,
    reference_number VARCHAR(100),
    
    -- Balances after transaction
    balance_before_mad DECIMAL(10, 2) NOT NULL,
    balance_after_mad DECIMAL(10, 2) NOT NULL,
    
    -- Authorization and approval
    approved_by_id UUID, -- Admin who approved
    approval_required BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'reversed'
    
    -- Timestamps
    transaction_date DATE NOT NULL,
    transaction_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily cash reconciliation
CREATE TABLE daily_cash_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    
    -- Date and shift
    reconciliation_date DATE NOT NULL,
    shift_type VARCHAR(20), -- 'morning', 'afternoon', 'full_day'
    
    -- Cash summary
    opening_balance_mad DECIMAL(10, 2) NOT NULL,
    total_collections_mad DECIMAL(10, 2) NOT NULL,
    total_deposits_mad DECIMAL(10, 2) DEFAULT 0.00,
    expected_closing_balance_mad DECIMAL(10, 2) NOT NULL,
    actual_closing_balance_mad DECIMAL(10, 2),
    
    -- Discrepancy tracking
    discrepancy_amount_mad DECIMAL(10, 2) DEFAULT 0.00,
    discrepancy_reason TEXT,
    
    -- Delivery performance
    total_deliveries INTEGER DEFAULT 0,
    successful_cod_deliveries INTEGER DEFAULT 0,
    failed_cod_deliveries INTEGER DEFAULT 0,
    
    -- Reconciliation status
    reconciliation_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'disputed'
    reconciled_by_id UUID, -- Admin who reconciled
    reconciled_at TIMESTAMP,
    
    -- Supporting documents
    has_receipts BOOLEAN DEFAULT FALSE,
    receipt_count INTEGER DEFAULT 0,
    
    -- Driver confirmation
    driver_confirmed BOOLEAN DEFAULT FALSE,
    driver_confirmed_at TIMESTAMP,
    driver_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cash deposit tracking
CREATE TABLE cash_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    
    -- Deposit details
    deposit_date DATE NOT NULL,
    deposit_time TIMESTAMP NOT NULL,
    deposit_amount_mad DECIMAL(10, 2) NOT NULL,
    
    -- Deposit breakdown
    cash_breakdown JSONB, -- {"500": 2, "200": 5, "100": 10, ...} - note counts
    
    -- Deposit location and method
    deposit_location VARCHAR(100), -- 'main_office', 'branch', 'bank', 'collection_point'
    deposit_method VARCHAR(50), -- 'hand_delivery', 'bank_transfer', 'cash_collection'
    
    -- Verification
    received_by_id UUID, -- Staff member who received
    receipt_number VARCHAR(100),
    bank_reference VARCHAR(100),
    
    -- Related reconciliation
    reconciliation_id UUID REFERENCES daily_cash_reconciliations(id),
    
    -- Status
    deposit_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'verified', 'disputed'
    verified_at TIMESTAMP,
    
    -- Notes
    deposit_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cash collection routes optimization
CREATE TABLE cash_collection_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Route details
    route_name VARCHAR(100) NOT NULL,
    route_date DATE NOT NULL,
    collection_zone VARCHAR(100),
    
    -- Driver assignment
    primary_driver_id UUID REFERENCES drivers(id),
    backup_driver_id UUID REFERENCES drivers(id),
    
    -- Route optimization
    planned_stops INTEGER DEFAULT 0,
    estimated_duration_minutes INTEGER,
    estimated_collection_amount_mad DECIMAL(10, 2),
    
    -- Actual performance
    actual_stops INTEGER DEFAULT 0,
    actual_duration_minutes INTEGER,
    actual_collection_amount_mad DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Route status
    route_status VARCHAR(20) DEFAULT 'planned', -- 'planned', 'in_progress', 'completed', 'cancelled'
    
    -- Timestamps
    planned_start_time TIMESTAMP,
    actual_start_time TIMESTAMP,
    planned_end_time TIMESTAMP,
    actual_end_time TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cash collection route stops
CREATE TABLE cash_collection_route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES cash_collection_routes(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    
    -- Stop sequence
    stop_sequence INTEGER NOT NULL,
    
    -- Location details
    customer_address_id UUID NOT NULL REFERENCES customer_addresses(id),
    estimated_arrival_time TIMESTAMP,
    actual_arrival_time TIMESTAMP,
    
    -- Collection details
    expected_collection_amount_mad DECIMAL(10, 2),
    actual_collection_amount_mad DECIMAL(10, 2),
    
    -- Stop outcome
    stop_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'skipped'
    completion_notes TEXT,
    
    -- Time tracking
    arrival_time TIMESTAMP,
    departure_time TIMESTAMP,
    duration_minutes INTEGER,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cash flow analytics
CREATE TABLE cash_flow_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Time period
    analysis_date DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly'
    
    -- Overall metrics
    total_orders INTEGER DEFAULT 0,
    total_cod_orders INTEGER DEFAULT 0,
    cod_percentage DECIMAL(5, 2) DEFAULT 0.00,
    
    -- Collection metrics
    total_collections_mad DECIMAL(10, 2) DEFAULT 0.00,
    average_collection_amount_mad DECIMAL(10, 2) DEFAULT 0.00,
    successful_collections INTEGER DEFAULT 0,
    failed_collections INTEGER DEFAULT 0,
    collection_success_rate DECIMAL(5, 2) DEFAULT 0.00,
    
    -- Timing metrics
    average_collection_time_minutes INTEGER DEFAULT 0,
    average_delivery_attempts DECIMAL(3, 2) DEFAULT 0.00,
    
    -- Driver performance
    active_drivers INTEGER DEFAULT 0,
    top_performing_driver_id UUID REFERENCES drivers(id),
    
    -- Regional breakdown
    region_breakdown JSONB, -- {"Casablanca": {"collections": 1500, "amount": 25000}, ...}
    
    -- Cash management efficiency
    total_deposits_mad DECIMAL(10, 2) DEFAULT 0.00,
    total_discrepancies_mad DECIMAL(10, 2) DEFAULT 0.00,
    reconciliation_accuracy DECIMAL(5, 2) DEFAULT 0.00,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cash shortage/overage tracking
CREATE TABLE cash_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Related entity
    entity_type VARCHAR(20) NOT NULL, -- 'driver', 'collection_point', 'deposit'
    entity_id UUID NOT NULL,
    
    -- Discrepancy details
    discrepancy_date DATE NOT NULL,
    discrepancy_type VARCHAR(20) NOT NULL, -- 'shortage', 'overage'
    discrepancy_amount_mad DECIMAL(10, 2) NOT NULL,
    
    -- Investigation
    investigation_status VARCHAR(20) DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'written_off'
    investigation_notes TEXT,
    assigned_investigator_id UUID,
    
    -- Resolution
    resolution_date DATE,
    resolution_method VARCHAR(50), -- 'driver_payment', 'insurance_claim', 'written_off'
    resolution_amount_mad DECIMAL(10, 2),
    resolution_notes TEXT,
    
    -- Prevention measures
    prevention_actions TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cash handling audit trail
CREATE TABLE cash_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Audit context
    audit_date DATE NOT NULL,
    audit_type VARCHAR(30) NOT NULL, -- 'reconciliation', 'deposit', 'investigation'
    audited_entity_type VARCHAR(20) NOT NULL, -- 'driver', 'collection', 'deposit'
    audited_entity_id UUID NOT NULL,
    
    -- Audit details
    auditor_id UUID NOT NULL,
    audit_findings TEXT,
    
    -- Compliance
    compliance_status VARCHAR(20) DEFAULT 'compliant', -- 'compliant', 'non_compliant', 'needs_review'
    compliance_notes TEXT,
    
    -- Action items
    action_items TEXT[],
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for cash management tables
CREATE INDEX idx_wallet_transactions_driver ON driver_wallet_transactions(driver_id);
CREATE INDEX idx_wallet_transactions_type ON driver_wallet_transactions(transaction_type);
CREATE INDEX idx_wallet_transactions_date ON driver_wallet_transactions(transaction_date);
CREATE INDEX idx_wallet_transactions_order ON driver_wallet_transactions(order_id);

CREATE INDEX idx_daily_reconciliations_driver ON daily_cash_reconciliations(driver_id);
CREATE INDEX idx_daily_reconciliations_date ON daily_cash_reconciliations(reconciliation_date);
CREATE INDEX idx_daily_reconciliations_status ON daily_cash_reconciliations(reconciliation_status);

CREATE INDEX idx_cash_deposits_driver ON cash_deposits(driver_id);
CREATE INDEX idx_cash_deposits_date ON cash_deposits(deposit_date);
CREATE INDEX idx_cash_deposits_status ON cash_deposits(deposit_status);

CREATE INDEX idx_collection_routes_date ON cash_collection_routes(route_date);
CREATE INDEX idx_collection_routes_driver ON cash_collection_routes(primary_driver_id);
CREATE INDEX idx_collection_routes_status ON cash_collection_routes(route_status);

CREATE INDEX idx_route_stops_route ON cash_collection_route_stops(route_id);
CREATE INDEX idx_route_stops_order ON cash_collection_route_stops(order_id);

CREATE INDEX idx_cash_flow_analytics_date ON cash_flow_analytics(analysis_date);
CREATE INDEX idx_cash_flow_analytics_period ON cash_flow_analytics(period_type);

CREATE INDEX idx_cash_discrepancies_entity ON cash_discrepancies(entity_type, entity_id);
CREATE INDEX idx_cash_discrepancies_date ON cash_discrepancies(discrepancy_date);
CREATE INDEX idx_cash_discrepancies_status ON cash_discrepancies(investigation_status);