// Currency configurations for Morocco
import { MoroccoCurrency } from '../types/morocco.types';

export const MOROCCO_CURRENCY: MoroccoCurrency = {
  code: 'MAD',
  symbol: 'د.م.',
  symbolPosition: 'after',
  decimalPlaces: 2,
  thousandSeparator: ',',
  decimalSeparator: '.',
};

// Currency formatting utilities
export const formatMAD = (amount: number, showSymbol: boolean = true): string => {
  const formatted = amount.toLocaleString('ar-MA', {
    minimumFractionDigits: MOROCCO_CURRENCY.decimalPlaces,
    maximumFractionDigits: MOROCCO_CURRENCY.decimalPlaces,
  });
  
  if (!showSymbol) return formatted;
  
  return MOROCCO_CURRENCY.symbolPosition === 'after' 
    ? `${formatted} ${MOROCCO_CURRENCY.symbol}`
    : `${MOROCCO_CURRENCY.symbol} ${formatted}`;
};

export const parseMAD = (value: string): number => {
  // Remove currency symbol and parse
  const cleanValue = value
    .replace(MOROCCO_CURRENCY.symbol, '')
    .replace(/\s/g, '')
    .replace(MOROCCO_CURRENCY.thousandSeparator, '')
    .replace(MOROCCO_CURRENCY.decimalSeparator, '.');
  
  return parseFloat(cleanValue) || 0;
};

// Common price points in Morocco (in MAD)
export const MOROCCO_PRICE_RANGES = {
  // Grocery categories
  GROCERY_MIN: 20,      // Minimum grocery order
  GROCERY_AVERAGE: 150, // Average grocery order
  GROCERY_MAX: 500,     // Maximum typical grocery order
  
  // Vape categories  
  VAPE_MIN: 50,         // Minimum vape order
  VAPE_AVERAGE: 200,    // Average vape order
  VAPE_MAX: 800,        // Maximum typical vape order
  
  // COD limits
  COD_MAX_GROCERY: 500, // Maximum COD amount for groceries
  COD_MAX_VAPE: 300,    // Maximum COD amount for vape (lower due to risk)
  
  // Delivery fees
  DELIVERY_FREE_THRESHOLD: 200, // Free delivery above this amount
  DELIVERY_STANDARD: 15,        // Standard delivery fee
  DELIVERY_EXPRESS: 25,         // Express delivery fee
  DELIVERY_COD_SURCHARGE: 10,   // Additional fee for COD
};

// Payment method fees in MAD
export const MOROCCO_PAYMENT_FEES = {
  COD: {
    GROCERY: {
      under_100: 15,    // Orders under 100 MAD
      under_200: 12,    // Orders 100-200 MAD  
      under_300: 10,    // Orders 200-300 MAD
      over_300: 8,      // Orders over 300 MAD
    },
    VAPE: {
      under_100: 20,    // Orders under 100 MAD
      under_200: 18,    // Orders 100-200 MAD
      under_300: 15,    // Orders 200-300 MAD
      over_300: 12,     // Orders over 300 MAD
    },
  },
  CARD: {
    PROCESSING_FEE_PERCENT: 2.9, // Stripe processing fee
    PROCESSING_FEE_FIXED: 3,     // Fixed fee in MAD
  },
};

// Calculate COD fee based on order amount and category
export const calculateCODFee = (
  amount: number, 
  category: 'grocery' | 'vape' | 'mixed'
): number => {
  const fees = category === 'vape' 
    ? MOROCCO_PAYMENT_FEES.COD.VAPE 
    : MOROCCO_PAYMENT_FEES.COD.GROCERY;
  
  if (amount < 100) return fees.under_100;
  if (amount < 200) return fees.under_200;
  if (amount < 300) return fees.under_300;
  return fees.over_300;
};

// Calculate card processing fee
export const calculateCardFee = (amount: number): number => {
  const percentageFee = amount * (MOROCCO_PAYMENT_FEES.CARD.PROCESSING_FEE_PERCENT / 100);
  return percentageFee + MOROCCO_PAYMENT_FEES.CARD.PROCESSING_FEE_FIXED;
};

// Check if amount exceeds COD limits
export const isWithinCODLimit = (amount: number, category: 'grocery' | 'vape' | 'mixed'): boolean => {
  const limit = category === 'vape' 
    ? MOROCCO_PRICE_RANGES.COD_MAX_VAPE
    : MOROCCO_PRICE_RANGES.COD_MAX_GROCERY;
  
  return amount <= limit;
};

export default {
  MOROCCO_CURRENCY,
  MOROCCO_PRICE_RANGES,
  MOROCCO_PAYMENT_FEES,
  formatMAD,
  parseMAD,
  calculateCODFee,
  calculateCardFee,
  isWithinCODLimit,
};