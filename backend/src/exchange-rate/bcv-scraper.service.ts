import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import { get } from 'node:https';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
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
      const { usdToBs, effectiveDate } = await this.fetchRate();
      await this.exchangeRate.setFromBcv(usdToBs, effectiveDate);
      return { ok: true, usdToBs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      await this.exchangeRate.recordBcvSyncFailure(message);
      return { ok: false, error: message };
    } finally {
      this.syncing = false;
    }
  }

  private async fetchRate(): Promise<{ usdToBs: number; effectiveDate: string }> {
    // BCV omite el certificado intermedio. Completar únicamente esta conexión,
    // conservando la validación de cadena, hostname y fechas (nunca desactivar TLS).
    const intermediate = readFileSync(join(process.cwd(), 'certs/sectigo-dv-r36.pem'), 'utf8');
    const html = await new Promise<string>((resolve, reject) => {
      const request = get(BCV_URL, {
        ca: [...rootCertificates, intermediate],
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuiaMedicaMonagas/1.0)' },
      }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`El sitio del BCV respondió con estado ${response.statusCode}`));
          return;
        }
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 2_000_000) request.destroy(new Error('Respuesta del BCV demasiado grande'));
        });
        response.on('end', () => resolve(body));
        response.on('error', reject);
      });
      request.on('error', reject);
    });
    return this.parseRate(html);
  }

  /** Separado de la conexión para probar cambios de formato y valores inválidos. */
  parseRate(html: string): { usdToBs: number; effectiveDate: string } {
    const $ = cheerio.load(html);
    const rawValue = $('#dolar .strong-tb').first().text().trim();
    if (!rawValue) {
      throw new Error('No se encontró el valor del dólar en la página del BCV (el sitio pudo haber cambiado)');
    }

    // Formato venezolano: punto como separador de miles, coma como decimal (ej. "1.852,4168").
    if (!/^\d+(?:\.\d{3})*,\d+$/.test(rawValue)) {
      throw new Error('Formato de tasa inesperado en el BCV');
    }
    const normalized = rawValue.replace(/\./g, '').replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Valor de tasa inválido recibido del BCV: "${rawValue}"`);
    }

    const date = $('#dolar').parent().find('.date-display-single').attr('content');
    if (!date || !/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date))) {
      throw new Error('No se encontró una fecha valor válida en el BCV');
    }
    return { usdToBs: value, effectiveDate: date.slice(0, 10) };
  }
}
