import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Envío de notificaciones por WhatsApp usando la API oficial de Meta
 * (WhatsApp Cloud API). Requiere WHATSAPP_ACCESS_TOKEN y
 * WHATSAPP_PHONE_NUMBER_ID configurados; si WHATSAPP_ENABLED=false el
 * servicio solo registra el intento (útil en desarrollo sin credenciales).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly enabled: boolean;
  private readonly apiVersion: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  readonly adminNumber: string;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    this.enabled = this.config.get('WHATSAPP_ENABLED', { infer: true });
    this.apiVersion = this.config.get('WHATSAPP_API_VERSION', { infer: true });
    this.phoneNumberId = this.config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true });
    this.accessToken = this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true });
    this.adminNumber = this.config.get('WHATSAPP_ADMIN_NUMBER', { infer: true });
  }

  /** Convierte un número local venezolano (0414-1234567) al formato E.164 sin "+" que exige la Cloud API (584141234567). */
  private normalizeNumber(raw: string): string {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return '';
    if (digits.startsWith('58')) return digits;
    return `58${digits.replace(/^0/, '')}`;
  }

  /** Envío best-effort de texto libre; nunca lanza, siempre queda auditado. */
  async sendText(rawTo: string, template: string, body: string, relatedUserId?: string): Promise<void> {
    const to = this.normalizeNumber(rawTo);
    if (!to) return;

    if (!this.enabled || !this.accessToken || !this.phoneNumberId) {
      this.logger.debug(`WhatsApp deshabilitado; se omitió el envío a ${to} (${template})`);
      await this.log(to, template, 'SKIPPED', relatedUserId, 'WhatsApp no configurado');
      return;
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body },
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      await this.log(to, template, 'SENT', relatedUserId);
    } catch (error) {
      this.logger.error(`Fallo al enviar WhatsApp a ${to}: ${(error as Error).message}`);
      await this.log(to, template, 'FAILED', relatedUserId, (error as Error).message);
    }
  }

  private async log(
    to: string,
    template: string,
    status: 'SENT' | 'FAILED' | 'SKIPPED',
    relatedUserId?: string,
    errorMessage?: string,
  ) {
    await this.prisma.messageLog
      .create({
        data: {
          channel: 'WHATSAPP',
          recipient: to,
          template,
          status,
          errorMessage,
          relatedUserId,
        },
      })
      .catch((err) => this.logger.warn(`No se pudo registrar MessageLog: ${err.message}`));
  }
}
