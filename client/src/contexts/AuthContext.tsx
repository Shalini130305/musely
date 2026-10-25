import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { getErrorMessage } from '@/services/api';
import type { User } from '@/types';
import { presenceClient } from '@/services/presence';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginResult {
  requires2FA?: boolean;
  tempToken?: string;
  user?: User;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<LoginResult>;
  verify2FA: (tempToken: string, code: string) => Promise<void>;
  verify2FARecovery: (tempToken: string, recoveryCode: string) => Promise<void>;
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
      presenceClient.connect(token);
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
    return () => {
      // No-op on unmount (provider lives for app lifetime)
    };
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await api.post('/auth/login', { email, password });

    if (data.requires2FA) {
      return { requires2FA: true, tempToken: data.tempToken };
    }

    localStorage.setItem('musely_token', data.token);
    applyUserTheme(data.user.theme);
    setState(prev => ({
      ...prev,
      user: data.user,
      token: data.token,
      isAuthenticated: true,
    }));
    presenceClient.connect(data.token);
    return { user: data.user };
  };

  const verify2FA = async (tempToken: string, code: string) => {
    const { data } = await api.post('/auth/2fa/verify', { tempToken, code });
    localStorage.setItem('musely_token', data.token);
    applyUserTheme(data.user.theme);
    setState(prev => ({
      ...prev,
      user: data.user,
      token: data.token,
      isAuthenticated: true,
    }));
    presenceClient.connect(data.token);
  };

  const verify2FARecovery = async (tempToken: string, recoveryCode: string) => {
    const { data } = await api.post('/auth/2fa/recovery', { tempToken, recoveryCode });
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
    presenceClient.connect(data.token);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    presenceClient.disconnect();
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
    <AuthContext.Provider value={{ ...state, login, verify2FA, verify2FARecovery, register, logout, updateUser, refreshUser }}>
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
