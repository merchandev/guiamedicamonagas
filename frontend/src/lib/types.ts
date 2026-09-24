import type { SocialLink } from './social';

export interface Specialty {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  _count?: { professionals: number };
}

export type PlanTier = 'FREE' | 'PROFESSIONAL' | 'PROFESSIONAL_PLUS' | 'PREMIUM' | 'ORGANIZATION';

export interface ProfessionalListItem {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  bio: string | null;
  mppsNumber: string | null;
  colmedMonagasNumber: string | null;
  inpremedicoNumber: string | null;
  municipality: string | null;
  whatsapp: string | null;
  isSpecialist: boolean;
  planTier: PlanTier;
  /** VERIFIED = 100% de documentos aprobados; si no, el perfil está público con verificación en curso. */
  verificationStatus: 'PENDING' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  isFeatured: boolean;
  canReceiveMessages: boolean;
  specialties: { specialty: Specialty }[];
}

export interface ProfessionalExtraLocation {
  id: string;
  name: string;
  address: string;
  municipality: string | null;
  phone: string | null;
  whatsapp: string | null;
}

export interface ProfessionalPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  createdAt: string;
}

export interface ProfessionalDetail extends ProfessionalListItem {
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  ogImageUrl: string | null;
  noIndex: boolean;
  verifiedAt: string | null;
  locations: ProfessionalExtraLocation[];
  posts: ProfessionalPost[];
  socialLinks: SocialLink[];
  bookingEnabled: boolean;
  registrations?: { type: string; issuer: string; jurisdiction: string | null; number: string; verifiedAt: string | null }[];
  organizations?: { organization: { slug: string; name: string; type: 'PHARMACY' | 'LABORATORY' | 'CLINIC' } }[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OrganizationLocation {
  id: string;
  name: string;
  address: string;
  municipality: string | null;
  phone: string | null;
  whatsapp: string | null;
}

export interface Organization {
  id: string;
  type: 'PHARMACY' | 'LABORATORY' | 'CLINIC';
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  rif?: string | null;
  openingHours?: string | null;
  services?: string[] | null;
  insurers?: string[] | null;
  paymentMethods?: string[] | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  locations: OrganizationLocation[];
  socialLinks: SocialLink[];
  professionals?: {
    professional: { id: string; slug: string; firstName: string; lastName: string; specialties: { specialty: { name: string; slug: string } }[] };
  }[];
}

export interface SubscriptionPlan {
  id: string;
  tier: PlanTier;
  name: string;
  description: string | null;
  priceUsd: string;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  features: string[] | null;
  maxLocations: number;
  postsLimit: number | null;
  isActive: boolean;
}

export const DOCUMENT_TYPES = [
  'TITULO_MEDICO',
  'REGISTRO_MPPS_SACS',
  'ARTICULO_8',
  'MATRICULA_COLEGIO_MONAGAS',
  'INPREMEDICO',
  'SOLVENCIA_DEONTOLOGICA',
  'TITULO_POSTGRADO',
  'CREDENCIAL_ESPECIALIDAD',
  'CEDULA_IDENTIDAD',
  'RIF',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface ProfessionalDocument {
  id: string;
  type: DocumentType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  originalFileName: string;
  reviewNote: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Barra de progreso del registro del médico (GET /professionals/me → progress). */
export interface ProfessionalProgressItem {
  key: string;
  label: string;
  done: boolean;
  fraction?: number;
  detail?: string;
  href?: string;
  requiredToPublish?: boolean;
  lockedUntil?: PlanTier;
}

export interface ProfessionalProgress {
  percent: number;
  items: ProfessionalProgressItem[];
  publication: { key: string; label: string; done: boolean }[];
  canPublish: boolean;
  fullDocuments: boolean;
  documents: { approved: number; required: number; minimumToPublish: number };
}
