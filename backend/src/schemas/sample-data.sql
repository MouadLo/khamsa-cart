-- ============================================================================
-- Sample Data for GroceryVape Morocco E-commerce Platform
-- This file provides realistic sample data for testing and development
-- ============================================================================

-- Clear existing data (for development only)
-- TRUNCATE TABLE users, categories, products, product_variants, inventory CASCADE;

-- ============================================================================
-- SAMPLE USERS
-- ============================================================================

-- Sample customers
INSERT INTO users (id, phone, email, name, role, preferred_language, is_guest, age_verified, birth_date) VALUES
(uuid_generate_v4(), '+212661234567', 'ahmed.hassan@gmail.com', 'أحمد حسن', 'customer', 'ar', false, true, '1990-05-15'),
(uuid_generate_v4(), '+212662345678', 'fatima.zahra@gmail.com', 'فاطمة الزهراء', 'customer', 'ar', false, false, '2005-03-20'),
(uuid_generate_v4(), '+212663456789', 'mohamed.alami@gmail.com', 'محمد العلمي', 'customer', 'fr', false, true, '1985-12-10'),
(uuid_generate_v4(), '+212664567890', NULL, 'ضيف مؤقت', 'customer', 'ar', true, false, NULL);

-- Sample admin user
INSERT INTO users (id, phone, email, name, role, preferred_language, is_guest, password_hash) VALUES
(uuid_generate_v4(), '+212661000001', 'admin@groceryvape.ma', 'مدير النظام', 'admin', 'ar', false, '$2b$10$example_hash_here');

-- Sample driver
INSERT INTO users (id, phone, email, name, role, preferred_language, is_guest, age_verified, birth_date) VALUES
(uuid_generate_v4(), '+212665000001', 'driver1@groceryvape.ma', 'عبد الرحمن السائق', 'driver', 'ar', false, true, '1988-07-22');

-- ============================================================================
-- SAMPLE ADDRESSES
-- ============================================================================

INSERT INTO user_addresses (user_id, label, address_line, neighborhood, city, region, postal_code, landmark, coordinates, is_default)
SELECT 
    u.id,
    'المنزل',
    'شارع محمد الخامس، رقم 123',
    'الحي المحمدي',
    'الدار البيضاء',
    'الدار البيضاء-سطات',
    '20250',
    'بجانب مسجد الحسن الثاني',
    ST_Point(-7.6114, 33.5731),
    true
FROM users u WHERE u.email = 'ahmed.hassan@gmail.com';

-- ============================================================================
-- SAMPLE CATEGORIES
-- ============================================================================

-- Main categories
INSERT INTO categories (id, name_ar, name_fr, name_en, description_ar, is_vape_category, is_active, sort_order) VALUES
(uuid_generate_v4(), 'البقالة', 'Épicerie', 'Groceries', 'منتجات البقالة والمواد الغذائية', false, true, 1),
(uuid_generate_v4(), 'السيجارة الإلكترونية', 'Vapotage', 'Vape Products', 'منتجات السيجارة الإلكترونية', true, true, 2),
(uuid_generate_v4(), 'المشروبات', 'Boissons', 'Beverages', 'المشروبات المختلفة', false, true, 3),
(uuid_generate_v4(), 'الوجبات الخفيفة', 'Snacks', 'Snacks', 'الوجبات الخفيفة والحلويات', false, true, 4);

-- Sub-categories for groceries
INSERT INTO categories (id, name_ar, name_fr, name_en, parent_id, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'الألبان', 'Produits laitiers', 'Dairy Products', c.id, true, 1
FROM categories c WHERE c.name_en = 'Groceries';

INSERT INTO categories (id, name_ar, name_fr, name_en, parent_id, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'الخبز والمعجنات', 'Pain et pâtisseries', 'Bread & Bakery', c.id, true, 2
FROM categories c WHERE c.name_en = 'Groceries';

-- Sub-categories for vape
INSERT INTO categories (id, name_ar, name_fr, name_en, parent_id, is_vape_category, age_restricted, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'السوائل الإلكترونية', 'E-liquides', 'E-Liquids', c.id, true, true, true, 1
FROM categories c WHERE c.name_en = 'Vape Products';

INSERT INTO categories (id, name_ar, name_fr, name_en, parent_id, is_vape_category, age_restricted, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'الأجهزة', 'Appareils', 'Devices', c.id, true, true, true, 2
FROM categories c WHERE c.name_en = 'Vape Products';

-- ============================================================================
-- SAMPLE PRODUCTS
-- ============================================================================

-- Grocery products
INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, description_fr, description_en, sku, brand, base_price, is_active, is_featured)
SELECT 
    uuid_generate_v4(),
    c.id,
    'حليب أطلس كامل الدسم',
    'Lait Atlas entier',
    'Atlas Whole Milk',
    'حليب طازج كامل الدسم من مراعي أطلس المغربية',
    'Lait frais entier des fermes Atlas du Maroc',
    'Fresh whole milk from Atlas farms of Morocco',
    'MILK-ATLAS-001',
    'Atlas',
    8.50,
    true,
    true
FROM categories c 
JOIN categories parent ON c.parent_id = parent.id 
WHERE c.name_en = 'Dairy Products';

INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, sku, brand, base_price, is_active)
SELECT 
    uuid_generate_v4(),
    c.id,
    'خبز أبيض طازج',
    'Pain blanc frais',
    'Fresh White Bread',
    'خبز أبيض طازج مخبوز يومياً',
    'BREAD-WHITE-001',
    'مخبزة المغرب',
    4.00,
    true
FROM categories c 
JOIN categories parent ON c.parent_id = parent.id 
WHERE c.name_en = 'Bread & Bakery';

-- Vape products (age restricted)
INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, sku, brand, base_price, is_vape_product, age_restricted, is_active)
SELECT 
    uuid_generate_v4(),
    c.id,
    'سائل إلكتروني بنكهة المانجو',
    'E-liquide saveur mangue',
    'Mango Flavored E-Liquid',
    'سائل إلكتروني بنكهة المانجو الطبيعية، متوفر بتراكيز نيكوتين مختلفة',
    'ELIQ-MANGO-001',
    'VapeMorocco',
    45.00,
    true,
    true,
    true
FROM categories c 
JOIN categories parent ON c.parent_id = parent.id 
WHERE c.name_en = 'E-Liquids';

INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, sku, brand, base_price, is_vape_product, age_restricted, is_active, is_featured)
SELECT 
    uuid_generate_v4(),
    c.id,
    'جهاز فيب بود صغير',
    'Pod Vape compact',
    'Compact Pod Vape Device',
    'جهاز فيب صغير وسهل الاستخدام، مثالي للمبتدئين',
    'POD-COMPACT-001',
    'TechVape',
    120.00,
    true,
    true,
    true,
    true
FROM categories c 
JOIN categories parent ON c.parent_id = parent.id 
WHERE c.name_en = 'Devices';

-- Beverages
INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, sku, brand, base_price, is_active)
SELECT 
    uuid_generate_v4(),
    c.id,
    'كوكا كولا',
    'Coca-Cola',
    'Coca-Cola',
    'مشروب غازي منعش بنكهة الكولا الأصلية',
    'COLA-COCA-001',
    'Coca-Cola',
    6.00,
    true
FROM categories c WHERE c.name_en = 'Beverages';

-- ============================================================================
-- SAMPLE PRODUCT VARIANTS
-- ============================================================================

-- Milk variants (different sizes)
INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_default, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    '1 لتر',
    '1 litre',
    '1 Liter',
    'MILK-ATLAS-001-1L',
    '{"size": "1L", "size_ar": "1 لتر"}',
    8.50,
    true,
    true
FROM products p WHERE p.sku = 'MILK-ATLAS-001';

INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    '500 مل',
    '500ml',
    '500ml',
    'MILK-ATLAS-001-500ML',
    '{"size": "500ml", "size_ar": "500 مل"}',
    5.00,
    true
FROM products p WHERE p.sku = 'MILK-ATLAS-001';

-- E-liquid variants (different nicotine strengths)
INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_default, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    'مانجو - 6 ملغ نيكوتين',
    'Mangue - 6mg nicotine',
    'Mango - 6mg Nicotine',
    'ELIQ-MANGO-001-6MG',
    '{"flavor": "mango", "flavor_ar": "مانجو", "nicotine": "6mg", "volume": "30ml"}',
    45.00,
    true,
    true
FROM products p WHERE p.sku = 'ELIQ-MANGO-001';

INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    'مانجو - 12 ملغ نيكوتين',
    'Mangue - 12mg nicotine',
    'Mango - 12mg Nicotine',
    'ELIQ-MANGO-001-12MG',
    '{"flavor": "mango", "flavor_ar": "مانجو", "nicotine": "12mg", "volume": "30ml"}',
    45.00,
    true
FROM products p WHERE p.sku = 'ELIQ-MANGO-001';

INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    'مانجو - بدون نيكوتين',
    'Mangue - sans nicotine',
    'Mango - 0mg Nicotine',
    'ELIQ-MANGO-001-0MG',
    '{"flavor": "mango", "flavor_ar": "مانجو", "nicotine": "0mg", "volume": "30ml"}',
    40.00,
    true
FROM products p WHERE p.sku = 'ELIQ-MANGO-001';

-- Pod device variants (different colors)
INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_default, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    'أسود',
    'Noir',
    'Black',
    'POD-COMPACT-001-BLACK',
    '{"color": "black", "color_ar": "أسود", "battery": "850mAh"}',
    120.00,
    true,
    true
FROM products p WHERE p.sku = 'POD-COMPACT-001';

INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    'أزرق',
    'Bleu',
    'Blue',
    'POD-COMPACT-001-BLUE',
    '{"color": "blue", "color_ar": "أزرق", "battery": "850mAh"}',
    120.00,
    true
FROM products p WHERE p.sku = 'POD-COMPACT-001';

-- Bread variant (single variant)
INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_default, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    'خبز عادي',
    'Pain standard',
    'Standard Bread',
    'BREAD-WHITE-001-STD',
    '{"type": "standard", "weight": "400g"}',
    4.00,
    true,
    true
FROM products p WHERE p.sku = 'BREAD-WHITE-001';

-- Coca-Cola variants (different sizes)
INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_default, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    '330 مل',
    '330ml',
    '330ml Can',
    'COLA-COCA-001-330ML',
    '{"size": "330ml", "size_ar": "330 مل", "type": "can"}',
    6.00,
    true,
    true
FROM products p WHERE p.sku = 'COLA-COCA-001';

INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, is_active)
SELECT 
    uuid_generate_v4(),
    p.id,
    '1.5 لتر',
    '1.5 litre',
    '1.5 Liter Bottle',
    'COLA-COCA-001-1.5L',
    '{"size": "1.5L", "size_ar": "1.5 لتر", "type": "bottle"}',
    12.00,
    true
FROM products p WHERE p.sku = 'COLA-COCA-001';

-- ============================================================================
-- SAMPLE INVENTORY
-- ============================================================================

-- Set inventory for all product variants
INSERT INTO inventory (product_variant_id, stock_quantity, low_stock_threshold, reorder_point, unit_cost)
SELECT 
    pv.id,
    CASE 
        WHEN pv.sku LIKE '%MILK%' THEN 50
        WHEN pv.sku LIKE '%BREAD%' THEN 20
        WHEN pv.sku LIKE '%ELIQ%' THEN 30
        WHEN pv.sku LIKE '%POD%' THEN 15
        WHEN pv.sku LIKE '%COLA%' THEN 100
        ELSE 25
    END as stock_quantity,
    CASE 
        WHEN pv.sku LIKE '%MILK%' THEN 10
        WHEN pv.sku LIKE '%BREAD%' THEN 5
        ELSE 8
    END as low_stock_threshold,
    5 as reorder_point,
    pv.price * 0.6 as unit_cost  -- 60% of selling price as cost
FROM product_variants pv;

-- ============================================================================
-- SAMPLE DELIVERY ZONES
-- ============================================================================

-- Casablanca delivery zones
INSERT INTO delivery_zones (name_ar, name_fr, name_en, boundary, delivery_fee, free_delivery_threshold, cod_available, min_delivery_hours, max_delivery_hours) VALUES
('وسط الدار البيضاء', 'Centre de Casablanca', 'Casablanca Center', 
 ST_GeomFromText('POLYGON((-7.65 33.58, -7.55 33.58, -7.55 33.62, -7.65 33.62, -7.65 33.58))', 4326),
 15.00, 200.00, true, 1, 3),
 
('عين الشق', 'Ain Chock', 'Ain Chock',
 ST_GeomFromText('POLYGON((-7.55 33.58, -7.50 33.58, -7.50 33.62, -7.55 33.62, -7.55 33.58))', 4326),
 20.00, 250.00, true, 2, 4),
 
('سيدي مومن', 'Sidi Moumen', 'Sidi Moumen',
 ST_GeomFromText('POLYGON((-7.50 33.55, -7.45 33.55, -7.45 33.60, -7.50 33.60, -7.50 33.55))', 4326),
 25.00, 300.00, true, 2, 5);

-- ============================================================================
-- SAMPLE ORDERS
-- ============================================================================

-- Sample order with COD
INSERT INTO orders (id, customer_id, status, payment_method, cod_amount, subtotal, delivery_fee, total_amount, delivery_address, delivery_notes, age_verification_required)
SELECT 
    uuid_generate_v4(),
    u.id,
    'confirmed',
    'cod',
    58.50,
    53.50,
    5.00,
    58.50,
    '{"street": "شارع محمد الخامس، رقم 123", "city": "الدار البيضاء", "phone": "+212661234567", "landmark": "بجانب مسجد الحسن الثاني"}',
    'الطابق الثالث، الشقة رقم 5',
    false
FROM users u WHERE u.email = 'ahmed.hassan@gmail.com';

-- Sample order items
INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, total_price, product_name_ar, variant_name_ar, product_sku)
SELECT 
    o.id,
    pv.id,
    2,
    pv.price,
    pv.price * 2,
    p.name_ar,
    pv.variant_name_ar,
    p.sku
FROM orders o
CROSS JOIN product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE pv.sku = 'MILK-ATLAS-001-1L'
AND o.status = 'confirmed'
LIMIT 1;

INSERT INTO order_items (order_id, product_variant_id, quantity, unit_price, total_price, product_name_ar, variant_name_ar, product_sku)
SELECT 
    o.id,
    pv.id,
    1,
    pv.price,
    pv.price,
    p.name_ar,
    pv.variant_name_ar,
    p.sku
FROM orders o
CROSS JOIN product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE pv.sku = 'BREAD-WHITE-001-STD'
AND o.status = 'confirmed'
LIMIT 1;

-- ============================================================================
-- SAMPLE REVIEWS
-- ============================================================================

-- Product review
INSERT INTO product_reviews (product_id, customer_id, rating, title_ar, review_text_ar, is_verified_purchase, is_approved)
SELECT 
    p.id,
    u.id,
    5,
    'منتج ممتاز',
    'حليب طازج وذو جودة عالية، أنصح به بشدة',
    true,
    true
FROM products p, users u 
WHERE p.sku = 'MILK-ATLAS-001' 
AND u.email = 'ahmed.hassan@gmail.com';

-- ============================================================================
-- USEFUL QUERIES FOR TESTING
-- ============================================================================

-- View products with variants and inventory
/*
SELECT 
    p.name_ar as product_name,
    pv.variant_name_ar as variant_name,
    pv.price,
    i.stock_quantity,
    i.available_quantity
FROM products p
JOIN product_variants pv ON p.id = pv.product_id
JOIN inventory i ON pv.id = i.product_variant_id
WHERE p.is_active = true
ORDER BY p.name_ar, pv.variant_name_ar;
*/

-- View low stock items
/*
SELECT 
    p.name_ar as product_name,
    pv.variant_name_ar as variant_name,
    i.available_quantity,
    i.low_stock_threshold
FROM products p
JOIN product_variants pv ON p.id = pv.product_id
JOIN inventory i ON pv.id = i.product_variant_id
WHERE i.available_quantity <= i.low_stock_threshold;
*/

-- View orders with items
/*
SELECT 
    o.order_number,
    u.name as customer_name,
    o.status,
    o.total_amount,
    oi.product_name_ar,
    oi.quantity,
    oi.unit_price
FROM orders o
JOIN users u ON o.customer_id = u.id
JOIN order_items oi ON o.id = oi.order_id
ORDER BY o.created_at DESC;
*/