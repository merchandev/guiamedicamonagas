import { BadRequestException } from '@nestjs/common';
import { PlanTier, SocialPlatform } from '@prisma/client';

/** Orden de prioridad de los planes de médicos (mayor = más beneficios/prioridad). */
export const DOCTOR_TIER_RANK: Record<PlanTier, number> = {
  FREE: 0,
  PROFESSIONAL: 1,
  PROFESSIONAL_PLUS: 2,
  PREMIUM: 3,
  ORGANIZATION: 0,
};

export function tierAtLeast(tier: PlanTier, min: PlanTier): boolean {
  return DOCTOR_TIER_RANK[tier] >= DOCTOR_TIER_RANK[min];
}

/**
 * Redes sociales/web permitidas por plan. El WhatsApp NO vive aquí: es un
 * campo aparte, ya desbloqueado desde el plan Profesional.
 * - Profesional Plus: hasta 2 redes (Instagram/Facebook/TikTok), sin web.
 * - Premium y Organización: las 3 redes + el ícono de Web.
 */
export const SOCIAL_LINK_LIMITS: Record<PlanTier, { maxLinks: number; allowedPlatforms: SocialPlatform[] }> = {
  FREE: { maxLinks: 0, allowedPlatforms: [] },
  PROFESSIONAL: { maxLinks: 0, allowedPlatforms: [] },
  PROFESSIONAL_PLUS: { maxLinks: 2, allowedPlatforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK'] },
  PREMIUM: { maxLinks: 4, allowedPlatforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'] },
  ORGANIZATION: { maxLinks: 4, allowedPlatforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'] },
};

/** Solo se aceptan URLs oficiales de cada red: nunca un dominio distinto. */
export const SOCIAL_URL_PATTERNS: Record<SocialPlatform, RegExp> = {
  INSTAGRAM: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]{1,60}\/?$/,
  FACEBOOK: /^https:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.\-_/]{1,150}\/?$/,
  TIKTOK: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]{1,60}\/?$/,
  WEBSITE: /^https:\/\/[^\s]{3,300}$/,
};

export const SOCIAL_PLATFORM_EXAMPLE: Record<SocialPlatform, string> = {
  INSTAGRAM: 'https://instagram.com/tu_usuario',
  FACEBOOK: 'https://facebook.com/tu_pagina',
  TIKTOK: 'https://tiktok.com/@tu_usuario',
  WEBSITE: 'https://tu-sitio.com',
};

/**
 * Valida un set completo de redes/web contra los límites del plan: cantidad,
 * plataformas permitidas, sin repetir plataforma y URL oficial por red.
 * Lanza BadRequestException con el primer problema encontrado.
 */
export function assertValidSocialLinks(links: { platform: SocialPlatform; url: string }[], tier: PlanTier) {
  const limits = SOCIAL_LINK_LIMITS[tier];
  if (links.length > limits.maxLinks) {
    throw new BadRequestException(
      limits.maxLinks === 0
        ? 'Tu plan no permite agregar redes sociales ni web'
        : `Tu plan permite hasta ${limits.maxLinks} red(es)/web`,
    );
  }
  const seen = new Set<SocialPlatform>();
  for (const link of links) {
    if (!limits.allowedPlatforms.includes(link.platform)) {
      throw new BadRequestException(`Tu plan no incluye el ícono de ${link.platform}`);
    }
    if (seen.has(link.platform)) {
      throw new BadRequestException('No puedes agregar la misma red social dos veces');
    }
    seen.add(link.platform);
    if (!SOCIAL_URL_PATTERNS[link.platform].test(link.url)) {
      throw new BadRequestException(
        `La URL de ${link.platform} debe ser la oficial, por ejemplo ${SOCIAL_PLATFORM_EXAMPLE[link.platform]}`,
      );
    }
  }
}

export const SITE_SETTINGS_EXCHANGE_RATE_KEY = 'exchange_rate';

export type ExchangeRateSource = 'BCV' | 'MANUAL';

export interface ExchangeRateConfig {
  usdToBs: number;
  updatedAt: string;
  source: ExchangeRateSource;
  /** Solo presente cuando source es BCV: cuándo se sincronizó exitosamente por última vez. */
  lastBcvSyncAt?: string;
  /** Mensaje del último intento fallido de sincronización con el BCV, si aplica. */
  lastBcvSyncError?: string;
}
