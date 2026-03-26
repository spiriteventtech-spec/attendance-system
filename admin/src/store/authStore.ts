// src/store/authStore.ts
import { create } from 'zustand';
import { authAPI } from '../services/api';

interface User {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  restore: async () => {
    const token = localStorage.getItem('token');
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await authAPI.me();
      set({ 
        user: { 
          ...data, 
          firstName: data.first_name, 
          lastName: data.last_name,
          avatarUrl: data.avatar_url 
        }, 
        loading: false 
      });
    } catch {
      localStorage.removeItem('token');
      set({ loading: false });
    }
  },

  refresh: async () => {
    try {
      const { data } = await authAPI.me();
      set({ 
        user: { 
          ...data, 
          firstName: data.first_name, 
          lastName: data.last_name,
          avatarUrl: data.avatar_url 
        } 
      });
    } catch (err) {
      console.error('Failed to refresh user data', err);
    }
  },

  login: async (email, password) => {
    const { data } = await authAPI.login(email, password);
    localStorage.setItem('token', data.token);
    
    const mappedUser = {
      ...data.user,
      firstName: data.user.first_name,
      lastName: data.user.last_name,
      avatarUrl: data.user.avatar_url
    };
    
    localStorage.setItem('user', JSON.stringify(mappedUser));
    set({ user: mappedUser });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null });
  },
}));
