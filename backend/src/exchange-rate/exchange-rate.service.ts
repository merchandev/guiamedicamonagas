import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRateConfig, SITE_SETTINGS_EXCHANGE_RATE_KEY } from '../subscriptions/plan-tiers';

const DEFAULT_EXCHANGE_RATE: ExchangeRateConfig = {
  usdToBs: 50,
  updatedAt: new Date(0).toISOString(),
  source: 'MANUAL',
};

/**
 * Fuente única de verdad para la tasa USD→Bs usada en toda la plataforma
 * (barra superior, dashboard, pasarela de pago). Se alimenta del scraping
 * del BCV (ver BcvScraperService) con la opción de que un admin la
 * sobrescriba manualmente si el BCV no está disponible.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ExchangeRateConfig> {
    const row = await this.prisma.siteSettings.findUnique({ where: { key: SITE_SETTINGS_EXCHANGE_RATE_KEY } });
    return { ...DEFAULT_EXCHANGE_RATE, ...(row?.value as Partial<ExchangeRateConfig> | undefined) };
  }

  async setManual(usdToBs: number): Promise<ExchangeRateConfig> {
    const value: ExchangeRateConfig = { usdToBs, updatedAt: new Date().toISOString(), source: 'MANUAL' };
    await this.persist(value);
    return value;
  }

  async setFromBcv(usdToBs: number): Promise<ExchangeRateConfig> {
    const now = new Date().toISOString();
    const value: ExchangeRateConfig = { usdToBs, updatedAt: now, source: 'BCV', lastBcvSyncAt: now };
    await this.persist(value);
    this.logger.log(`Tasa BCV sincronizada: 1 USD = ${usdToBs} Bs`);
    return value;
  }

  /** Registra un intento fallido de sincronización sin perder la última tasa válida conocida. */
  async recordBcvSyncFailure(errorMessage: string): Promise<void> {
    const current = await this.get();
    await this.persist({ ...current, lastBcvSyncError: errorMessage });
    this.logger.warn(`Fallo al sincronizar la tasa del BCV: ${errorMessage}`);
  }

  private async persist(value: ExchangeRateConfig) {
    await this.prisma.siteSettings.upsert({
      where: { key: SITE_SETTINGS_EXCHANGE_RATE_KEY },
      create: { key: SITE_SETTINGS_EXCHANGE_RATE_KEY, value: value as never },
      update: { value: value as never },
    });
  }
}
