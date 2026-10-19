import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { EnvConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/** Los campos de la clave de cuenta de servicio de Firebase que usamos. */
interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface MobilePushInput {
  userId: string;
  title: string;
  body: string;
  /** Ruta interna del sitio/app a la que lleva el aviso («/dashboard/citas»). */
  link?: string | null;
  /** Tipo de aviso (mismo que la campana), por si la app quiere diferenciarlo. */
  type?: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * Envía notificaciones push a los teléfonos (Firebase Cloud Messaging v1) sin
 * ninguna dependencia nueva: firma un JWT con la clave de cuenta de servicio
 * usando el `crypto` nativo de Node y lo cambia por un token de acceso de
 * Google. En Android, FCM es la única vía para entregar un aviso con la app
 * cerrada, así que el servidor habla directo con FCM (no con un intermediario).
 *
 * Si no hay clave configurada (`FCM_SERVICE_ACCOUNT_FILE`/`_JSON`), el servicio
 * queda inactivo y `sendToUser` no hace nada: dev local y los tests siguen
 * igual, sin tocar Google.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly account: ServiceAccount | null;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.account = this.loadAccount(config);
    if (!this.account) {
      this.logger.log('FCM sin configurar: las notificaciones push al móvil quedan desactivadas.');
    } else {
      this.logger.log(`FCM activo para el proyecto ${this.account.project_id}.`);
    }
  }

  get enabled(): boolean {
    return this.account !== null;
  }

  private loadAccount(config: ConfigService<EnvConfig, true>): ServiceAccount | null {
    const inline = config.get('FCM_SERVICE_ACCOUNT_JSON', { infer: true });
    const file = config.get('FCM_SERVICE_ACCOUNT_FILE', { infer: true });
    let raw = '';
    try {
      if (inline) raw = inline;
      else if (file) raw = readFileSync(file, 'utf8');
      if (!raw.trim()) return null;
      const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
      if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
        this.logger.warn(
          'La clave de servicio FCM no tiene client_email/private_key/project_id; push desactivado.',
        );
        return null;
      }
      return parsed as ServiceAccount;
    } catch (error) {
      this.logger.warn(`No se pudo leer la clave de servicio FCM: ${(error as Error).message}`);
      return null;
    }
  }

  /** Envía el aviso a todas las instalaciones (tokens) del usuario. Best-effort. */
  async sendToUser(input: MobilePushInput): Promise<void> {
    if (!this.account) return;
    const tokens = await this.prisma.mobilePushToken.findMany({
      where: { userId: input.userId },
      select: { token: true },
    });
    if (!tokens.length) return;

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken();
    } catch (error) {
      this.logger.warn(`No se pudo obtener el token de acceso de FCM: ${(error as Error).message}`);
      return;
    }

    await Promise.allSettled(tokens.map((t) => this.sendOne(accessToken, t.token, input)));
  }

  private async sendOne(accessToken: string, token: string, input: MobilePushInput): Promise<void> {
    const data: Record<string, string> = {};
    if (input.link) data.link = input.link;
    if (input.type) data.type = input.type;

    const message = {
      message: {
        token,
        notification: { title: input.title, body: input.body },
        data,
        android: {
          priority: 'HIGH' as const,
          notification: { channelId: 'default' },
        },
      },
    };

    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.account!.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        },
      );
      if (res.ok) return;

      const errBody = await res.text().catch(() => '');
      // Solo se borra ante la señal inequívoca de token muerto (app desinstalada
      // o token rotado). NO se borra ante INVALID_ARGUMENT genérico: un error de
      // forma del mensaje devolvería eso para TODOS y vaciaría la tabla de tokens.
      if (res.status === 404 || /UNREGISTERED|NOT_FOUND/.test(errBody)) {
        await this.prisma.mobilePushToken.deleteMany({ where: { token } }).catch(() => undefined);
        return;
      }
      this.logger.warn(`FCM respondió ${res.status}: ${errBody.slice(0, 200)}`);
    } catch (error) {
      this.logger.warn(`Fallo al enviar push por FCM: ${(error as Error).message}`);
    }
  }

  /** Token de acceso OAuth2 de Google, cacheado hasta un minuto antes de expirar. */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.accessToken.expiresAt > now + 60_000) {
      return this.accessToken.value;
    }
    const assertion = this.buildJwt(now);
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`token endpoint ${res.status}: ${body.slice(0, 160)}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = {
      value: json.access_token,
      expiresAt: now + json.expires_in * 1000,
    };
    return json.access_token;
  }

  /** JWT firmado (RS256) con la clave privada de la cuenta de servicio. */
  private buildJwt(now: number): string {
    const account = this.account!;
    const iat = Math.floor(now / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    };
    const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signingInput = `${encode(header)}.${encode(claim)}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(account.private_key, 'base64url');
    return `${signingInput}.${signature}`;
  }
}
