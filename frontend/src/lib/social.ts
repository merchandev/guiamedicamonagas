import type { ComponentType, SVGProps } from 'react';
import { FacebookIcon, GlobeIcon, InstagramIcon, TikTokIcon } from '@/components/icons';
import type { PlanTier } from './types';

export type SocialPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'WEBSITE';

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  WEBSITE: 'Sitio web',
};

export const SOCIAL_PLATFORM_ICONS: Record<SocialPlatform, ComponentType<SVGProps<SVGSVGElement>>> = {
  INSTAGRAM: InstagramIcon,
  FACEBOOK: FacebookIcon,
  TIKTOK: TikTokIcon,
  WEBSITE: GlobeIcon,
};

export const SOCIAL_PLATFORM_COLORS: Record<SocialPlatform, string> = {
  INSTAGRAM: 'text-pink-600 bg-pink-50 hover:bg-pink-100',
  FACEBOOK: 'text-blue-600 bg-blue-50 hover:bg-blue-100',
  TIKTOK: 'text-ink-900 bg-ink-100 hover:bg-ink-200',
  WEBSITE: 'text-pine-700 bg-pine-50 hover:bg-pine-100',
};

export const SOCIAL_PLATFORM_EXAMPLE: Record<SocialPlatform, string> = {
  INSTAGRAM: 'https://instagram.com/tu_usuario',
  FACEBOOK: 'https://facebook.com/tu_pagina',
  TIKTOK: 'https://tiktok.com/@tu_usuario',
  WEBSITE: 'https://tu-sitio.com',
};

/**
 * Solo para feedback inmediato en el formulario. El backend vuelve a validar
 * todo con las mismas reglas: nunca confiar solo en esto.
 */
export const SOCIAL_URL_PATTERNS: Record<SocialPlatform, RegExp> = {
  INSTAGRAM: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]{1,60}\/?$/,
  FACEBOOK: /^https:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.\-_/]{1,150}\/?$/,
  TIKTOK: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]{1,60}\/?$/,
  WEBSITE: /^https:\/\/[^\s]{3,300}$/,
};

/**
 * Redes/web permitidas por plan de médico. El WhatsApp no vive aquí: es un
 * campo aparte, ya desbloqueado desde el plan Profesional.
 */
export const DOCTOR_SOCIAL_LIMITS: Record<PlanTier, { maxLinks: number; allowedPlatforms: SocialPlatform[] }> = {
  FREE: { maxLinks: 0, allowedPlatforms: [] },
  PROFESSIONAL: { maxLinks: 0, allowedPlatforms: [] },
  PROFESSIONAL_PLUS: { maxLinks: 2, allowedPlatforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK'] },
  PREMIUM: { maxLinks: 4, allowedPlatforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'] },
  ORGANIZATION: { maxLinks: 4, allowedPlatforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'] },
};
