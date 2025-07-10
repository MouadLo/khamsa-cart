import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';

import ApiService from '../../services/api';
import { User } from '../../types';

type LoginScreenProps = {
  navigation: StackNavigationProp<any>;
  route: RouteProp<any>;
};

export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);

  const onLogin = route.params?.onLogin;

  const handleLogin = async () => {
    if (!phone.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setLoading(true);
    try {
      const response = await ApiService.login(phone, password);
      console.log('Login successful:', response);
      
      if (onLogin) {
        onLogin(response.user);
      }
    } catch (error: any) {
      console.error('Login failed:', error);
      Alert.alert(
        'Login Failed',
        error.response?.data?.error || 'Invalid credentials'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    if (!phone.trim()) {
      Alert.alert('Error', 'Please enter your phone number for guest access');
      return;
    }

    setLoading(true);
    try {
      // For demo purposes, using default location (Casablanca)
      const defaultLocation = {
        latitude: 33.5731,
        longitude: -7.5898,
        address: 'Casablanca, Morocco',
      };

      const response = await ApiService.guestAuth(phone, defaultLocation);
      console.log('Guest login successful:', response);
      
      if (onLogin) {
        onLogin(response.user);
      }
    } catch (error: any) {
      console.error('Guest login failed:', error);
      Alert.alert(
        'Guest Login Failed',
        error.response?.data?.error || 'Unable to continue as guest'
      );
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    
    // Format as +212XXXXXXXXX
    if (cleaned.length <= 9) {
      return '+212' + cleaned;
    }
    
    return '+212' + cleaned.slice(-9);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to GroceryVape Morocco</Text>
        <Text style={styles.subtitle}>
          Your trusted marketplace for groceries and vape products
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={(text) => setPhone(formatPhoneNumber(text))}
            placeholder="+212XXXXXXXXX"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          {!isGuestMode && (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={isGuestMode ? handleGuestLogin : handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isGuestMode ? 'Continue as Guest' : 'Login'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={() => setIsGuestMode(!isGuestMode)}
          >
            <Text style={styles.guestButtonText}>
              {isGuestMode ? 'Back to Login' : 'Continue as Guest'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            🇲🇦 Proudly serving Morocco with quality products
          </Text>
          <Text style={styles.footerText}>
            💳 Cash on Delivery available
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#0066cc',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  form: {
    marginBottom: 40,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  guestButton: {
    borderWidth: 1,
    borderColor: '#0066cc',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  guestButtonText: {
    color: '#0066cc',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
});