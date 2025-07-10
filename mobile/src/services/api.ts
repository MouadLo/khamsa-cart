import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API Configuration
const API_BASE_URL = 'http://105.190.110.90:3000/api';

interface ApiConfig {
  baseURL: string;
  timeout: number;
  headers: {
    'Content-Type': string;
    'Accept-Language': string;
  };
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    const config: ApiConfig = {
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'ar', // Default to Arabic for Morocco
      },
    };

    this.api = axios.create(config);

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired, clear storage and redirect to login
          await AsyncStorage.removeItem('authToken');
          await AsyncStorage.removeItem('user');
          // You can add navigation to login screen here
        }
        return Promise.reject(error);
      }
    );
  }

  // Health check
  async healthCheck() {
    try {
      const response = await this.api.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  // Authentication
  async login(phone: string, password: string) {
    try {
      const response = await this.api.post('/auth/login', {
        phone,
        password,
      });
      
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async register(userData: {
    phone: string;
    password: string;
    name: string;
    email?: string;
  }) {
    try {
      const response = await this.api.post('/auth/register', userData);
      
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async guestAuth(phone: string, location: {
    latitude: number;
    longitude: number;
    address: string;
  }) {
    try {
      const response = await this.api.post('/auth/guest', {
        phone,
        location,
      });
      
      if (response.data.token) {
        await AsyncStorage.setItem('authToken', response.data.token);
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      }
      
      return response.data;
    } catch (error) {
      console.error('Guest auth failed:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('user');
      return true;
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  // Products
  async getProducts(filters?: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());

      const response = await this.api.get(`/products?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Get products failed:', error);
      throw error;
    }
  }

  async getProduct(productId: string) {
    try {
      const response = await this.api.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      console.error('Get product failed:', error);
      throw error;
    }
  }

  async getCategories() {
    try {
      const response = await this.api.get('/products/categories');
      return response.data;
    } catch (error) {
      console.error('Get categories failed:', error);
      throw error;
    }
  }

  // Orders
  async createOrder(orderData: {
    items: Array<{
      product_id: string;
      quantity: number;
      variant_id?: string;
    }>;
    delivery_address: string;
    payment_method: 'cod' | 'card';
    notes?: string;
  }) {
    try {
      const response = await this.api.post('/orders', orderData);
      return response.data;
    } catch (error) {
      console.error('Create order failed:', error);
      throw error;
    }
  }

  async getOrders(page: number = 1, limit: number = 10) {
    try {
      const response = await this.api.get(`/orders?page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Get orders failed:', error);
      throw error;
    }
  }

  async getOrder(orderId: string) {
    try {
      const response = await this.api.get(`/orders/${orderId}`);
      return response.data;
    } catch (error) {
      console.error('Get order failed:', error);
      throw error;
    }
  }

  // COD specific
  async getCODOrders() {
    try {
      const response = await this.api.get('/cod/orders');
      return response.data;
    } catch (error) {
      console.error('Get COD orders failed:', error);
      throw error;
    }
  }

  async confirmCODPayment(orderId: string) {
    try {
      const response = await this.api.post(`/cod/confirm/${orderId}`);
      return response.data;
    } catch (error) {
      console.error('Confirm COD payment failed:', error);
      throw error;
    }
  }

  // User profile
  async getUserProfile() {
    try {
      const response = await this.api.get('/auth/profile');
      return response.data;
    } catch (error) {
      console.error('Get user profile failed:', error);
      throw error;
    }
  }

  async updateUserProfile(userData: {
    name?: string;
    email?: string;
    preferred_language?: 'ar' | 'fr' | 'en';
  }) {
    try {
      const response = await this.api.put('/auth/profile', userData);
      return response.data;
    } catch (error) {
      console.error('Update user profile failed:', error);
      throw error;
    }
  }

  // Set language for API requests
  setLanguage(language: 'ar' | 'fr' | 'en') {
    this.api.defaults.headers['Accept-Language'] = language;
  }
}

export default new ApiService();