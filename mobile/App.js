// App.js
// ─────────────────────────────────────────────────────────────────────────────
// Navigation with Zero-Trust Biometric Gate.
// On cold launch: BiometricGate → (authenticated) → StaffTabs
// Admin users log in via web panel — they bypass the biometric gate.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen        from './src/screens/LoginScreen';
import CheckInScreen      from './src/screens/CheckInScreen';
import HistoryScreen      from './src/screens/HistoryScreen';
import ProfileScreen      from './src/screens/ProfileScreen';
import BiometricGateScreen from './src/screens/BiometricGateScreen';
import { Radar, History, User } from 'lucide-react-native';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function StaffTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: 'rgba(255,255,255,0.05)',
          paddingBottom: 8,
          height: 64,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor:   '#00F5FF',
        tabBarInactiveTintColor: '#4A4A4A',
        tabBarLabelStyle: { fontSize: 8, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
      }}
    >
      <Tab.Screen name="CheckIn" component={CheckInScreen}
        options={{ 
            tabBarLabel: 'Radar', 
            tabBarIcon: ({ color }) => <Radar size={20} color={color} /> 
        }} />
      <Tab.Screen name="History" component={HistoryScreen}
        options={{ 
            tabBarLabel: 'Archive',  
            tabBarIcon: ({ color }) => <History size={20} color={color} /> 
        }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ 
            tabBarLabel: 'Identity',  
            tabBarIcon: ({ color }) => <User size={20} color={color} /> 
        }} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, loading } = useAuth();
  // biometricUnlocked: true once the biometric gate is passed for this session
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00F5FF" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
      {!user ? (
        // Not logged in — show login screen
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : !biometricUnlocked ? (
        // Logged in but biometric gate not yet passed — show gate
        <Stack.Screen name="BiometricGate">
          {() => (
            <BiometricGateScreen onUnlocked={() => setBiometricUnlocked(true)} />
          )}
        </Stack.Screen>
      ) : (
        // Fully authenticated — show main tabs
        <Stack.Screen name="Main" component={StaffTabs} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
