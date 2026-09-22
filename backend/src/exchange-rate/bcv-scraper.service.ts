import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as cheerio from 'cheerio';
import { ExchangeRateService } from './exchange-rate.service';

const BCV_URL = 'https://www.bcv.org.ve/';
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Obtiene el tipo de cambio oficial USD del sitio del BCV (scraping del
 * bloque `#dolar` de su home) y lo guarda como la tasa vigente de la
 * plataforma. El BCV publica la tasa una vez al día, así que sincronizamos
 * cada hora — suficiente para reflejar el cambio del día sin martillar su
 * servidor — más una vez al iniciar el backend.
 */
@Injectable()
export class BcvScraperService implements OnModuleInit {
  private readonly logger = new Logger(BcvScraperService.name);
  private syncing = false;

  constructor(private readonly exchangeRate: ExchangeRateService) {}

  async onModuleInit() {
    // No bloquea el arranque del backend: corre en segundo plano.
    void this.syncNow();
  }

  @Cron('0 * * * *')
  async scheduledSync() {
    await this.syncNow();
  }

  /** Descarga y parsea la home del BCV. Nunca lanza: siempre resuelve con éxito o registra el fallo. */
  async syncNow(): Promise<{ ok: true; usdToBs: number } | { ok: false; error: string }> {
    if (this.syncing) {
      return { ok: false, error: 'Ya hay una sincronización en curso' };
    }
    this.syncing = true;
    try {
      const usdToBs = await this.fetchRate();
      await this.exchangeRate.setFromBcv(usdToBs);
      return { ok: true, usdToBs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      await this.exchangeRate.recordBcvSyncFailure(message);
      return { ok: false, error: message };
    } finally {
      this.syncing = false;
    }
  }

  private async fetchRate(): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let html: string;
    try {
      const response = await fetch(BCV_URL, {
        signal: controller.signal,
        headers: {
          // Un user-agent de navegador evita bloqueos por parte del WAF del BCV.
          'User-Agent': 'Mozilla/5.0 (compatible; GuiaMedicaMonagas/1.0; +https://guiamedicamonagas.com)',
        },
      });
      if (!response.ok) {
        throw new Error(`El sitio del BCV respondió con estado ${response.status}`);
      }
      html = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    const $ = cheerio.load(html);
    const rawValue = $('#dolar .strong-tb').first().text().trim();
    if (!rawValue) {
      throw new Error('No se encontró el valor del dólar en la página del BCV (el sitio pudo haber cambiado)');
    }

    // Formato venezolano: punto como separador de miles, coma como decimal (ej. "1.852,4168").
    const normalized = rawValue.replace(/\./g, '').replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Valor de tasa inválido recibido del BCV: "${rawValue}"`);
    }

    return value;
  }
}
