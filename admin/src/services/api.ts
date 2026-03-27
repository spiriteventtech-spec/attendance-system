// src/services/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ─────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/login', { email, password }),
  me: () => api.get('/admin/users/me'),
  stats: () => api.get('/admin/users/me/stats'),
  resetPassword: (userId: string, newPassword: string) =>
    api.post('/admin/users/reset-password', { userId, newPassword }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/change-password', { currentPassword, newPassword }),
  updateProfile: (data: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string }) =>
    api.put('/admin/users/me/profile', data),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post('/admin/users/upload-avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

export const usersAPI = {
  list: (params?: Record<string, any>) =>
    api.get('/admin/users', { params }),
  create: (data: Record<string, any>) =>
    api.post('/admin/users', data),
  update: (id: string, data: Record<string, any>) =>
    api.put(`/admin/users/${id}`, data),
  freeze: (userId: string, freeze: boolean) =>
    api.post('/admin/users/freeze', { userId, freeze }),
  archive: (userId: string) =>
    api.post('/admin/users/archive', { userId }),
  stats: (id: string) =>
    api.get(`/admin/users/${id}/stats`),
};

export const sitesAPI = {
  list: () => api.get('/admin/users/sites/all'),
  listPublic: () => api.get('/admin/users/sites'),
  create: (data: Record<string, any>) =>
    api.post('/admin/users/sites', data),
  update: (id: string, data: Record<string, any>) =>
    api.put(`/admin/users/sites/${id}`, data),
  delete: (id: string) =>
    api.delete(`/admin/users/sites/${id}`),
};

export const attendanceAPI = {
  logs: (params?: Record<string, any>) =>
    api.get('/attendance/logs', { params }),
  history: (params?: Record<string, any>) =>
    api.get('/attendance/history', { params }),
  active: () => api.get('/attendance/active'),
  checkin: (data: Record<string, any>) => api.post('/attendance/checkin', data),
  checkout: (data: Record<string, any>) => api.post('/attendance/checkout', data),
  override: (data: Record<string, any>) =>
    api.post('/attendance/override', data),
  breaches: (logId: string) =>
    api.get(`/attendance/breaches/${logId}`),
};

export const locationAPI = {
  live: () => api.get('/location/live'),
};

export const reportsAPI = {
  export: (params: Record<string, any>) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/reports/export?${query}`, { responseType: 'blob' });
  },
};

export const announcementsAPI = {
  list: () => api.get('/announcements'),
  create: (data: { title: string; message: string; priority: string; targetUserId?: string | null; targetSiteId?: string | null }) =>
    api.post('/announcements', data),
  delete: (id: string) =>
    api.delete(`/announcements/${id}`),
};

export const securityAPI = {
  getAuditLog: (params?: Record<string, any>) =>
    api.get('/security/audit-log', { params }),
  generateQR: (siteId: string) =>
    api.post('/security/generate-qr', { siteId }),
  verifyQR: (token: string, latitude: number, longitude: number, note: string) =>
    api.post('/security/verify-qr', { token, latitude, longitude, note }),
  getSessionPolicy: () =>
    api.get('/security/session-policy'),
  setSessionPolicy: (policy: 'block_new' | 'terminate_old') =>
    api.put('/security/session-policy', { policy }),
  getStatus: () =>
    api.get('/security/status'),
  resetDeviceBinding: (userId: string) =>
    api.delete(`/security/users/${userId}/device`),
};

