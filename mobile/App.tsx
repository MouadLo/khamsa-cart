import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ApiService from './src/services/api';
import { User } from './src/types';

// Import screens (we'll create these next)
import LoginScreen from './src/screens/auth/LoginScreen';
import ProductListScreen from './src/screens/catalog/ProductListScreen';
import ProductDetailScreen from './src/screens/catalog/ProductDetailScreen';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [apiHealthy, setApiHealthy] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check API health
      console.log('Checking API health...');
      const healthCheck = await ApiService.healthCheck();
      console.log('API Health:', healthCheck);
      setApiHealthy(true);

      // Check if user is logged in
      const token = await AsyncStorage.getItem('authToken');
      const userData = await AsyncStorage.getItem('user');
      
      if (token && userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        console.log('User logged in:', parsedUser);
      }
    } catch (error) {
      console.error('App initialization failed:', error);
      setApiHealthy(false);
      Alert.alert(
        'Connection Error',
        'Unable to connect to server. Please check your internet connection.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (userData: User) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await ApiService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Loading GroceryVape...</Text>
      </View>
    );
  }

  if (!apiHealthy) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Connection Error</Text>
        <Text style={styles.errorMessage}>
          Unable to connect to server at 105.190.110.90:3000
        </Text>
        <Text style={styles.errorMessage}>
          Please check your internet connection and try again.
        </Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? 'ProductList' : 'Login'}
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0066cc',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {user ? (
          // Authenticated screens
          <>
            <Stack.Screen 
              name="ProductList" 
              component={ProductListScreen}
              options={{
                title: 'GroceryVape Morocco',
                headerRight: () => (
                  <Text 
                    style={styles.logoutButton}
                    onPress={handleLogout}
                  >
                    Logout
                  </Text>
                ),
              }}
            />
            <Stack.Screen 
              name="ProductDetail" 
              component={ProductDetailScreen}
              options={{ title: 'Product Details' }}
            />
          </>
        ) : (
          // Authentication screens
          <Stack.Screen 
            name="Login" 
            component={LoginScreen}
            options={{ 
              title: 'GroceryVape Morocco',
              headerLeft: () => null,
            }}
            initialParams={{ onLogin: handleLogin }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#cc0000',
    marginBottom: 20,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },
  logoutButton: {
    color: '#fff',
    fontSize: 16,
    marginRight: 15,
  },
});