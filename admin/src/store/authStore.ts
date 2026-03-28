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

export const useAuthStore = create<AuthState>((set) => {
  // Sync hydration for instant layout rendering (LCP optimization)
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');
  let initialUser = null;
  
  if (savedToken && savedUser) {
    try {
      initialUser = JSON.parse(savedUser);
    } catch {
      localStorage.removeItem('user');
    }
  }

  return {
    user: initialUser,
    loading: !!(savedToken && !initialUser),

    restore: async () => {
      const token = localStorage.getItem('token');
      if (!token) { set({ user: null, loading: false }); return; }
      try {
        const { data } = await authAPI.me();
        const mappedUser = { 
          ...data, 
          firstName: data.first_name, 
          lastName: data.last_name,
          avatarUrl: data.avatar_url 
        };
        localStorage.setItem('user', JSON.stringify(mappedUser));
        set({ user: mappedUser, loading: false });
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ user: null, loading: false });
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
  };
});
