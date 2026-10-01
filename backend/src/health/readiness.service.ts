import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'net';
import type { EnvConfig } from '../config/env.validation';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** ok = responde · fail = no responde · off = no configurado (permitido fuera de producción). */
export type DependencyStatus = 'ok' | 'fail' | 'off';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: {
    database: DependencyStatus;
    storage: DependencyStatus;
    antivirus: DependencyStatus;
    mail: DependencyStatus;
  };
  /** Correos que no se pudieron entregar en la última hora (MessageLog). */
  failedEmailsLastHour: number;
}

const CHECK_TIMEOUT_MS = 5_000;

function withTimeout<T>(work: Promise<T>, ms = CHECK_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('sin respuesta a tiempo')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** PING del protocolo de clamd: responde PONG si el antivirus está en marcha. */
export function pingClamav(host: string, port: number, timeoutMs = CHECK_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let response = '';
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error('ClamAV no respondió a tiempo')));
    socket.on('error', fail);
    socket.on('data', (data) => {
      response += data.toString('utf8');
    });
    socket.on('end', () => {
      if (response.replace(/\0/g, '').trim() === 'PONG') resolve();
      else reject(new Error('Respuesta inesperada de ClamAV'));
    });
    socket.connect(port, host, () => socket.write('zPING\0'));
  });
}

/**
 * Estado de las dependencias de la API para el monitoreo del servidor
 * (scripts/healthcheck.sh). No devuelve mensajes de error ni direcciones:
 * solo qué dependencia falla.
 */
@Injectable()
export class ReadinessService {
  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async check(): Promise<ReadinessReport> {
    const clamHost = this.config.get('CLAMAV_HOST', { infer: true });
    const clamPort = this.config.get('CLAMAV_PORT', { infer: true });
    const [database, storage, antivirus, mail] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(() => this.storage.ping()),
      clamHost ? this.probe(() => pingClamav(clamHost, clamPort)) : Promise.resolve<DependencyStatus>('off'),
      this.probe(() => this.mail.verifyConnection()),
    ]);
    const failedEmailsLastHour =
      database === 'ok'
        ? await this.prisma.messageLog
            .count({ where: { channel: 'EMAIL', status: 'FAILED', createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
            .catch(() => 0)
        : 0;
    const checks = { database, storage, antivirus, mail };
    const healthy = Object.values(checks).every((s) => s !== 'fail');
    return { status: healthy ? 'ok' : 'degraded', checks, failedEmailsLastHour };
  }

  private async probe(run: () => Promise<unknown>): Promise<DependencyStatus> {
    try {
      await withTimeout(run());
      return 'ok';
    } catch {
      return 'fail';
    }
  }
}
