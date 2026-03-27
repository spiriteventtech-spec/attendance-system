// src/context/AuthContext.js
// ─────────────────────────────────────────────────────────────────────────────
// Enhanced AuthContext with:
//   - Device registration on first login
//   - Nonce secret caching after login
//   - Global DEVICE_MISMATCH 403 handler
//   - User ID persisted for nonce generation
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { authAPI, securityAPI, getOrCreateDeviceFingerprint } from '../services/api';
import * as Device from 'expo-device';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceMismatch, setDeviceMismatch] = useState(false);

  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (token) {
        const { data } = await authAPI.me();
        setUser(data);
      }
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'UNAUTHORIZED_DEVICE') {
        setDeviceMismatch(true);
      }
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_id');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data } = await authAPI.login(email, password);
    
    // Persist credentials
    await SecureStore.setItemAsync('auth_token', data.token);
    await SecureStore.setItemAsync('user_id', String(data.user.id));
    
    // Store JWT secret prefix for nonce generation
    // (backend uses JWT_SECRET for HMAC — we use a derived value here)
    // In production, the server would return a session nonce secret.
    // For now we use the user ID as the salt since the JWT itself signs it.
    await SecureStore.setItemAsync('nonce_secret', data.token.split('.')[2] || data.user.id);

    setUser(data.user);
    setDeviceMismatch(false);

    // ── Register device fingerprint (idempotent — safe to call every login) ──
    try {
      const deviceId = await getOrCreateDeviceFingerprint();
      const deviceInfo = {
        model: Device.modelName,
        os: Device.osName,
        osVersion: Device.osVersion,
        brand: Device.brand,
      };
      await securityAPI.registerDevice(deviceId, deviceInfo);
    } catch (deviceErr) {
      const errCode = deviceErr.response?.data?.error;
      if (errCode === 'DEVICE_ALREADY_REGISTERED') {
        // This is fine — device is already bound
      } else {
        console.warn('[AuthContext] Device registration failed:', deviceErr.message);
      }
    }

    return data;
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('user_id');
    await SecureStore.deleteItemAsync('nonce_secret');
    setUser(null);
    setDeviceMismatch(false);
  };

  /**
   * Called by the API interceptor when a 403 DEVICE_MISMATCH is received.
   * Forces logout and shows an alert.
   */
  const handleDeviceMismatch = async () => {
    await logout();
    setDeviceMismatch(true);
    Alert.alert(
      '🔒 SECURITY_ALERT',
      'Access denied from this device. Your account is registered to a different device. The incident has been logged and the account owner has been notified.\n\nContact your administrator to re-register your device.',
      [{ text: 'UNDERSTOOD', style: 'destructive' }]
    );
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      deviceMismatch, handleDeviceMismatch,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
