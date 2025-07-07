-- =====================================================
-- SAMPLE DATA AND COMMON QUERIES
-- Morocco Grocery & Vape Delivery App
-- =====================================================

-- =====================================================
-- SAMPLE DATA INSERTION
-- =====================================================

-- Insert sample Morocco regions and cities
INSERT INTO morocco_regions (name_ar, name_fr, name_en, code) VALUES 
('الدار البيضاء سطات', 'Casablanca-Settat', 'Casablanca-Settat', 'CS'),
('الرباط سلا القنيطرة', 'Rabat-Salé-Kénitra', 'Rabat-Salé-Kénitra', 'RSK');

INSERT INTO morocco_provinces (region_id, name_ar, name_fr, name_en, code) VALUES 
(1, 'الدار البيضاء', 'Casablanca', 'Casablanca', 'CAS'),
(1, 'سطات', 'Settat', 'Settat', 'SET'),
(2, 'الرباط', 'Rabat', 'Rabat', 'RAB'),
(2, 'سلا', 'Salé', 'Salé', 'SAL');

INSERT INTO morocco_cities (province_id, name_ar, name_fr, name_en, postal_code, is_delivery_available, delivery_fee) VALUES 
(1, 'الدار البيضاء', 'Casablanca', 'Casablanca', '20000', TRUE, 15.00),
(1, 'عين الشق', 'Ain Chock', 'Ain Chock', '20100', TRUE, 20.00),
(1, 'الفداء', 'Al Fida', 'Al Fida', '20200', TRUE, 18.00),
(2, 'سطات', 'Settat', 'Settat', '26000', TRUE, 25.00),
(3, 'الرباط', 'Rabat', 'Rabat', '10000', TRUE, 12.00),
(4, 'سلا', 'Salé', 'Salé', '11000', TRUE, 15.00);

-- Insert sample product brands
INSERT INTO product_brands (name, slug, description_ar, description_fr, description_en) VALUES 
('Danone', 'danone', 'علامة تجارية رائدة في منتجات الألبان', 'Marque leader des produits laitiers', 'Leading dairy products brand'),
('Nestlé', 'nestle', 'منتجات غذائية عالمية', 'Produits alimentaires mondiaux', 'Global food products'),
('VUSE', 'vuse', 'علامة تجارية للسجائر الإلكترونية', 'Marque de cigarettes électroniques', 'E-cigarette brand'),
('JUUL', 'juul', 'نظام السجائر الإلكترونية', 'Système de cigarettes électroniques', 'E-cigarette system');

-- Insert sample product attributes
INSERT INTO product_attributes (name_ar, name_fr, name_en, type, is_filterable) VALUES 
('الحجم', 'Taille', 'Size', 'select', TRUE),
('النكهة', 'Saveur', 'Flavor', 'select', TRUE),
('اللون', 'Couleur', 'Color', 'select', TRUE),
('قوة النيكوتين', 'Force de nicotine', 'Nicotine strength', 'select', TRUE),
('الوزن', 'Poids', 'Weight', 'number', FALSE);

-- Insert sample attribute values
INSERT INTO product_attribute_values (attribute_id, value_ar, value_fr, value_en, sort_order) VALUES 
(1, 'صغير', 'Petit', 'Small', 1),
(1, 'متوسط', 'Moyen', 'Medium', 2),
(1, 'كبير', 'Grand', 'Large', 3),
(2, 'فانيليا', 'Vanille', 'Vanilla', 1),
(2, 'شوكولاتة', 'Chocolat', 'Chocolate', 2),
(2, 'فراولة', 'Fraise', 'Strawberry', 3),
(2, 'منثول', 'Menthol', 'Menthol', 4),
(4, '0mg', '0mg', '0mg', 1),
(4, '3mg', '3mg', '3mg', 2),
(4, '6mg', '6mg', '6mg', 3),
(4, '12mg', '12mg', '12mg', 4);

-- Insert sample users
INSERT INTO users (email, phone, first_name, last_name, preferred_language, is_verified) VALUES 
('ahmed.hassan@email.com', '+212661234567', 'أحمد', 'حسن', 'ar', TRUE),
('fatima.berrada@email.com', '+212662345678', 'فاطمة', 'بريدة', 'ar', TRUE),
('pierre.martin@email.com', '+212663456789', 'Pierre', 'Martin', 'fr', TRUE),
('sarah.johnson@email.com', '+212664567890', 'Sarah', 'Johnson', 'en', FALSE);

-- Insert sample user addresses
INSERT INTO user_addresses (user_id, type, title, full_name, phone, city_id, address_line_1, address_line_2, is_default) VALUES 
((SELECT id FROM users WHERE email = 'ahmed.hassan@email.com'), 'home', 'المنزل', 'أحمد حسن', '+212661234567', 1, 'شارع محمد الخامس، رقم 45', 'الطابق الثاني', TRUE),
((SELECT id FROM users WHERE email = 'fatima.berrada@email.com'), 'home', 'المنزل', 'فاطمة بريدة', '+212662345678', 2, 'حي الأمل، زنقة 12', 'بناية أ، شقة 5', TRUE),
((SELECT id FROM users WHERE email = 'pierre.martin@email.com'), 'work', 'Bureau', 'Pierre Martin', '+212663456789', 3, '15 Avenue Hassan II', 'Bureau 204', TRUE);

-- Insert sample products
INSERT INTO products (sku, name_ar, name_fr, name_en, slug, description_ar, description_fr, description_en, category_id, brand_id, type, price, weight, requires_age_verification, min_age_required) VALUES 
('DAIRY001', 'لبن دانون طبيعي', 'Lait Danone Nature', 'Danone Natural Milk', 'danone-natural-milk', 'لبن طبيعي طازج من دانون', 'Lait naturel frais de Danone', 'Fresh natural milk from Danone', 4, 1, 'simple', 8.50, 1000, FALSE, NULL),
('DAIRY002', 'زبادي دانون بالفراولة', 'Yaourt Danone Fraise', 'Danone Strawberry Yogurt', 'danone-strawberry-yogurt', 'زبادي لذيذ بطعم الفراولة', 'Yaourt délicieux au goût de fraise', 'Delicious strawberry flavored yogurt', 4, 1, 'simple', 12.00, 125, FALSE, NULL),
('VAPE001', 'سيجارة إلكترونية VUSE', 'Cigarette électronique VUSE', 'VUSE E-cigarette', 'vuse-e-cigarette', 'سيجارة إلكترونية عالية الجودة', 'Cigarette électronique de haute qualité', 'High quality e-cigarette', 5, 3, 'variable', 150.00, 50, TRUE, 18),
('ELIQ001', 'سائل إلكتروني منثول', 'E-liquide Menthol', 'Menthol E-liquid', 'menthol-e-liquid', 'سائل إلكتروني بنكهة المنثول', 'E-liquide saveur menthol', 'Menthol flavored e-liquid', 6, 3, 'variable', 45.00, 30, TRUE, 18);

-- Insert product variants for variable products
INSERT INTO product_variants (product_id, sku, name_ar, name_fr, name_en, price) VALUES 
((SELECT id FROM products WHERE sku = 'VAPE001'), 'VUSE001-BLK', 'VUSE أسود', 'VUSE Noir', 'VUSE Black', 150.00),
((SELECT id FROM products WHERE sku = 'VAPE001'), 'VUSE001-WHT', 'VUSE أبيض', 'VUSE Blanc', 'VUSE White', 150.00),
((SELECT id FROM products WHERE sku = 'ELIQ001'), 'ELIQ001-0MG', 'منثول 0mg', 'Menthol 0mg', 'Menthol 0mg', 45.00),
((SELECT id FROM products WHERE sku = 'ELIQ001'), 'ELIQ001-3MG', 'منثول 3mg', 'Menthol 3mg', 'Menthol 3mg', 45.00),
((SELECT id FROM products WHERE sku = 'ELIQ001'), 'ELIQ001-6MG', 'منثول 6mg', 'Menthol 6mg', 'Menthol 6mg', 45.00);

-- Insert inventory locations
INSERT INTO inventory_locations (name, address, city_id, phone) VALUES 
('مستودع الدار البيضاء الرئيسي', 'المنطقة الصناعية سيدي برنوصي', 1, '+212522123456'),
('مستودع الرباط', 'المنطقة الصناعية سلا', 3, '+212537654321');

-- Insert inventory for products
INSERT INTO product_inventory (product_id, location_id, quantity, reorder_point, reorder_quantity) VALUES 
((SELECT id FROM products WHERE sku = 'DAIRY001'), 1, 500, 50, 200),
((SELECT id FROM products WHERE sku = 'DAIRY001'), 2, 200, 30, 100),
((SELECT id FROM products WHERE sku = 'DAIRY002'), 1, 300, 40, 150),
((SELECT id FROM products WHERE sku = 'DAIRY002'), 2, 150, 25, 75);

-- Insert inventory for variants
INSERT INTO product_inventory (variant_id, location_id, quantity, reorder_point, reorder_quantity) VALUES 
((SELECT id FROM product_variants WHERE sku = 'VUSE001-BLK'), 1, 50, 10, 30),
((SELECT id FROM product_variants WHERE sku = 'VUSE001-WHT'), 1, 40, 10, 30),
((SELECT id FROM product_variants WHERE sku = 'ELIQ001-0MG'), 1, 100, 20, 50),
((SELECT id FROM product_variants WHERE sku = 'ELIQ001-3MG'), 1, 80, 15, 40),
((SELECT id FROM product_variants WHERE sku = 'ELIQ001-6MG'), 1, 60, 15, 40);

-- Insert delivery zones
INSERT INTO delivery_zones (name, cities, delivery_fee, free_delivery_threshold, estimated_delivery_time) VALUES 
('الدار البيضاء المركز', ARRAY[1], 15.00, 200.00, '1-2 ساعة'),
('الدار البيضاء الضواحي', ARRAY[2, 3], 20.00, 250.00, '2-3 ساعة'),
('الرباط وسلا', ARRAY[5, 6], 12.00, 180.00, '1-2 ساعة');

-- Insert sample orders
INSERT INTO orders (
    order_number, user_id, status_id, customer_email, customer_phone, 
    customer_first_name, customer_last_name, billing_address, shipping_address,
    subtotal, shipping_amount, total_amount, payment_method, is_cod, 
    delivery_date, requires_age_verification
) VALUES 
(
    '202407070001', 
    (SELECT id FROM users WHERE email = 'ahmed.hassan@email.com'),
    1, -- pending
    'ahmed.hassan@email.com',
    '+212661234567',
    'أحمد',
    'حسن',
    '{"full_name": "أحمد حسن", "phone": "+212661234567", "city": "الدار البيضاء", "address_line_1": "شارع محمد الخامس، رقم 45", "address_line_2": "الطابق الثاني"}',
    '{"full_name": "أحمد حسن", "phone": "+212661234567", "city": "الدار البيضاء", "address_line_1": "شارع محمد الخامس، رقم 45", "address_line_2": "الطابق الثاني"}',
    45.00,
    15.00,
    60.00,
    'cod',
    TRUE,
    CURRENT_DATE + INTERVAL '1 day',
    FALSE
),
(
    '202407070002',
    (SELECT id FROM users WHERE email = 'fatima.berrada@email.com'),
    2, -- confirmed
    'fatima.berrada@email.com',
    '+212662345678',
    'فاطمة',
    'بريدة',
    '{"full_name": "فاطمة بريدة", "phone": "+212662345678", "city": "عين الشق", "address_line_1": "حي الأمل، زنقة 12", "address_line_2": "بناية أ، شقة 5"}',
    '{"full_name": "فاطمة بريدة", "phone": "+212662345678", "city": "عين الشق", "address_line_1": "حي الأمل، زنقة 12", "address_line_2": "بناية أ، شقة 5"}',
    195.00,
    20.00,
    215.00,
    'cod',
    TRUE,
    CURRENT_DATE + INTERVAL '1 day',
    TRUE
);

-- Insert order items
INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price, total_price, product_data) VALUES 
(
    (SELECT id FROM orders WHERE order_number = '202407070001'),
    (SELECT id FROM products WHERE sku = 'DAIRY001'),
    'DAIRY001',
    'لبن دانون طبيعي',
    3,
    8.50,
    25.50,
    '{"name_ar": "لبن دانون طبيعي", "brand": "Danone", "category": "منتجات الألبان"}'
),
(
    (SELECT id FROM orders WHERE order_number = '202407070001'),
    (SELECT id FROM products WHERE sku = 'DAIRY002'),
    'DAIRY002',
    'زبادي دانون بالفراولة',
    2,
    12.00,
    24.00,
    '{"name_ar": "زبادي دانون بالفراولة", "brand": "Danone", "category": "منتجات الألبان"}'
),
(
    (SELECT id FROM orders WHERE order_number = '202407070002'),
    (SELECT id FROM products WHERE sku = 'VAPE001'),
    'VUSE001-BLK',
    'سيجارة إلكترونية VUSE أسود',
    1,
    150.00,
    150.00,
    '{"name_ar": "سيجارة إلكترونية VUSE", "brand": "VUSE", "category": "السجائر الإلكترونية", "color": "أسود"}'
),
(
    (SELECT id FROM orders WHERE order_number = '202407070002'),
    (SELECT id FROM products WHERE sku = 'ELIQ001'),
    'ELIQ001-3MG',
    'سائل إلكتروني منثول 3mg',
    1,
    45.00,
    45.00,
    '{"name_ar": "سائل إلكتروني منثول", "brand": "VUSE", "category": "السوائل الإلكترونية", "nicotine": "3mg"}'
);

-- Insert guest session for demonstration
INSERT INTO guest_sessions (session_token, phone, preferred_language, expires_at) VALUES 
('guest_session_' || uuid_generate_v4(), '+212665555555', 'ar', CURRENT_TIMESTAMP + INTERVAL '24 hours');

-- Insert guest order
INSERT INTO orders (
    order_number, guest_session_id, status_id, customer_phone, 
    customer_first_name, customer_last_name, billing_address, shipping_address,
    subtotal, shipping_amount, total_amount, payment_method, is_cod,
    delivery_date, requires_age_verification
) VALUES 
(
    '202407070003',
    (SELECT id FROM guest_sessions WHERE phone = '+212665555555'),
    1, -- pending
    '+212665555555',
    'زائر',
    'مؤقت',
    '{"full_name": "زائر مؤقت", "phone": "+212665555555", "city": "سطات", "address_line_1": "شارع الاستقلال، رقم 123"}',
    '{"full_name": "زائر مؤقت", "phone": "+212665555555", "city": "سطات", "address_line_1": "شارع الاستقلال، رقم 123"}',
    8.50,
    25.00,
    33.50,
    'cod',
    TRUE,
    CURRENT_DATE + INTERVAL '2 days',
    FALSE
);

-- Insert order item for guest order
INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price, total_price, product_data) VALUES 
(
    (SELECT id FROM orders WHERE order_number = '202407070003'),
    (SELECT id FROM products WHERE sku = 'DAIRY001'),
    'DAIRY001',
    'لبن دانون طبيعي',
    1,
    8.50,
    8.50,
    '{"name_ar": "لبن دانون طبيعي", "brand": "Danone", "category": "منتجات الألبان"}'
);

-- =====================================================
-- COMMON QUERIES AND USE CASES
-- =====================================================

-- =====================================================
-- 1. PRODUCT SEARCH AND CATALOG
-- =====================================================

-- Multi-language product search with Arabic
SELECT 
    p.id,
    p.name_ar,
    p.name_fr,
    p.name_en,
    p.price,
    p.compare_price,
    c.name_ar as category_name,
    b.name as brand_name,
    COALESCE(SUM(pi.quantity - pi.reserved_quantity), 0) as available_stock
FROM products p
LEFT JOIN product_categories c ON p.category_id = c.id
LEFT JOIN product_brands b ON p.brand_id = b.id
LEFT JOIN product_inventory pi ON p.id = pi.product_id
WHERE p.status = 'active'
  AND (
    to_tsvector('arabic', p.name_ar) @@ plainto_tsquery('arabic', 'لبن') OR
    to_tsvector('french', p.name_fr) @@ plainto_tsquery('french', 'lait') OR
    to_tsvector('english', p.name_en) @@ plainto_tsquery('english', 'milk')
  )
GROUP BY p.id, c.id, b.id
HAVING COALESCE(SUM(pi.quantity - pi.reserved_quantity), 0) > 0
ORDER BY p.is_featured DESC, p.created_at DESC;

-- Product catalog with filters (category, price range, brand)
SELECT 
    p.id,
    p.name_ar,
    p.price,
    p.compare_price,
    c.name_ar as category_name,
    b.name as brand_name,
    CASE 
        WHEN p.compare_price IS NOT NULL THEN 
            ROUND(((p.compare_price - p.price) / p.compare_price * 100), 0)
        ELSE 0
    END as discount_percentage
FROM products p
LEFT JOIN product_categories c ON p.category_id = c.id
LEFT JOIN product_brands b ON p.brand_id = b.id
WHERE p.status = 'active'
  AND p.category_id = 4 -- Dairy products
  AND p.price BETWEEN 5.00 AND 50.00
  AND EXISTS (
    SELECT 1 FROM product_inventory pi 
    WHERE pi.product_id = p.id 
    AND pi.quantity > pi.reserved_quantity
  )
ORDER BY p.is_featured DESC, p.price ASC;

-- Get product with variants and inventory
SELECT 
    p.id as product_id,
    p.name_ar as product_name,
    p.price as base_price,
    pv.id as variant_id,
    pv.name_ar as variant_name,
    pv.price as variant_price,
    COALESCE(SUM(pi.quantity - pi.reserved_quantity), 0) as available_stock
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
LEFT JOIN product_inventory pi ON (pi.product_id = p.id OR pi.variant_id = pv.id)
WHERE p.slug = 'vuse-e-cigarette'
GROUP BY p.id, pv.id
ORDER BY pv.price ASC;

-- =====================================================
-- 2. USER MANAGEMENT AND AUTHENTICATION
-- =====================================================

-- User authentication by email or phone
SELECT 
    u.id,
    u.email,
    u.phone,
    u.password_hash,
    u.first_name,
    u.last_name,
    u.preferred_language,
    u.is_active,
    u.is_verified
FROM users u
WHERE (u.email = 'ahmed.hassan@email.com' OR u.phone = '+212661234567')
  AND u.is_active = TRUE;

-- User profile with addresses and order statistics
SELECT 
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
    u.preferred_language,
    up.marketing_consent,
    COUNT(o.id) as total_orders,
    COALESCE(SUM(o.total_amount), 0) as total_spent,
    MAX(o.created_at) as last_order_date
FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.id = (SELECT id FROM users WHERE email = 'ahmed.hassan@email.com')
GROUP BY u.id, up.user_id;

-- Get user addresses with city information
SELECT 
    ua.id,
    ua.type,
    ua.title,
    ua.full_name,
    ua.phone,
    ua.address_line_1,
    ua.address_line_2,
    ua.landmark,
    ua.is_default,
    mc.name_ar as city_name,
    mp.name_ar as province_name,
    mr.name_ar as region_name
FROM user_addresses ua
JOIN morocco_cities mc ON ua.city_id = mc.id
JOIN morocco_provinces mp ON mc.province_id = mp.id
JOIN morocco_regions mr ON mp.region_id = mr.id
WHERE ua.user_id = (SELECT id FROM users WHERE email = 'ahmed.hassan@email.com')
  AND ua.is_active = TRUE
ORDER BY ua.is_default DESC, ua.created_at DESC;

-- =====================================================
-- 3. ORDER MANAGEMENT
-- =====================================================

-- Order history for a user
SELECT 
    o.id,
    o.order_number,
    o.total_amount,
    o.payment_method,
    o.is_cod,
    o.delivery_date,
    o.created_at,
    s.name_ar as status_name,
    s.color as status_color,
    COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_statuses s ON o.status_id = s.id
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.user_id = (SELECT id FROM users WHERE email = 'ahmed.hassan@email.com')
GROUP BY o.id, s.id
ORDER BY o.created_at DESC;

-- Order details with items
SELECT 
    o.id,
    o.order_number,
    o.customer_first_name,
    o.customer_last_name,
    o.customer_phone,
    o.billing_address,
    o.shipping_address,
    o.subtotal,
    o.shipping_amount,
    o.total_amount,
    o.payment_method,
    o.delivery_date,
    s.name_ar as status_name,
    json_agg(
        json_build_object(
            'product_name', oi.name,
            'sku', oi.sku,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', oi.total_price
        )
    ) as items
FROM orders o
LEFT JOIN order_statuses s ON o.status_id = s.id
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.order_number = '202407070001'
GROUP BY o.id, s.id;

-- Orders requiring age verification
SELECT 
    o.id,
    o.order_number,
    o.customer_first_name,
    o.customer_last_name,
    o.customer_phone,
    o.total_amount,
    o.requires_age_verification,
    o.age_verified_at,
    s.name_ar as status_name
FROM orders o
LEFT JOIN order_statuses s ON o.status_id = s.id
WHERE o.requires_age_verification = TRUE
  AND o.age_verified_at IS NULL
ORDER BY o.created_at DESC;

-- =====================================================
-- 4. COD MANAGEMENT AND RECONCILIATION
-- =====================================================

-- COD orders pending collection
SELECT 
    o.id,
    o.order_number,
    o.customer_first_name,
    o.customer_last_name,
    o.customer_phone,
    o.total_amount,
    o.delivery_date,
    s.name_ar as status_name,
    da.delivery_person_id,
    da.status as delivery_status
FROM orders o
LEFT JOIN order_statuses s ON o.status_id = s.id
LEFT JOIN delivery_assignments da ON o.id = da.order_id
WHERE o.is_cod = TRUE
  AND o.status_id IN (2, 3, 4) -- confirmed, preparing, out_for_delivery
ORDER BY o.delivery_date ASC, o.created_at ASC;

-- COD collections for reconciliation
SELECT 
    cc.id,
    cc.order_id,
    o.order_number,
    o.customer_phone,
    cc.amount_collected,
    cc.collection_date,
    cc.receipt_number,
    cc.is_reconciled,
    dp.employee_id as collected_by_employee,
    u.first_name as collector_name
FROM cod_collections cc
JOIN orders o ON cc.order_id = o.id
JOIN delivery_personnel dp ON cc.collected_by = dp.id
JOIN users u ON dp.user_id = u.id
WHERE cc.is_reconciled = FALSE
ORDER BY cc.collection_date DESC;

-- Daily COD reconciliation report
SELECT 
    DATE(cc.collection_date) as collection_date,
    COUNT(*) as total_collections,
    SUM(cc.amount_collected) as total_amount,
    COUNT(*) FILTER (WHERE cc.is_reconciled = TRUE) as reconciled_count,
    COUNT(*) FILTER (WHERE cc.is_reconciled = FALSE) as pending_count
FROM cod_collections cc
WHERE cc.collection_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(cc.collection_date)
ORDER BY collection_date DESC;

-- =====================================================
-- 5. INVENTORY MANAGEMENT
-- =====================================================

-- Low stock alerts
SELECT 
    p.id,
    p.name_ar,
    p.sku,
    pv.sku as variant_sku,
    pv.name_ar as variant_name,
    pi.quantity,
    pi.reserved_quantity,
    pi.quantity - pi.reserved_quantity as available_stock,
    pi.reorder_point,
    il.name as location_name
FROM product_inventory pi
LEFT JOIN products p ON pi.product_id = p.id
LEFT JOIN product_variants pv ON pi.variant_id = pv.id
LEFT JOIN inventory_locations il ON pi.location_id = il.id
WHERE pi.quantity - pi.reserved_quantity <= pi.reorder_point
  AND pi.quantity - pi.reserved_quantity >= 0
ORDER BY pi.quantity - pi.reserved_quantity ASC;

-- Inventory movement history
SELECT 
    im.id,
    im.type,
    im.quantity,
    im.reference_type,
    im.reference_id,
    im.notes,
    im.created_at,
    p.name_ar as product_name,
    p.sku as product_sku,
    pv.sku as variant_sku,
    il.name as location_name,
    u.first_name as created_by_name
FROM inventory_movements im
JOIN product_inventory pi ON im.inventory_id = pi.id
LEFT JOIN products p ON pi.product_id = p.id
LEFT JOIN product_variants pv ON pi.variant_id = pv.id
LEFT JOIN inventory_locations il ON pi.location_id = il.id
LEFT JOIN users u ON im.created_by = u.id
WHERE im.created_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY im.created_at DESC;

-- =====================================================
-- 6. DELIVERY MANAGEMENT
-- =====================================================

-- Delivery assignments for today
SELECT 
    da.id,
    da.order_id,
    o.order_number,
    o.customer_first_name,
    o.customer_last_name,
    o.customer_phone,
    o.shipping_address->>'city' as delivery_city,
    o.total_amount,
    da.status as delivery_status,
    da.assigned_at,
    da.pickup_time,
    da.delivery_time,
    dp.employee_id,
    u.first_name as delivery_person_name
FROM delivery_assignments da
JOIN orders o ON da.order_id = o.id
JOIN delivery_personnel dp ON da.delivery_person_id = dp.id
JOIN users u ON dp.user_id = u.id
WHERE DATE(da.assigned_at) = CURRENT_DATE
  OR (da.status = 'assigned' AND o.delivery_date = CURRENT_DATE)
ORDER BY da.assigned_at ASC;

-- Delivery performance metrics
SELECT 
    dp.employee_id,
    u.first_name as delivery_person_name,
    COUNT(da.id) as total_deliveries,
    COUNT(*) FILTER (WHERE da.status = 'delivered') as successful_deliveries,
    COUNT(*) FILTER (WHERE da.status = 'failed') as failed_deliveries,
    AVG(EXTRACT(EPOCH FROM (da.delivery_time - da.pickup_time))/3600) as avg_delivery_time_hours
FROM delivery_personnel dp
JOIN users u ON dp.user_id = u.id
LEFT JOIN delivery_assignments da ON dp.id = da.delivery_person_id
WHERE da.assigned_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY dp.id, u.id
ORDER BY successful_deliveries DESC;

-- =====================================================
-- 7. ANALYTICS AND REPORTING
-- =====================================================

-- Daily sales report
SELECT 
    DATE(o.created_at) as order_date,
    COUNT(o.id) as total_orders,
    COUNT(*) FILTER (WHERE o.is_cod = TRUE) as cod_orders,
    COUNT(*) FILTER (WHERE o.is_cod = FALSE) as online_orders,
    SUM(o.total_amount) as total_revenue,
    AVG(o.total_amount) as avg_order_value,
    COUNT(DISTINCT o.user_id) as unique_customers
FROM orders o
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND o.status_id NOT IN (6) -- Exclude cancelled orders
GROUP BY DATE(o.created_at)
ORDER BY order_date DESC;

-- Top selling products
SELECT 
    p.id,
    p.name_ar,
    p.sku,
    SUM(oi.quantity) as total_sold,
    SUM(oi.total_price) as total_revenue,
    COUNT(DISTINCT oi.order_id) as orders_count
FROM order_items oi
JOIN products p ON oi.product_id = p.id
JOIN orders o ON oi.order_id = o.id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND o.status_id NOT IN (6) -- Exclude cancelled orders
GROUP BY p.id
ORDER BY total_sold DESC
LIMIT 10;

-- Customer segmentation
SELECT 
    CASE 
        WHEN order_count = 1 THEN 'One-time'
        WHEN order_count BETWEEN 2 AND 5 THEN 'Regular'
        WHEN order_count > 5 THEN 'Loyal'
    END as customer_segment,
    COUNT(*) as customer_count,
    AVG(total_spent) as avg_spent,
    SUM(total_spent) as segment_revenue
FROM (
    SELECT 
        u.id,
        COUNT(o.id) as order_count,
        SUM(o.total_amount) as total_spent
    FROM users u
    JOIN orders o ON u.id = o.user_id
    WHERE o.status_id NOT IN (6) -- Exclude cancelled orders
    GROUP BY u.id
) customer_stats
GROUP BY customer_segment
ORDER BY segment_revenue DESC;

-- =====================================================
-- 8. SEARCH AND FILTERING QUERIES
-- =====================================================

-- Fuzzy search using trigrams
SELECT 
    p.id,
    p.name_ar,
    p.price,
    similarity(p.name_ar, 'دانون') as similarity_score
FROM products p
WHERE p.name_ar % 'دانون' -- Trigram similarity
   OR p.name_fr % 'danone'
   OR p.name_en % 'danone'
ORDER BY similarity_score DESC;

-- Advanced product filtering
SELECT 
    p.id,
    p.name_ar,
    p.price,
    p.compare_price,
    c.name_ar as category_name,
    b.name as brand_name,
    COALESCE(SUM(pi.quantity - pi.reserved_quantity), 0) as available_stock
FROM products p
LEFT JOIN product_categories c ON p.category_id = c.id
LEFT JOIN product_brands b ON p.brand_id = b.id
LEFT JOIN product_inventory pi ON p.id = pi.product_id
WHERE p.status = 'active'
  AND p.category_id IN (4, 5, 6) -- Multiple categories
  AND p.price <= 100.00
  AND (p.requires_age_verification = FALSE OR p.requires_age_verification IS NULL)
  AND EXISTS (
    SELECT 1 FROM product_inventory pi2 
    WHERE pi2.product_id = p.id 
    AND pi2.quantity > pi2.reserved_quantity
  )
GROUP BY p.id, c.id, b.id
HAVING COALESCE(SUM(pi.quantity - pi.reserved_quantity), 0) > 0
ORDER BY p.is_featured DESC, p.price ASC;

-- =====================================================
-- 9. NOTIFICATION QUERIES
-- =====================================================

-- Pending notifications for a user
SELECT 
    nq.id,
    nt.name_ar as notification_type,
    nq.subject,
    nq.content,
    nq.channel,
    nq.status,
    nq.scheduled_at,
    nq.attempts
FROM notification_queue nq
JOIN notification_types nt ON nq.notification_type_id = nt.id
WHERE nq.recipient_id = (SELECT id FROM users WHERE email = 'ahmed.hassan@email.com')
  AND nq.recipient_type = 'user'
  AND nq.status = 'pending'
ORDER BY nq.scheduled_at ASC;

-- Failed notifications requiring retry
SELECT 
    nq.id,
    nq.recipient_address,
    nq.channel,
    nq.content,
    nq.attempts,
    nq.max_attempts,
    nq.error_message,
    nq.failed_at
FROM notification_queue nq
WHERE nq.status = 'failed'
  AND nq.attempts < nq.max_attempts
  AND nq.failed_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'
ORDER BY nq.failed_at ASC;

-- =====================================================
-- 10. PERFORMANCE MONITORING QUERIES
-- =====================================================

-- Database performance metrics
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Slow query analysis
SELECT 
    query_hash,
    COUNT(*) as occurrence_count,
    AVG(execution_time_ms) as avg_execution_time,
    MAX(execution_time_ms) as max_execution_time,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen
FROM slow_query_log
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY query_hash
ORDER BY avg_execution_time DESC;

-- =====================================================
-- MAINTENANCE QUERIES
-- =====================================================

-- Clean up expired guest sessions
DELETE FROM guest_sessions 
WHERE expires_at < CURRENT_TIMESTAMP;

-- Clean up old audit logs (keep last 90 days)
DELETE FROM audit_log 
WHERE created_at < CURRENT_DATE - INTERVAL '90 days';

-- Clean up old page views (keep last 30 days)
DELETE FROM page_views 
WHERE created_at < CURRENT_DATE - INTERVAL '30 days';

-- Update product search vectors (if needed)
UPDATE products 
SET search_keywords = 
    COALESCE(name_ar, '') || ' ' || 
    COALESCE(name_fr, '') || ' ' || 
    COALESCE(name_en, '') || ' ' ||
    COALESCE(description_ar, '') || ' ' ||
    COALESCE(description_fr, '') || ' ' ||
    COALESCE(description_en, '')
WHERE search_keywords IS NULL;