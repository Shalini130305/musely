import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { getErrorMessage } from '@/services/api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Sync user's stored theme preference to localStorage and DOM */
function applyUserTheme(userTheme?: string) {
  if (!userTheme) return;
  const validThemes = ['dark', 'light', 'system'];
  if (!validThemes.includes(userTheme)) return;
  localStorage.setItem('musely_theme', userTheme);
  const resolved = userTheme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : userTheme;
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('musely_token'),
    isLoading: true,
    isAuthenticated: false,
  });

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      applyUserTheme(data.user.theme);
      setState(prev => ({
        ...prev,
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      }));
    } catch {
      localStorage.removeItem('musely_token');
      localStorage.removeItem('musely_user');
      setState(prev => ({
        ...prev,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('musely_token');
    if (token) {
      refreshUser();
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('musely_token', data.token);
    applyUserTheme(data.user.theme);
    setState(prev => ({
      ...prev,
      user: data.user,
      token: data.token,
      isAuthenticated: true,
    }));
  };

  const register = async (email: string, username: string, displayName: string, password: string) => {
    const { data } = await api.post('/auth/register', { email, username, displayName, password });
    localStorage.setItem('musely_token', data.token);
    applyUserTheme(data.user.theme);
    setState(prev => ({
      ...prev,
      user: data.user,
      token: data.token,
      isAuthenticated: true,
    }));
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    localStorage.removeItem('musely_token');
    localStorage.removeItem('musely_user');
    setState(prev => ({
      ...prev,
      user: null,
      token: null,
      isAuthenticated: false,
    }));
  };

  const updateUser = (updates: Partial<User>) => {
    setState(prev => ({
      ...prev,
      user: prev.user ? { ...prev.user, ...updates } : null,
    }));
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { getErrorMessage };
