import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordConsentDto, UpdateCookieConfigDto } from './dto/cookie-consent.dto';

const COOKIE_CONFIG_KEY = 'cookie_config';

const DEFAULT_CONFIG: UpdateCookieConfigDto = {
  message:
    'Usamos cookies necesarias para el funcionamiento del sitio y, con tu permiso, cookies de análisis y marketing para mejorar tu experiencia.',
  necessaryDescription: 'Imprescindibles para que el sitio funcione (sesión, seguridad). Siempre activas.',
  analyticsDescription: 'Nos ayudan a entender cómo se usa el sitio para mejorarlo.',
  marketingDescription: 'Usadas para mostrar contenido y anuncios relevantes.',
};

@Injectable()
export class CookieConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<UpdateCookieConfigDto> {
    const row = await this.prisma.siteSettings.findUnique({ where: { key: COOKIE_CONFIG_KEY } });
    return { ...DEFAULT_CONFIG, ...(row?.value as Partial<UpdateCookieConfigDto> | undefined) };
  }

  async updateConfig(dto: UpdateCookieConfigDto) {
    await this.prisma.siteSettings.upsert({
      where: { key: COOKIE_CONFIG_KEY },
      create: { key: COOKIE_CONFIG_KEY, value: dto as never },
      update: { value: dto as never },
    });
    return this.getConfig();
  }

  async record(dto: RecordConsentDto, ipAddress?: string, userAgent?: string) {
    await this.prisma.cookieConsent.create({
      data: {
        subjectId: dto.subjectId,
        analytics: dto.analytics,
        marketing: dto.marketing,
        ipAddress,
        userAgent,
      },
    });
    return { message: 'Preferencias guardadas' };
  }
}
