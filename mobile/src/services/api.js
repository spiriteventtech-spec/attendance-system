// src/services/api.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT automatically
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
    }
    return Promise.reject(err);
  }
);

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
  ping: (latitude, longitude, accuracy) =>
    api.post('/location/ping', { latitude, longitude, accuracy }),
};

export default api;
