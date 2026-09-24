'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, setAccessToken, refreshAccessToken } from './api';

export type Role = 'USER' | 'PROFESSIONAL' | 'ORGANIZATION' | 'ADMIN' | 'SUPERADMIN';

export type Permission =
  | 'VERIFY_PROFESSIONALS'
  | 'VERIFY_PATIENT_IDENTITY'
  | 'REVIEW_PAYMENTS'
  | 'MANAGE_ORGANIZATIONS'
  | 'MANAGE_CATALOG'
  | 'MANAGE_PLANS'
  | 'MANAGE_SITE'
  | 'VIEW_ADMIN_STATS';

export interface OrganizationMembership {
  role: 'OWNER' | 'ADMIN' | 'EDITOR';
  organization: {
    id: string;
    slug: string;
    name: string;
    type: 'PHARMACY' | 'LABORATORY' | 'CLINIC';
    verificationStatus: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  createdAt: string;
  permissions: Permission[];
  needsLegalAcceptance: boolean;
  legal: { termsVersion: string; privacyVersion: string };
  professionalProfile?: {
    id: string;
    slug: string;
    firstName: string;
    lastName: string;
    verificationStatus: string;
    isPublished: boolean;
  } | null;
  organizationMemberships?: OrganizationMembership[];
}

export interface RegisterPayload {
  email: string;
  password: string;
  role: 'USER' | 'PROFESSIONAL' | 'ORGANIZATION';
  acceptLegal: true;
  firstName?: string;
  lastName?: string;
  cedula?: string;
  organizationName?: string;
  organizationType?: 'PHARMACY' | 'LABORATORY' | 'CLINIC';
  organizationRif?: string;
  /** Alta para unirse al equipo de una organización existente (enlace de invitación). */
  invitationToken?: string;
}

/** Con el segundo factor activo, el login de un administrador devuelve un desafío en vez de sesión. */
export type LoginOutcome = { kind: 'USER'; user: AuthUser } | { kind: 'MFA_REQUIRED'; challengeToken: string };

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  verifyMfa: (challengeToken: string, code: string) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  acceptLegal: () => Promise<void>;
  logout: () => Promise<void>;
  /** Cambia la contraseña; el servidor cierra las demás sesiones y renueva esta. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Cierra la sesión en todos los dispositivos, incluido este. */
  logoutAll: () => Promise<void>;
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

  const startSession = useCallback(async (accessToken: string) => {
    setAccessToken(accessToken);
    const me = await api.get<AuthUser>('/auth/me');
    setUser(me);
    return me;
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const res = await api.post<{ accessToken?: string; mfaRequired?: boolean; challengeToken?: string }>('/auth/login', {
        email,
        password,
      });
      if (res.mfaRequired && res.challengeToken) {
        return { kind: 'MFA_REQUIRED', challengeToken: res.challengeToken };
      }
      return { kind: 'USER', user: await startSession(res.accessToken!) };
    },
    [startSession],
  );

  const verifyMfa = useCallback(
    async (challengeToken: string, code: string) => {
      const { accessToken } = await api.post<{ accessToken: string }>('/auth/mfa/verify', { challengeToken, code });
      return startSession(accessToken);
    },
    [startSession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const { accessToken } = await api.post<{ accessToken: string }>('/auth/register', payload);
      return startSession(accessToken);
    },
    [startSession],
  );

  const acceptLegal = useCallback(async () => {
    const me = await api.post<AuthUser>('/auth/accept-legal');
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { accessToken } = await api.post<{ accessToken: string }>('/auth/change-password', { currentPassword, newPassword });
      await startSession(accessToken);
    },
    [startSession],
  );

  const logoutAll = useCallback(async () => {
    await api.post('/auth/logout-all');
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfa, register, acceptLegal, logout, changePassword, logoutAll, refreshMe: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Ruta de inicio según el tipo de cuenta. */
export function homePathFor(role: Role): string {
  if (role === 'PROFESSIONAL') return '/dashboard';
  if (role === 'ORGANIZATION') return '/organizacion';
  if (role === 'ADMIN' || role === 'SUPERADMIN') return '/admin';
  return '/paciente';
}

export { ApiError };
