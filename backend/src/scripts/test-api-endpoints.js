#!/usr/bin/env node

/**
 * API Endpoint Testing Script
 * 
 * This script tests the main API endpoints to ensure they work correctly
 * with the seeded data.
 */

const axios = require('axios');

const API_BASE_URL = 'http://3.253.241.145:3000/api';

async function testAPIEndpoints() {
  console.log('🧪 Testing API endpoints...');
  console.log(`🔗 Base URL: ${API_BASE_URL}`);
  
  const tests = [
    {
      name: 'Health Check',
      method: 'GET',
      url: 'http://3.253.241.145:3000/health',
      expectedStatus: 200,
    },
    {
      name: 'Get Categories',
      method: 'GET',
      url: `${API_BASE_URL}/categories`,
      expectedStatus: 200,
      validate: (data) => {
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Categories data should be an array');
        }
        if (data.data.length === 0) {
          throw new Error('No categories found');
        }
        console.log(`   📂 Found ${data.data.length} categories`);
        
        // Check for vape categories
        const vapeCategories = data.data.filter(cat => cat.is_vape_category);
        console.log(`   🔞 Found ${vapeCategories.length} vape categories`);
        
        // Show category names
        data.data.slice(0, 5).forEach(cat => {
          console.log(`   - ${cat.name_ar} (${cat.name_en})`);
        });
        
        return true;
      }
    },
    {
      name: 'Get Products',
      method: 'GET',
      url: `${API_BASE_URL}/products`,
      expectedStatus: 200,
      validate: (data) => {
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Products data should be an array');
        }
        if (data.data.length === 0) {
          throw new Error('No products found');
        }
        console.log(`   📦 Found ${data.data.length} products`);
        
        // Check for vape products
        const vapeProducts = data.data.filter(prod => prod.is_vape_product);
        console.log(`   🔞 Found ${vapeProducts.length} vape products`);
        
        // Check for featured products
        const featuredProducts = data.data.filter(prod => prod.is_featured);
        console.log(`   ⭐ Found ${featuredProducts.length} featured products`);
        
        // Show product names
        data.data.slice(0, 5).forEach(prod => {
          console.log(`   - ${prod.name_ar} (${prod.brand || 'No Brand'}) - ${prod.base_price} MAD`);
        });
        
        return true;
      }
    },
    {
      name: 'Get Products with Pagination',
      method: 'GET',
      url: `${API_BASE_URL}/products?page=1&limit=10`,
      expectedStatus: 200,
      validate: (data) => {
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Products data should be an array');
        }
        if (data.data.length > 10) {
          throw new Error('Pagination not working - returned more than 10 items');
        }
        console.log(`   📄 Page 1 returned ${data.data.length} products`);
        return true;
      }
    },
    {
      name: 'Get Products by Category',
      method: 'GET',
      url: `${API_BASE_URL}/products?category=dairy`,
      expectedStatus: 200,
      validate: (data) => {
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Products data should be an array');
        }
        console.log(`   🥛 Found ${data.data.length} dairy products`);
        return true;
      }
    },
    {
      name: 'Search Products',
      method: 'GET',
      url: `${API_BASE_URL}/products?search=milk`,
      expectedStatus: 200,
      validate: (data) => {
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Products data should be an array');
        }
        console.log(`   🔍 Search for 'milk' returned ${data.data.length} products`);
        return true;
      }
    }
  ];
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of tests) {
    try {
      console.log(`\n🧪 Testing: ${test.name}`);
      
      const response = await axios({
        method: test.method,
        url: test.url,
        timeout: 10000,
        validateStatus: function (status) {
          return status < 500; // Accept any status code less than 500
        }
      });
      
      if (response.status !== test.expectedStatus) {
        throw new Error(`Expected status ${test.expectedStatus}, got ${response.status}`);
      }
      
      if (test.validate) {
        await test.validate(response.data);
      }
      
      console.log(`✅ ${test.name} - PASSED`);
      passedTests++;
      
    } catch (error) {
      console.error(`❌ ${test.name} - FAILED`);
      console.error(`   Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      failedTests++;
    }
  }
  
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All API tests passed! Your backend is ready for the mobile app.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check your backend setup.');
  }
}

// Additional test for specific product details
async function testProductDetails() {
  console.log('\n🔍 Testing product details...');
  
  try {
    // Get first product
    const productsResponse = await axios.get(`${API_BASE_URL}/products?limit=1`);
    
    if (productsResponse.data.data && productsResponse.data.data.length > 0) {
      const firstProduct = productsResponse.data.data[0];
      console.log(`📦 Testing product: ${firstProduct.name_ar}`);
      
      // Test product detail endpoint
      const productDetailResponse = await axios.get(`${API_BASE_URL}/products/${firstProduct.id}`);
      
      if (productDetailResponse.status === 200) {
        const productDetail = productDetailResponse.data.data;
        console.log(`✅ Product details loaded successfully`);
        console.log(`   - ID: ${productDetail.id}`);
        console.log(`   - Name: ${productDetail.name_ar}`);
        console.log(`   - Price: ${productDetail.base_price} MAD`);
        console.log(`   - Brand: ${productDetail.brand || 'No Brand'}`);
        console.log(`   - Category: ${productDetail.category_name_ar || 'Unknown'}`);
        console.log(`   - Is Vape Product: ${productDetail.is_vape_product ? 'Yes' : 'No'}`);
        console.log(`   - Age Restricted: ${productDetail.age_restricted ? 'Yes' : 'No'}`);
      }
    }
  } catch (error) {
    console.error('❌ Product details test failed:', error.message);
  }
}

// Run the tests
if (require.main === module) {
  testAPIEndpoints()
    .then(() => testProductDetails())
    .catch(error => {
      console.error('💥 API testing failed:', error);
      process.exit(1);
    });
}

module.exports = { testAPIEndpoints };