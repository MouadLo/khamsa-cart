// Morocco-specific type definitions for GroceryVape platform

export interface MoroccoRegion {
  id: string;
  nameAr: string;      // Arabic name
  nameFr: string;      // French name  
  nameEn: string;      // English name
  code: string;        // Region code (e.g., 'CAS' for Casablanca)
  isActive: boolean;   // Whether delivery is available
  codAvailable: boolean; // Whether COD is available in this region
  deliveryFee: number; // Delivery fee in MAD
  estimatedDeliveryHours: number; // Estimated delivery time
}

export interface MoroccoCity {
  id: string;
  regionId: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  postalCodes: string[]; // Array of postal codes
  isActive: boolean;
  codAvailable: boolean;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface MoroccoAddress {
  id?: string;
  street: string;
  neighborhood?: string; // Quartier/Hay
  city: string;
  region: string;
  postalCode?: string;
  country: 'Morocco' | 'MA';
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  deliveryInstructions?: string;
  apartmentNumber?: string;
  buildingName?: string;
  landmark?: string; // Notable nearby landmark
}

export interface MoroccoPhone {
  countryCode: '+212';
  number: string; // Without country code (e.g., '661234567')
  isValidated: boolean;
  isWhatsApp?: boolean; // Many Moroccans use WhatsApp for communication
}

export interface MoroccoCurrency {
  code: 'MAD';
  symbol: 'د.م.';
  symbolPosition: 'after' | 'before';
  decimalPlaces: 2;
  thousandSeparator: ',';
  decimalSeparator: '.';
}

export interface MoroccoLanguage {
  code: 'ar' | 'fr' | 'en';
  name: string;
  direction: 'ltr' | 'rtl';
  isDefault: boolean;
}

export interface MoroccoPaymentPreferences {
  prefersCOD: boolean;
  hasCardAccess: boolean;
  preferredLanguage: 'ar' | 'fr' | 'en';
  communicationPreference: 'phone' | 'whatsapp' | 'sms';
}

export interface MoroccoBusinessHours {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  isOpen: boolean;
  openTime?: string; // 24-hour format (e.g., '09:00')
  closeTime?: string; // 24-hour format (e.g., '21:00')
  breakStartTime?: string; // For lunch break
  breakEndTime?: string;
  isRamadanSchedule?: boolean; // Special hours during Ramadan
}

export interface MoroccoHoliday {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  date: string; // ISO date string
  isNational: boolean;
  isReligious: boolean;
  affectsDelivery: boolean;
  alternativeDeliveryAvailable: boolean;
}

export interface MoroccoCompliance {
  ageVerificationRequired: boolean; // For vape products
  minimumAge: number; // Usually 18 for vape products
  requiredDocuments: string[]; // ['national_id', 'passport']
  businessLicense: string;
  taxId: string;
  regulatoryNotes?: string;
}

export interface MoroccoDeliveryZone {
  id: string;
  name: string;
  regionId: string;
  cityId: string;
  boundaries: {
    type: 'Polygon';
    coordinates: number[][][]; // GeoJSON format
  };
  isActive: boolean;
  codAvailable: boolean;
  deliveryFee: number;
  freeDeliveryThreshold?: number; // Minimum order amount for free delivery
  estimatedDeliveryTime: {
    min: number; // Minimum hours
    max: number; // Maximum hours
  };
  restrictions?: {
    maxOrderValue?: number; // For COD orders
    minOrderValue?: number;
    availableTimeSlots?: string[]; // Specific delivery time slots
    excludedDays?: string[]; // Days when delivery is not available
  };
}

export interface MoroccoUser {
  id: string;
  phone: MoroccoPhone;
  preferredLanguage: 'ar' | 'fr' | 'en';
  address?: MoroccoAddress;
  paymentPreferences: MoroccoPaymentPreferences;
  region?: string;
  city?: string;
  isVerified: boolean; // For age verification (vape products)
  verificationDate?: string;
  communicationPreference: 'phone' | 'whatsapp' | 'sms';
  deliveryNotes?: string;
}

// Utility types for Morocco-specific features
export type MoroccoLanguageCode = 'ar' | 'fr' | 'en';
export type MoroccoCityCode = 'CAS' | 'RAB' | 'MAR' | 'FEZ' | 'TAN' | 'AGA' | 'OUJ' | 'KEN' | 'TET' | 'SAF';
export type MoroccoRegionCode = 'CAS-SET' | 'RAB-SAL-KEN' | 'MAR-SAF' | 'FEZ-MEK' | 'TAN-TET-HOU' | 'SOU-MAS';

export interface MoroccoLocalization {
  [key: string]: {
    ar: string;
    fr: string;
    en: string;
  };
}