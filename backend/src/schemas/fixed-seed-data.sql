-- ============================================================================
-- FIXED Enhanced Seed Data for GroceryVape Morocco E-commerce Platform
-- Comprehensive product catalog with Morocco-specific items
-- ============================================================================

-- Clear existing data (for development only)
-- TRUNCATE TABLE inventory, product_variants, products, categories, users CASCADE;

-- ============================================================================
-- ENHANCED CATEGORIES - Morocco Specific
-- ============================================================================

-- Main categories
INSERT INTO categories (id, name_ar, name_fr, name_en, description_ar, description_fr, description_en, is_vape_category, age_restricted, is_active, is_featured, sort_order, image_url) VALUES
(uuid_generate_v4(), 'البقالة المغربية', 'Épicerie Marocaine', 'Moroccan Groceries', 'منتجات البقالة التقليدية المغربية', 'Produits d''épicerie traditionnels marocains', 'Traditional Moroccan grocery products', false, false, true, true, 1, 'https://example.com/categories/groceries.jpg'),
(uuid_generate_v4(), 'السيجارة الإلكترونية', 'Vapotage', 'Vape Products', 'منتجات السيجارة الإلكترونية عالية الجودة', 'Produits de vapotage de haute qualité', 'High-quality vape products', true, true, true, true, 2, 'https://example.com/categories/vape.jpg'),
(uuid_generate_v4(), 'المشروبات المغربية', 'Boissons Marocaines', 'Moroccan Beverages', 'المشروبات التقليدية والحديثة', 'Boissons traditionnelles et modernes', 'Traditional and modern beverages', false, false, true, true, 3, 'https://example.com/categories/beverages.jpg'),
(uuid_generate_v4(), 'الوجبات الخفيفة', 'Snacks & Confiseries', 'Snacks & Sweets', 'الوجبات الخفيفة والحلويات المغربية', 'Collations et confiseries marocaines', 'Moroccan snacks and sweets', false, false, true, true, 4, 'https://example.com/categories/snacks.jpg'),
(uuid_generate_v4(), 'منتجات الألبان', 'Produits Laitiers', 'Dairy Products', 'منتجات الألبان الطازجة', 'Produits laitiers frais', 'Fresh dairy products', false, false, true, true, 5, 'https://example.com/categories/dairy.jpg'),
(uuid_generate_v4(), 'الخبز والمعجنات', 'Pain & Pâtisseries', 'Bread & Bakery', 'الخبز والمعجنات المغربية', 'Pain et pâtisseries marocaines', 'Moroccan bread and pastries', false, false, true, true, 6, 'https://example.com/categories/bakery.jpg'),
(uuid_generate_v4(), 'البهارات والتوابل', 'Épices & Condiments', 'Spices & Condiments', 'البهارات والتوابل المغربية الأصيلة', 'Épices et condiments marocains authentiques', 'Authentic Moroccan spices and condiments', false, false, true, true, 7, 'https://example.com/categories/spices.jpg'),
(uuid_generate_v4(), 'الشاي والقهوة', 'Thé & Café', 'Tea & Coffee', 'الشاي الأتاي والقهوة المغربية', 'Thé Atay et café marocain', 'Moroccan Atay tea and coffee', false, false, true, true, 8, 'https://example.com/categories/tea-coffee.jpg')
;

-- Vape sub-categories
INSERT INTO categories (id, name_ar, name_fr, name_en, description_ar, parent_id, is_vape_category, age_restricted, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'السوائل الإلكترونية', 'E-liquides', 'E-Liquids', 'سوائل إلكترونية بنكهات متنوعة', c.id, true, true, true, 1
FROM categories c WHERE c.name_en = 'Vape Products' LIMIT 1
;

INSERT INTO categories (id, name_ar, name_fr, name_en, description_ar, parent_id, is_vape_category, age_restricted, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'الأجهزة المحمولة', 'Appareils Portables', 'Portable Devices', 'أجهزة فيب محمولة وسهلة الاستخدام', c.id, true, true, true, 2
FROM categories c WHERE c.name_en = 'Vape Products' LIMIT 1
;

INSERT INTO categories (id, name_ar, name_fr, name_en, description_ar, parent_id, is_vape_category, age_restricted, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'الأجهزة المتقدمة', 'Mods Avancés', 'Advanced Mods', 'أجهزة فيب متقدمة للمحترفين', c.id, true, true, true, 3
FROM categories c WHERE c.name_en = 'Vape Products' LIMIT 1
;

INSERT INTO categories (id, name_ar, name_fr, name_en, description_ar, parent_id, is_vape_category, age_restricted, is_active, sort_order)
SELECT 
    uuid_generate_v4(), 'الإكسسوارات', 'Accessoires', 'Accessories', 'إكسسوارات أجهزة الفيب', c.id, true, true, true, 4
FROM categories c WHERE c.name_en = 'Vape Products' LIMIT 1
;

-- ============================================================================
-- ENHANCED PRODUCTS - Morocco Specific
-- ============================================================================

-- DAIRY PRODUCTS
INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, description_fr, description_en, sku, brand, base_price, cost_price, is_active, is_featured, image_urls, meta_title_ar) VALUES
-- Milk Products
(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Dairy Products' LIMIT 1), 'حليب أطلس كامل الدسم', 'Lait Atlas Entier', 'Atlas Whole Milk', 'حليب طازج كامل الدسم من مراعي أطلس المغربية، غني بالكالسيوم والبروتين', 'Lait frais entier des fermes Atlas du Maroc, riche en calcium et protéines', 'Fresh whole milk from Atlas farms of Morocco, rich in calcium and protein', 'MILK-ATLAS-WHOLE-001', 'أطلس', 8.50, 5.10, true, true, '{"https://example.com/products/milk-atlas-whole.jpg", "https://example.com/products/milk-atlas-whole-2.jpg"}', 'حليب أطلس كامل الدسم طازج'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Dairy Products' LIMIT 1), 'حليب جيهة قليل الدسم', 'Lait Jiha Demi-Écrémé', 'Jiha Semi-Skimmed Milk', 'حليب جيهة قليل الدسم، مثالي للحمية الصحية', 'Lait Jiha demi-écrémé, idéal pour une alimentation saine', 'Jiha semi-skimmed milk, ideal for healthy diet', 'MILK-JIHA-SEMI-001', 'جيهة', 7.80, 4.70, true, false, '{"https://example.com/products/milk-jiha-semi.jpg"}', 'حليب جيهة قليل الدسم'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Dairy Products' LIMIT 1), 'زبادي الأطلس طبيعي', 'Yaourt Atlas Nature', 'Atlas Natural Yogurt', 'زبادي طبيعي بدون إضافات، غني بالبروبيوتيك', 'Yaourt naturel sans additifs, riche en probiotiques', 'Natural yogurt without additives, rich in probiotics', 'YOGURT-ATLAS-NATURAL-001', 'أطلس', 4.50, 2.70, true, true, '{"https://example.com/products/yogurt-atlas-natural.jpg"}', 'زبادي الأطلس طبيعي'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Dairy Products' LIMIT 1), 'جبنة البقرة الضاحكة', 'Fromage La Vache Qui Rit', 'Laughing Cow Cheese', 'جبنة البقرة الضاحكة الكريمية', 'Fromage crémeux La Vache Qui Rit', 'Creamy Laughing Cow cheese', 'CHEESE-LAUGHING-COW-001', 'البقرة الضاحكة', 12.00, 7.20, true, true, '{"https://example.com/products/laughing-cow-cheese.jpg"}', 'جبنة البقرة الضاحكة'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Dairy Products' LIMIT 1), 'زبدة الأطلس', 'Beurre Atlas', 'Atlas Butter', 'زبدة طبيعية من كريمة الحليب الطازج', 'Beurre naturel de crème de lait frais', 'Natural butter from fresh milk cream', 'BUTTER-ATLAS-001', 'أطلس', 15.00, 9.00, true, false, '{"https://example.com/products/butter-atlas.jpg"}', 'زبدة الأطلس الطبيعية')
;

-- MOROCCAN BEVERAGES
INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, description_fr, description_en, sku, brand, base_price, cost_price, is_active, is_featured, image_urls, meta_title_ar) VALUES
-- Traditional Moroccan Beverages
(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Moroccan Beverages' LIMIT 1), 'شاي أتاي المغربي', 'Thé Atay Marocain', 'Moroccan Atay Tea', 'شاي أتاي مغربي أصيل، مزيج من الشاي الأخضر والنعناع', 'Thé Atay marocain authentique, mélange de thé vert et menthe', 'Authentic Moroccan Atay tea, blend of green tea and mint', 'TEA-ATAY-MOROCCAN-001', 'أتاي المغرب', 25.00, 15.00, true, true, '{"https://example.com/products/atay-tea.jpg", "https://example.com/products/atay-tea-2.jpg"}', 'شاي أتاي المغربي الأصيل'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Moroccan Beverages' LIMIT 1), 'عصير البرتقال سيدي علي', 'Jus d''Orange Sidi Ali', 'Sidi Ali Orange Juice', 'عصير البرتقال الطبيعي من سيدي علي', 'Jus d''orange naturel de Sidi Ali', 'Natural orange juice from Sidi Ali', 'JUICE-SIDI-ALI-ORANGE-001', 'سيدي علي', 8.00, 4.80, true, true, '{"https://example.com/products/sidi-ali-orange.jpg"}', 'عصير البرتقال سيدي علي'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Moroccan Beverages' LIMIT 1), 'مياه أولماس', 'Eau Oulmes', 'Oulmes Water', 'مياه أولماس الطبيعية الغازية', 'Eau naturelle pétillante d''Oulmes', 'Oulmes natural sparkling water', 'WATER-OULMES-001', 'أولماس', 6.00, 3.60, true, true, '{"https://example.com/products/oulmes-water.jpg"}', 'مياه أولماس الطبيعية'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Moroccan Beverages' LIMIT 1), 'كوكا كولا المغرب', 'Coca-Cola Maroc', 'Coca-Cola Morocco', 'كوكا كولا المنتجة في المغرب', 'Coca-Cola produite au Maroc', 'Coca-Cola produced in Morocco', 'COLA-COCA-MOROCCO-001', 'كوكا كولا', 6.00, 3.60, true, true, '{"https://example.com/products/coca-cola-morocco.jpg"}', 'كوكا كولا المغرب'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Moroccan Beverages' LIMIT 1), 'عصير الليمون الحامض', 'Jus de Citron', 'Lemon Juice', 'عصير الليمون الحامض الطبيعي', 'Jus de citron naturel', 'Natural lemon juice', 'JUICE-LEMON-001', 'عصائر المغرب', 7.50, 4.50, true, false, '{"https://example.com/products/lemon-juice.jpg"}', 'عصير الليمون الحامض')
;

-- VAPE PRODUCTS
INSERT INTO products (id, category_id, name_ar, name_fr, name_en, description_ar, description_fr, description_en, sku, brand, base_price, cost_price, is_vape_product, age_restricted, is_active, is_featured, image_urls, meta_title_ar) VALUES
-- E-Liquids
(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'E-Liquids' LIMIT 1), 'سائل إلكتروني بنكهة المانجو', 'E-liquide Saveur Mangue', 'Mango E-Liquid', 'سائل إلكتروني بنكهة المانجو الطبيعية، متوفر بتراكيز نيكوتين مختلفة', 'E-liquide saveur mangue naturelle, disponible en différentes concentrations de nicotine', 'Natural mango flavored e-liquid, available in different nicotine concentrations', 'ELIQUID-MANGO-001', 'VapeMorocco', 40.00, 24.00, true, true, true, true, '{"https://example.com/products/eliquid-mango.jpg"}', 'سائل إلكتروني بنكهة المانجو'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'E-Liquids' LIMIT 1), 'سائل إلكتروني بنكهة النعناع', 'E-liquide Saveur Menthe', 'Mint E-Liquid', 'سائل إلكتروني بنكهة النعناع المنعشة', 'E-liquide saveur menthe rafraîchissante', 'Refreshing mint flavored e-liquid', 'ELIQUID-MINT-001', 'VapeMorocco', 40.00, 24.00, true, true, true, true, '{"https://example.com/products/eliquid-mint.jpg"}', 'سائل إلكتروني بنكهة النعناع'),

-- Vape Devices
(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Portable Devices' LIMIT 1), 'جهاز فيب بود صغير', 'Pod Vape Compact', 'Compact Pod Vape', 'جهاز فيب صغير وسهل الاستخدام، مثالي للمبتدئين', 'Dispositif vape compact et facile à utiliser, idéal pour les débutants', 'Compact and easy-to-use vape device, ideal for beginners', 'POD-COMPACT-001', 'TechVape', 120.00, 72.00, true, true, true, true, '{"https://example.com/products/pod-compact.jpg"}', 'جهاز فيب بود صغير'),

(uuid_generate_v4(), (SELECT id FROM categories WHERE name_en = 'Advanced Mods' LIMIT 1), 'جهاز مود متقدم', 'Mod Avancé', 'Advanced Mod', 'جهاز مود متقدم للمحترفين مع تحكم دقيق في الطاقة', 'Mod avancé pour professionnels avec contrôle précis de la puissance', 'Advanced mod for professionals with precise power control', 'MOD-ADVANCED-001', 'ProVape', 250.00, 150.00, true, true, true, true, '{"https://example.com/products/mod-advanced.jpg"}', 'جهاز مود متقدم')
;

-- ============================================================================
-- PRODUCT VARIANTS
-- ============================================================================

-- Milk variants
INSERT INTO product_variants (id, product_id, variant_name_ar, variant_name_fr, variant_name_en, sku, attributes, price, cost_price, is_default, is_active, sort_order) VALUES
-- Atlas Whole Milk variants
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'MILK-ATLAS-WHOLE-001' LIMIT 1), '1 لتر', '1 Litre', '1 Liter', 'MILK-ATLAS-WHOLE-001-1L', '{"size": "1L", "size_ar": "1 لتر", "volume_ml": 1000}', 8.50, 5.10, true, true, 1),
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'MILK-ATLAS-WHOLE-001' LIMIT 1), '500 مل', '500ml', '500ml', 'MILK-ATLAS-WHOLE-001-500ML', '{"size": "500ml", "size_ar": "500 مل", "volume_ml": 500}', 5.00, 3.00, false, true, 2),

-- E-Liquid variants
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'ELIQUID-MANGO-001' LIMIT 1), 'مانجو - بدون نيكوتين', 'Mangue - 0mg', 'Mango - 0mg Nicotine', 'ELIQUID-MANGO-001-0MG', '{"flavor": "mango", "volume": "30ml", "nicotine": "0mg", "flavor_ar": "مانجو"}', 40.00, 24.00, true, true, 1),
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'ELIQUID-MANGO-001' LIMIT 1), 'مانجو - 6 ملغ نيكوتين', 'Mangue - 6mg', 'Mango - 6mg Nicotine', 'ELIQUID-MANGO-001-6MG', '{"flavor": "mango", "volume": "30ml", "nicotine": "6mg", "flavor_ar": "مانجو"}', 45.00, 27.00, false, true, 2),
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'ELIQUID-MANGO-001' LIMIT 1), 'مانجو - 12 ملغ نيكوتين', 'Mangue - 12mg', 'Mango - 12mg Nicotine', 'ELIQUID-MANGO-001-12MG', '{"flavor": "mango", "volume": "30ml", "nicotine": "12mg", "flavor_ar": "مانجو"}', 50.00, 30.00, false, true, 3),

-- Pod device variants
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'POD-COMPACT-001' LIMIT 1), 'أسود', 'Noir', 'Black', 'POD-COMPACT-001-BLACK', '{"color": "black", "color_ar": "أسود", "battery": "850mAh"}', 120.00, 72.00, true, true, 1),
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'POD-COMPACT-001' LIMIT 1), 'أزرق', 'Bleu', 'Blue', 'POD-COMPACT-001-BLUE', '{"color": "blue", "color_ar": "أزرق", "battery": "850mAh"}', 120.00, 72.00, false, true, 2),
(uuid_generate_v4(), (SELECT id FROM products WHERE sku = 'POD-COMPACT-001' LIMIT 1), 'أحمر', 'Rouge', 'Red', 'POD-COMPACT-001-RED', '{"color": "red", "color_ar": "أحمر", "battery": "850mAh"}', 120.00, 72.00, false, true, 3)
;

-- ============================================================================
-- INVENTORY
-- ============================================================================

-- Set inventory for all product variants
INSERT INTO inventory (product_variant_id, stock_quantity, low_stock_threshold, reorder_point, unit_cost)
SELECT 
    pv.id,
    CASE 
        WHEN pv.sku LIKE '%MILK%' THEN 100
        WHEN pv.sku LIKE '%ELIQUID%' THEN 50
        WHEN pv.sku LIKE '%POD%' THEN 25
        WHEN pv.sku LIKE '%MOD%' THEN 15
        ELSE 75
    END as stock_quantity,
    CASE 
        WHEN pv.sku LIKE '%MILK%' THEN 20
        WHEN pv.sku LIKE '%ELIQUID%' THEN 10
        WHEN pv.sku LIKE '%POD%' THEN 5
        WHEN pv.sku LIKE '%MOD%' THEN 3
        ELSE 15
    END as low_stock_threshold,
    5 as reorder_point,
    pv.cost_price as unit_cost
FROM product_variants pv
WHERE NOT EXISTS (
    SELECT 1 FROM inventory i WHERE i.product_variant_id = pv.id
);

-- ============================================================================
-- SAMPLE USERS (avoid duplicates)
-- ============================================================================

INSERT INTO users (id, phone, email, name, role, preferred_language, is_guest, age_verified, birth_date) VALUES
(uuid_generate_v4(), '+212661234568', 'hassan.ahmed@gmail.com', 'حسن أحمد', 'customer', 'ar', false, true, '1990-05-15'),
(uuid_generate_v4(), '+212662345679', 'zahra.fatima@gmail.com', 'زهراء فاطمة', 'customer', 'ar', false, false, '2005-03-20'),
(uuid_generate_v4(), '+212663456780', 'alami.mohamed@gmail.com', 'العلمي محمد', 'customer', 'fr', false, true, '1985-12-10'),
(uuid_generate_v4(), '+212664567891', NULL, 'ضيف جديد', 'customer', 'ar', true, false, NULL)
;

-- Sample admin user
INSERT INTO users (id, phone, email, name, role, preferred_language, is_guest, password_hash) VALUES
(uuid_generate_v4(), '+212661000002', 'admin2@groceryvape.ma', 'مدير النظام الثاني', 'admin', 'ar', false, '$2b$10$example_hash_here')
;

-- ============================================================================
-- SAMPLE ADDRESSES (fix coordinate type)
-- ============================================================================

INSERT INTO user_addresses (user_id, label, address_line, neighborhood, city, region, postal_code, landmark, coordinates, is_default)
SELECT 
    u.id,
    'المنزل',
    'شارع محمد الخامس، رقم 125',
    'الحي المحمدي',
    'الدار البيضاء',
    'الدار البيضاء-سطات',
    '20250',
    'بجانب مسجد الحسن الثاني',
    '(-7.6114, 33.5731)',
    true
FROM users u WHERE u.email = 'hassan.ahmed@gmail.com'
;

INSERT INTO user_addresses (user_id, label, address_line, neighborhood, city, region, postal_code, landmark, coordinates, is_default)
SELECT 
    u.id,
    'العمل',
    'شارع الاستقلال، رقم 89',
    'المعاريف',
    'الدار البيضاء',
    'الدار البيضاء-سطات',
    '20100',
    'بجانب البنك الشعبي',
    '(-7.6186, 33.5892)',
    false
FROM users u WHERE u.email = 'alami.mohamed@gmail.com'
;

-- ============================================================================
-- DELIVERY ZONES (avoid duplicates)
-- ============================================================================

INSERT INTO delivery_zones (name_ar, name_fr, name_en, boundary, delivery_fee, free_delivery_threshold, cod_available, min_delivery_hours, max_delivery_hours) VALUES
('وسط الدار البيضاء الجديد', 'Centre de Casablanca Nouveau', 'New Casablanca Center', 
 ST_GeomFromText('POLYGON((-7.65 33.58, -7.55 33.58, -7.55 33.62, -7.65 33.62, -7.65 33.58))', 4326),
 15.00, 200.00, true, 1, 3),
 
('عين الشق الجديد', 'Ain Chock Nouveau', 'New Ain Chock',
 ST_GeomFromText('POLYGON((-7.55 33.58, -7.50 33.58, -7.50 33.62, -7.55 33.62, -7.55 33.58))', 4326),
 20.00, 250.00, true, 2, 4),
 
('سيدي مومن الجديد', 'Sidi Moumen Nouveau', 'New Sidi Moumen',
 ST_GeomFromText('POLYGON((-7.50 33.55, -7.45 33.55, -7.45 33.60, -7.50 33.60, -7.50 33.55))', 4326),
 25.00, 300.00, true, 2, 5),

('الحي الحسني', 'Hay Hassani', 'Hay Hassani',
 ST_GeomFromText('POLYGON((-7.70 33.56, -7.65 33.56, -7.65 33.60, -7.70 33.60, -7.70 33.56))', 4326),
 18.00, 220.00, true, 1, 4),

('سباتة', 'Sbata', 'Sbata',
 ST_GeomFromText('POLYGON((-7.60 33.54, -7.55 33.54, -7.55 33.58, -7.60 33.58, -7.60 33.54))', 4326),
 30.00, 350.00, true, 3, 6)
;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

-- Show counts of inserted data
SELECT 
    'Categories' as table_name, 
    COUNT(*) as count 
FROM categories WHERE is_active = true
UNION ALL
SELECT 
    'Products' as table_name, 
    COUNT(*) as count 
FROM products WHERE is_active = true
UNION ALL
SELECT 
    'Product Variants' as table_name, 
    COUNT(*) as count 
FROM product_variants WHERE is_active = true
UNION ALL
SELECT 
    'Inventory Records' as table_name, 
    COUNT(*) as count 
FROM inventory
UNION ALL
SELECT 
    'Vape Products' as table_name, 
    COUNT(*) as count 
FROM products WHERE is_vape_product = true
UNION ALL
SELECT 
    'Users' as table_name, 
    COUNT(*) as count 
FROM users WHERE is_active = true
UNION ALL
SELECT 
    'Delivery Zones' as table_name, 
    COUNT(*) as count 
FROM delivery_zones WHERE is_active = true;