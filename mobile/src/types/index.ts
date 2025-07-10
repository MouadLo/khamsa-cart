// User types
export interface User {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  type: 'customer' | 'admin' | 'delivery' | 'manager';
  is_guest: boolean;
  is_active: boolean;
  preferred_language: 'ar' | 'fr' | 'en';
  age_verified: boolean;
  created_at: string;
  last_login?: string;
}

// Product types
export interface Product {
  id: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  description_ar: string;
  description_fr: string;
  description_en: string;
  base_price: number;
  sku: string;
  brand: string;
  is_vape_product: boolean;
  age_restricted: boolean;
  is_featured: boolean;
  image_urls: string[];
  category_name: string;
  variants?: ProductVariant[];
  created_at: string;
}

export interface ProductImage {
  image_id: string;
  url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
}

export interface ProductVariant {
  id: string;
  variant_name_ar: string;
  variant_name_fr: string;
  variant_name_en: string;
  sku: string;
  price: number;
  attributes: any;
  is_default: boolean;
  stock_quantity: number;
}

export interface Category {
  id: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  description_ar?: string;
  description_fr?: string;
  description_en?: string;
  image_url?: string;
  icon_url?: string;
  parent_id?: string;
  is_vape_category: boolean;
  age_restricted: boolean;
  is_active: boolean;
  sort_order: number;
  product_count: number;
}

// Order types
export interface Order {
  order_id: string;
  user_id: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'cod_collected' | 'completed' | 'cancelled';
  payment_method: 'cod' | 'card' | 'bank_transfer';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  total_amount: number;
  delivery_fee: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
  delivery_address: string;
  delivery_phone: string;
  notes?: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
  estimated_delivery?: string;
}

export interface OrderItem {
  order_item_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product: Product;
  variant?: ProductVariant;
}

// Cart types
export interface CartItem {
  product_id: string;
  variant_id?: string;
  quantity: number;
  product: Product;
  variant?: ProductVariant;
}

export interface Cart {
  items: CartItem[];
  total_items: number;
  total_amount: number;
  delivery_fee: number;
  tax_amount: number;
  final_amount: number;
}

// Location types
export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  region?: string;
  postal_code?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

// Authentication types
export interface AuthResponse {
  user: User;
  token: string;
  expires_in: number;
}

export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface RegisterData {
  phone: string;
  password: string;
  name: string;
  email?: string;
  preferred_language?: 'ar' | 'fr' | 'en';
}

export interface GuestAuthData {
  phone: string;
  location: Location;
}

// Filter types
export interface ProductFilters {
  category?: string;
  subcategory?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'price' | 'name' | 'created_at';
  order?: 'asc' | 'desc';
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
}

export interface OrderFilters {
  status?: string;
  payment_method?: string;
  page?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
}

// Morocco specific types
export interface MoroccanCity {
  id: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  delivery_available: boolean;
  delivery_fee: number;
}

export interface DeliveryZone {
  zone_id: string;
  city_id: string;
  zone_name: string;
  delivery_fee: number;
  estimated_delivery_time: string;
  is_active: boolean;
}

// Payment types
export interface PaymentMethod {
  id: string;
  type: 'cod' | 'card' | 'bank_transfer';
  name_ar: string;
  name_fr: string;
  name_en: string;
  is_active: boolean;
  min_amount?: number;
  max_amount?: number;
}