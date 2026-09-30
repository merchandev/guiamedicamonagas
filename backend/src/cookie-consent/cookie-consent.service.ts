import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordConsentDto, UpdateCookieConfigDto } from './dto/cookie-consent.dto';

const COOKIE_CONFIG_KEY = 'cookie_config';

const DEFAULT_CONFIG: UpdateCookieConfigDto = {
  message:
    'Usamos solo lo necesario para que el sitio funcione y sea seguro. Con tu permiso, también contamos visitas y clics de forma anónima para mejorar el directorio. No usamos publicidad ni rastreo de terceros.',
  necessaryDescription: 'Imprescindibles para iniciar sesión y proteger tu cuenta. Siempre activas.',
  analyticsDescription: 'Conteos anónimos de visitas a perfiles y clics en WhatsApp o teléfono, sin tu IP ni tu navegador.',
  marketingDescription: 'No usamos cookies de publicidad ni de marketing.',
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
