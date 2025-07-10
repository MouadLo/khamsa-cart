import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';

import { Product, ProductVariant } from '../../types';

type ProductDetailScreenProps = {
  navigation: StackNavigationProp<any>;
  route: RouteProp<any>;
};

export default function ProductDetailScreen({ navigation, route }: ProductDetailScreenProps) {
  const product: Product = route.params?.product;
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);

  if (!product) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Product not found</Text>
      </View>
    );
  }

  const currentPrice = selectedVariant 
    ? selectedVariant.price
    : product.base_price;

  const handleAddToCart = () => {
    Alert.alert(
      'Add to Cart',
      `Added ${quantity} x ${product.name_ar} to cart`,
      [{ text: 'OK' }]
    );
  };

  const handleBuyNow = () => {
    Alert.alert(
      'Buy Now',
      `Proceeding to checkout with ${quantity} x ${product.name_ar}`,
      [{ text: 'OK' }]
    );
  };

  const handleQuantityChange = (change: number) => {
    const maxQuantity = selectedVariant?.stock_quantity || 100;
    const newQuantity = quantity + change;
    if (newQuantity >= 1 && newQuantity <= maxQuantity) {
      setQuantity(newQuantity);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Product Images */}
      <View style={styles.imageContainer}>
        {product.image_urls && product.image_urls.length > 0 ? (
          <Image 
            source={{ uri: product.image_urls[0] }} 
            style={styles.productImage}
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
      </View>

      {/* Product Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.productName}>{product.name_ar}</Text>
        
        <View style={styles.priceContainer}>
          <Text style={styles.price}>{currentPrice.toFixed(2)} MAD</Text>
        </View>

        {/* Stock Status */}
        <View style={styles.stockContainer}>
          <Text style={styles.brandText}>
            Brand: {product.brand || 'No Brand'}
          </Text>
          {product.age_restricted && (
            <Text style={styles.ageWarning}>⚠️ 18+ Age Verification Required</Text>
          )}
        </View>

        {/* Product Description */}
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{product.description_ar}</Text>

        {/* Product Variants */}
        {product.variants && product.variants.length > 0 && (
          <View style={styles.variantsContainer}>
            <Text style={styles.sectionTitle}>Options</Text>
            {product.variants.map((variant) => (
              <TouchableOpacity
                key={variant.id}
                style={[
                  styles.variantButton,
                  selectedVariant?.id === variant.id && styles.variantButtonSelected
                ]}
                onPress={() => setSelectedVariant(variant)}
              >
                <Text style={[
                  styles.variantText,
                  selectedVariant?.id === variant.id && styles.variantTextSelected
                ]}>
                  {variant.variant_name_ar}
                  {variant.price !== product.base_price && ` (${variant.price.toFixed(2)} MAD)`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quantity Selector */}
        <View style={styles.quantityContainer}>
          <Text style={styles.sectionTitle}>Quantity</Text>
          <View style={styles.quantitySelector}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => handleQuantityChange(-1)}
              disabled={quantity <= 1}
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => handleQuantityChange(1)}
              disabled={quantity >= (selectedVariant?.stock_quantity || 100)}
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Total Price */}
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalPrice}>
            {(currentPrice * quantity).toFixed(2)} MAD
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.addToCartButton}
          onPress={handleAddToCart}
          disabled={(selectedVariant?.stock_quantity || 0) === 0}
        >
          <Text style={styles.addToCartText}>Add to Cart</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buyNowButton}
          onPress={handleBuyNow}
          disabled={(selectedVariant?.stock_quantity || 0) === 0}
        >
          <Text style={styles.buyNowText}>Buy Now</Text>
        </TouchableOpacity>
      </View>

      {/* Product Details */}
      <View style={styles.detailsContainer}>
        <Text style={styles.sectionTitle}>Product Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Category:</Text>
          <Text style={styles.detailValue}>{product.category_name}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Brand:</Text>
          <Text style={styles.detailValue}>{product.brand || 'N/A'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>SKU:</Text>
          <Text style={styles.detailValue}>{product.sku}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
  },
  imageContainer: {
    height: 300,
    backgroundColor: '#fff',
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#999',
    fontSize: 16,
  },
  infoContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 10,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  comparePrice: {
    fontSize: 16,
    color: '#999',
    textDecorationLine: 'line-through',
    marginLeft: 10,
  },
  stockContainer: {
    marginBottom: 20,
  },
  brandText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  ageWarning: {
    fontSize: 12,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    color: '#666',
    marginBottom: 20,
  },
  variantsContainer: {
    marginBottom: 20,
  },
  variantButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
  },
  variantButtonSelected: {
    borderColor: '#0066cc',
    backgroundColor: '#e6f3ff',
  },
  variantText: {
    fontSize: 14,
    color: '#333',
  },
  variantTextSelected: {
    color: '#0066cc',
    fontWeight: '600',
  },
  quantityContainer: {
    marginBottom: 20,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 20,
    minWidth: 30,
    textAlign: 'center',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0066cc',
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 15,
    borderRadius: 8,
    marginRight: 10,
    alignItems: 'center',
  },
  addToCartText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  buyNowButton: {
    flex: 1,
    backgroundColor: '#0066cc',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buyNowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  detailsContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
});