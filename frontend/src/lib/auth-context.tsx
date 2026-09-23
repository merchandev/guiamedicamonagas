'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, setAccessToken, refreshAccessToken } from './api';

export type Role = 'USER' | 'PROFESSIONAL' | 'ADMIN' | 'SUPERADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: string;
  professionalProfile?: {
    id: string;
    slug: string;
    firstName: string;
    lastName: string;
    verificationStatus: string;
    isPublished: boolean;
  } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: {
    email: string;
    password: string;
    role: 'USER' | 'PROFESSIONAL';
    firstName?: string;
    lastName?: string;
    cedula?: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await refreshAccessToken();
      if (token) {
        await loadMe();
      }
      setLoading(false);
    })();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await api.post<{ accessToken: string }>('/auth/login', { email, password });
      setAccessToken(accessToken);
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me);
      return me;
    },
    [],
  );

  const register = useCallback(
    async (payload: {
      email: string;
      password: string;
      role: 'USER' | 'PROFESSIONAL';
      firstName?: string;
      lastName?: string;
    }) => {
      const { accessToken } = await api.post<{ accessToken: string }>('/auth/register', payload);
      setAccessToken(accessToken);
      const me = await api.get<AuthUser>('/auth/me');
      setUser(me);
      return me;
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshMe: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export { ApiError };
