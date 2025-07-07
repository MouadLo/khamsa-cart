// Localization configurations for Morocco
import { MoroccoLanguage } from '../types/morocco.types';

export const MOROCCO_LANGUAGES: MoroccoLanguage[] = [
  {
    code: 'ar',
    name: 'العربية',
    direction: 'rtl',
    isDefault: true,
  },
  {
    code: 'fr', 
    name: 'Français',
    direction: 'ltr',
    isDefault: false,
  },
  {
    code: 'en',
    name: 'English',
    direction: 'ltr', 
    isDefault: false,
  },
];

export const DEFAULT_LANGUAGE = 'ar';
export const FALLBACK_LANGUAGE = 'en';

// Common Morocco-specific translations
export const MOROCCO_TRANSLATIONS = {
  // Payment methods
  payment_methods: {
    ar: 'طرق الدفع',
    fr: 'Méthodes de paiement',
    en: 'Payment Methods',
  },
  cash_on_delivery: {
    ar: 'الدفع عند التسليم',
    fr: 'Paiement à la livraison', 
    en: 'Cash on Delivery',
  },
  credit_card: {
    ar: 'بطاقة ائتمان',
    fr: 'Carte de crédit',
    en: 'Credit Card',
  },
  
  // Product categories
  groceries: {
    ar: 'البقالة',
    fr: 'Épicerie',
    en: 'Groceries',
  },
  vape_products: {
    ar: 'منتجات السيجارة الإلكترونية',
    fr: 'Produits de vapotage',
    en: 'Vape Products',
  },
  
  // Order status
  order_pending: {
    ar: 'طلب معلق',
    fr: 'Commande en attente',
    en: 'Order Pending',
  },
  order_confirmed: {
    ar: 'طلب مؤكد', 
    fr: 'Commande confirmée',
    en: 'Order Confirmed',
  },
  order_preparing: {
    ar: 'قيد التحضير',
    fr: 'En préparation',
    en: 'Preparing',
  },
  out_for_delivery: {
    ar: 'في طريق التسليم',
    fr: 'En cours de livraison',
    en: 'Out for Delivery',
  },
  delivered: {
    ar: 'تم التسليم',
    fr: 'Livré',
    en: 'Delivered',
  },
  cancelled: {
    ar: 'ملغي',
    fr: 'Annulé', 
    en: 'Cancelled',
  },
  
  // Common actions
  add_to_cart: {
    ar: 'أضف إلى السلة',
    fr: 'Ajouter au panier',
    en: 'Add to Cart',
  },
  checkout: {
    ar: 'الدفع',
    fr: 'Commander',
    en: 'Checkout',
  },
  continue_shopping: {
    ar: 'متابعة التسوق',
    fr: 'Continuer les achats',
    en: 'Continue Shopping',
  },
  track_order: {
    ar: 'تتبع الطلب',
    fr: 'Suivre la commande',
    en: 'Track Order',
  },
  
  // Delivery
  delivery_address: {
    ar: 'عنوان التسليم',
    fr: 'Adresse de livraison',
    en: 'Delivery Address',
  },
  delivery_time: {
    ar: 'وقت التسليم',
    fr: 'Heure de livraison',
    en: 'Delivery Time',
  },
  delivery_fee: {
    ar: 'رسوم التوصيل',
    fr: 'Frais de livraison',
    en: 'Delivery Fee',
  },
  free_delivery: {
    ar: 'توصيل مجاني',
    fr: 'Livraison gratuite',
    en: 'Free Delivery',
  },
  
  // Morocco-specific places
  casablanca: {
    ar: 'الدار البيضاء',
    fr: 'Casablanca',
    en: 'Casablanca',
  },
  rabat: {
    ar: 'الرباط',
    fr: 'Rabat',
    en: 'Rabat',
  },
  marrakech: {
    ar: 'مراكش',
    fr: 'Marrakech',
    en: 'Marrakech',
  },
  fez: {
    ar: 'فاس',
    fr: 'Fès',
    en: 'Fez',
  },
  tangier: {
    ar: 'طنجة',
    fr: 'Tanger',
    en: 'Tangier',
  },
  agadir: {
    ar: 'أكادير',
    fr: 'Agadir',
    en: 'Agadir',
  },
  
  // Currency
  mad_currency: {
    ar: 'درهم مغربي',
    fr: 'Dirham marocain',
    en: 'Moroccan Dirham',
  },
  price: {
    ar: 'السعر',
    fr: 'Prix',
    en: 'Price',
  },
  total: {
    ar: 'المجموع',
    fr: 'Total',
    en: 'Total',
  },
  
  // Age verification (for vape products)
  age_verification: {
    ar: 'التحقق من العمر',
    fr: 'Vérification de l\'âge',
    en: 'Age Verification',
  },
  must_be_18: {
    ar: 'يجب أن تكون 18 سنة أو أكثر',
    fr: 'Vous devez avoir 18 ans ou plus',
    en: 'You must be 18 years or older',
  },
  upload_id: {
    ar: 'ارفع بطاقة الهوية',
    fr: 'Télécharger une pièce d\'identité',
    en: 'Upload ID Document',
  },
  
  // Phone and contact
  phone_number: {
    ar: 'رقم الهاتف',
    fr: 'Numéro de téléphone',
    en: 'Phone Number',
  },
  whatsapp_number: {
    ar: 'رقم الواتساب',
    fr: 'Numéro WhatsApp',
    en: 'WhatsApp Number',
  },
  contact_us: {
    ar: 'اتصل بنا',
    fr: 'Contactez-nous',
    en: 'Contact Us',
  },
  
  // Authentication
  login: {
    ar: 'تسجيل الدخول',
    fr: 'Se connecter',
    en: 'Login',
  },
  register: {
    ar: 'إنشاء حساب',
    fr: 'S\'inscrire',
    en: 'Register',
  },
  guest_checkout: {
    ar: 'طلب كضيف',
    fr: 'Commander en tant qu\'invité',
    en: 'Guest Checkout',
  },
  
  // Error messages
  error_occurred: {
    ar: 'حدث خطأ',
    fr: 'Une erreur s\'est produite',
    en: 'An error occurred',
  },
  network_error: {
    ar: 'خطأ في الشبكة',
    fr: 'Erreur réseau',
    en: 'Network Error',
  },
  invalid_phone: {
    ar: 'رقم هاتف غير صحيح',
    fr: 'Numéro de téléphone invalide',
    en: 'Invalid Phone Number',
  },
  
  // Success messages
  order_placed: {
    ar: 'تم وضع الطلب بنجاح',
    fr: 'Commande passée avec succès',
    en: 'Order placed successfully',
  },
  payment_confirmed: {
    ar: 'تم تأكيد الدفع',
    fr: 'Paiement confirmé',
    en: 'Payment confirmed',
  },
};

// Utility function to get translation
export const getTranslation = (
  key: keyof typeof MOROCCO_TRANSLATIONS,
  language: 'ar' | 'fr' | 'en' = DEFAULT_LANGUAGE
): string => {
  const translation = MOROCCO_TRANSLATIONS[key];
  if (!translation) return key;
  
  return translation[language] || translation[FALLBACK_LANGUAGE] || key;
};

// Function to get appropriate language based on user preference
export const getUserLanguage = (userPreference?: string): 'ar' | 'fr' | 'en' => {
  if (userPreference && ['ar', 'fr', 'en'].includes(userPreference)) {
    return userPreference as 'ar' | 'fr' | 'en';
  }
  return DEFAULT_LANGUAGE;
};

// Check if language uses RTL direction
export const isRTL = (language: 'ar' | 'fr' | 'en'): boolean => {
  const lang = MOROCCO_LANGUAGES.find(l => l.code === language);
  return lang?.direction === 'rtl';
};

export default {
  MOROCCO_LANGUAGES,
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  MOROCCO_TRANSLATIONS,
  getTranslation,
  getUserLanguage,
  isRTL,
};