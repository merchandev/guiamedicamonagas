'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PlanTier } from '@/lib/types';
import type { SocialLink } from '@/lib/social';

export type OrgType = 'PHARMACY' | 'LABORATORY' | 'CLINIC';
export type OrgRole = 'OWNER' | 'ADMIN' | 'EDITOR';

export interface OrgSummary {
  id: string;
  slug: string;
  name: string;
  type: OrgType;
  verificationStatus: string;
  planTier: PlanTier;
  role: OrgRole;
}

export interface OrgLocation {
  id?: string;
  name: string;
  address: string;
  municipality: string | null;
  phone: string | null;
  whatsapp: string | null;
}

export interface OrgDetail {
  id: string;
  slug: string;
  name: string;
  type: OrgType;
  description: string | null;
  rif: string | null;
  logoUrl: string | null;
  isPublished: boolean;
  verificationStatus: 'PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  rejectionReason: string | null;
  planTier: PlanTier;
  openingHours: string | null;
  services: string[] | null;
  insurers: string[] | null;
  paymentMethods: string[] | null;
  locations: OrgLocation[];
  socialLinks: SocialLink[];
  professionals: {
    professionalId: string;
    status: 'PENDING' | 'ACCEPTED';
    professional: { id: string; slug: string; firstName: string; lastName: string };
  }[];
  myRole: OrgRole;
  maxLocations: number;
}

interface OrgContextValue {
  organizations: OrgSummary[] | null;
  current: OrgDetail | null;
  selectOrganization: (id: string) => void;
  reload: () => Promise<void>;
  setCurrent: (org: OrgDetail) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);
const STORAGE_KEY = 'gmm_current_org';

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [organizations, setOrganizations] = useState<OrgSummary[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [current, setCurrent] = useState<OrgDetail | null>(null);

  const loadDetail = useCallback(async (id: string) => {
    setCurrent(await api.get<OrgDetail>(`/organizations/me/${id}`));
  }, []);

  useEffect(() => {
    api
      .get<OrgSummary[]>('/organizations/me/list')
      .then((list) => {
        setOrganizations(list);
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(STORAGE_KEY);
        } catch {}
        const initial = list.find((o) => o.id === stored)?.id ?? list[0]?.id ?? null;
        setCurrentId(initial);
      })
      .catch(() => setOrganizations([]));
  }, []);

  useEffect(() => {
    if (currentId) void loadDetail(currentId);
  }, [currentId, loadDetail]);

  const selectOrganization = (id: string) => {
    setCurrentId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  const reload = useCallback(async () => {
    if (currentId) await loadDetail(currentId);
  }, [currentId, loadDetail]);

  return (
    <OrgContext.Provider value={{ organizations, current, selectOrganization, reload, setCurrent }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrganization debe usarse dentro de <OrganizationProvider>');
  return ctx;
}

export function canManage(role: OrgRole | undefined) {
  return role === 'OWNER' || role === 'ADMIN';
}
