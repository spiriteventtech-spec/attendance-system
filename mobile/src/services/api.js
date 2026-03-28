// src/services/api.js
// ─────────────────────────────────────────────────────────────────────────────
// Zero-Trust API Client
// Automatically injects:
//   Authorization: Bearer <jwt>         — existing
//   X-Device-ID: <hardware-fingerprint> — device binding
//   X-Nonce: <hmac-sha256>              — replay protection
//   X-Timestamp: <unix-ms>             — replay protection
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import CryptoJS from 'crypto-js';

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

// ── Device Fingerprint Generation ────────────────────────────────────────────
// Generates a stable, unique device ID based on hardware characteristics.
// Stored in SecureStore on first run so it never changes between app restarts.
const getOrCreateDeviceFingerprint = async () => {
  const STORE_KEY = 'device_fingerprint';
  
  let fp = await SecureStore.getItemAsync(STORE_KEY);
  if (fp) return fp;

  // Build fingerprint from stable device properties
  const components = [
    Device.modelName        || 'unknown_model',
    Device.osName          || 'unknown_os',
    Device.osVersion       || 'unknown_ver',
    Device.osBuildId       || 'unknown_build',
    String(Device.totalMemory || '0'),
    // Application install ID — unique per install even on same device
    (await Application.getAndroidId?.()) || 
    (await Application.getIosIdForVendorAsync?.()) || 
    'unknown_install',
  ].join('|');

  // Hash the components to get a fixed-length, opaque identifier
  fp = CryptoJS.SHA256(components).toString(CryptoJS.enc.Hex);
  await SecureStore.setItemAsync(STORE_KEY, fp);
  return fp;
};

// ── HMAC Nonce Generation ─────────────────────────────────────────────────────
// Generates a signed nonce for replay protection.
// Server re-computes and validates this on every mutation request.
const generateNonce = async (userId) => {
  const timestamp = Date.now().toString();
  const JWT_SECRET = process.env.EXPO_PUBLIC_NONCE_SECRET || 'fallback'; // Shared with backend
  // Note: In production, the nonce secret should be read from SecureStore after login
  const secret = await SecureStore.getItemAsync('nonce_secret') || JWT_SECRET;
  const nonce = CryptoJS.HmacSHA256(`${userId}:${timestamp}`, secret).toString(CryptoJS.enc.Hex);
  return { nonce, timestamp };
};

// ── Axios Instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request Interceptor: Inject Security Headers ──────────────────────────────
api.interceptors.request.use(async (config) => {
  // 1. JWT Token
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // 2. Device Fingerprint (X-Device-ID)
  try {
    const deviceId = await getOrCreateDeviceFingerprint();
    config.headers['X-Device-ID'] = deviceId;
  } catch (e) {
    console.warn('[API] Could not inject device fingerprint:', e.message);
  }

  // 3. Replay Protection (X-Nonce + X-Timestamp) for mutation requests
  const mutationMethods = ['post', 'put', 'delete', 'patch'];
  if (mutationMethods.includes(config.method?.toLowerCase())) {
    try {
      const userId = await SecureStore.getItemAsync('user_id');
      if (userId) {
        const { nonce, timestamp } = await generateNonce(userId);
        config.headers['X-Nonce'] = nonce;
        config.headers['X-Timestamp'] = timestamp;
      }
    } catch (e) {
      console.warn('[API] Could not inject nonce:', e.message);
    }
  }

  return config;
});

// ── Response Interceptor: Handle Security Rejections ──────────────────────────
api.interceptors.response.use(
  res => res,
  async err => {
    const status = err.response?.status;
    const code = err.response?.data?.code;

    if (status === 401) {
      // Token expired or invalid — clear credentials
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_id');
    }

    if (status === 403 && code === 'UNAUTHORIZED_DEVICE') {
      // Device mismatch — the account has been compromised or user got a new phone
      // AuthContext will catch this event via the global 403 handler
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_id');
    }

    return Promise.reject(err);
  }
);

// ── API Modules ───────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/login', { email, password }),
  me: () => api.get('/me'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/change-password', { currentPassword, newPassword }),
  registerPushToken: (pushToken) => api.put('/me/push-token', { pushToken }),
  updateProfile: (data) => api.put('/admin/users/me/profile', data),
  uploadAvatar: (formData) => api.post('/admin/users/upload-avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
};

export const securityAPI = {
  registerDevice: (deviceId, deviceInfo) =>
    api.post('/security/register-device', { deviceId, deviceInfo }),
  checkInSelfie: (selfieBase64) =>
    api.post('/security/checkin-selfie', { selfieBase64 }),
  generateQR: (siteId) =>
    api.post('/security/generate-qr', { siteId }),
  verifyQR: (token, latitude, longitude, note) =>
    api.post('/security/verify-qr', { token, latitude, longitude, note }),
  getAuditLog: (params) =>
    api.get('/security/audit-log', { params }),
  getSessionPolicy: () =>
    api.get('/security/session-policy'),
  setSessionPolicy: (policy) =>
    api.put('/security/session-policy', { policy }),
  resetDeviceBinding: (userId) =>
    api.delete(`/security/users/${userId}/device`),
};

export const attendanceAPI = {
  checkIn: (siteId, latitude, longitude, note) =>
    api.post('/attendance/checkin', { siteId, latitude, longitude, note }),

  checkOut: (latitude, longitude, note) =>
    api.post('/attendance/checkout', { latitude, longitude, note }),

  getActive: () => api.get('/attendance/active'),

  getHistory: (page = 1) =>
    api.get(`/attendance/history?page=${page}&limit=20`),

  getBreaches: (logId) =>
    api.get(`/attendance/breaches/${logId}`),
};

export const locationAPI = {
  ping: (latitude, longitude, accuracy, isMockLocation = false) =>
    api.post('/location/ping', { latitude, longitude, accuracy, isMockLocation }),
};

export { getOrCreateDeviceFingerprint };
export default api;
