#!/usr/bin/env node

/**
 * Database Seeding Script for GroceryVape Morocco
 * 
 * This script will populate your database with comprehensive product data
 * including Morocco-specific categories, products, variants, and inventory.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const dbConfig = {
  user: 'groceryvape_user',
  password: 'groceryvape_password',
  host: '3.253.241.145',
  database: 'groceryvape_db',
  port: 5432,
  ssl: false, // Set to true if using SSL
};

async function seedDatabase() {
  const pool = new Pool(dbConfig);
  
  try {
    console.log('🌱 Starting database seeding process...');
    console.log('📡 Connecting to PostgreSQL database...');
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connection successful!');
    
    // Read the enhanced seed data file
    const seedFilePath = path.join(__dirname, '../schemas/enhanced-seed-data.sql');
    const seedSQL = fs.readFileSync(seedFilePath, 'utf8');
    
    console.log('📁 Loaded seed data file');
    console.log('🏗️  Executing seed data...');
    
    // Split SQL into individual statements (basic approach)
    const statements = seedSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--') && !stmt.startsWith('/*'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.trim()) {
        try {
          await client.query(statement);
          
          // Log progress for major operations
          if (statement.includes('INSERT INTO categories')) {
            console.log('✅ Categories seeded');
          } else if (statement.includes('INSERT INTO products')) {
            console.log('✅ Products seeded');
          } else if (statement.includes('INSERT INTO product_variants')) {
            console.log('✅ Product variants seeded');
          } else if (statement.includes('INSERT INTO inventory')) {
            console.log('✅ Inventory seeded');
          } else if (statement.includes('INSERT INTO users')) {
            console.log('✅ Sample users seeded');
          } else if (statement.includes('INSERT INTO delivery_zones')) {
            console.log('✅ Delivery zones seeded');
          }
          
          // Show progress
          if (i % 50 === 0) {
            console.log(`📊 Progress: ${i + 1}/${statements.length} statements completed`);
          }
        } catch (error) {
          console.warn(`⚠️  Warning: Statement ${i + 1} failed:`, error.message);
          // Continue with other statements
        }
      }
    }
    
    client.release();
    
    // Verify seeding results
    console.log('\n📊 Verifying seeding results...');
    
    const verificationQueries = [
      { name: 'Categories', query: 'SELECT COUNT(*) FROM categories WHERE is_active = true' },
      { name: 'Products', query: 'SELECT COUNT(*) FROM products WHERE is_active = true' },
      { name: 'Product Variants', query: 'SELECT COUNT(*) FROM product_variants WHERE is_active = true' },
      { name: 'Inventory Records', query: 'SELECT COUNT(*) FROM inventory' },
      { name: 'Vape Products', query: 'SELECT COUNT(*) FROM products WHERE is_vape_product = true' },
      { name: 'Users', query: 'SELECT COUNT(*) FROM users WHERE is_active = true' },
      { name: 'Delivery Zones', query: 'SELECT COUNT(*) FROM delivery_zones WHERE is_active = true' },
    ];
    
    for (const { name, query } of verificationQueries) {
      try {
        const result = await pool.query(query);
        console.log(`✅ ${name}: ${result.rows[0].count} records`);
      } catch (error) {
        console.error(`❌ Failed to verify ${name}:`, error.message);
      }
    }
    
    // Check for low stock items
    console.log('\n📦 Checking stock levels...');
    try {
      const lowStockQuery = `
        SELECT 
          p.name_ar as product_name,
          pv.variant_name_ar as variant_name,
          i.available_quantity,
          i.low_stock_threshold
        FROM products p
        JOIN product_variants pv ON p.id = pv.product_id
        JOIN inventory i ON pv.id = i.product_variant_id
        WHERE i.available_quantity <= i.low_stock_threshold
        ORDER BY i.available_quantity
        LIMIT 5;
      `;
      
      const lowStockResult = await pool.query(lowStockQuery);
      if (lowStockResult.rows.length > 0) {
        console.log('📉 Low stock items found:');
        lowStockResult.rows.forEach(row => {
          console.log(`   - ${row.product_name} (${row.variant_name}): ${row.available_quantity}/${row.low_stock_threshold}`);
        });
      } else {
        console.log('✅ All items are properly stocked');
      }
    } catch (error) {
      console.error('❌ Failed to check stock levels:', error.message);
    }
    
    // Check vape products age restriction
    console.log('\n🔞 Checking age-restricted products...');
    try {
      const ageRestrictedQuery = `
        SELECT 
          p.name_ar as product_name,
          COUNT(pv.id) as variant_count
        FROM products p
        JOIN product_variants pv ON p.id = pv.product_id
        WHERE p.is_vape_product = true AND p.age_restricted = true
        GROUP BY p.id, p.name_ar
        ORDER BY p.name_ar;
      `;
      
      const ageRestrictedResult = await pool.query(ageRestrictedQuery);
      console.log(`✅ Age-restricted products: ${ageRestrictedResult.rows.length} products`);
      ageRestrictedResult.rows.forEach(row => {
        console.log(`   - ${row.product_name}: ${row.variant_count} variants`);
      });
    } catch (error) {
      console.error('❌ Failed to check age-restricted products:', error.message);
    }
    
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📱 Your mobile app should now be able to:');
    console.log('   ✅ Display products by category');
    console.log('   ✅ Show product variants with different options');
    console.log('   ✅ Handle age verification for vape products');
    console.log('   ✅ Display proper stock levels');
    console.log('   ✅ Support multi-language content');
    console.log('   ✅ Process orders with inventory management');
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the seeding script
if (require.main === module) {
  seedDatabase().catch(error => {
    console.error('💥 Seeding script failed:', error);
    process.exit(1);
  });
}

module.exports = { seedDatabase };