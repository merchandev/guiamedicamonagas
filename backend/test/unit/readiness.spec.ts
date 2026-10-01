import { describe, expect, it } from 'vitest';
import { pingClamav, ReadinessService } from '../../src/health/readiness.service';

// Servicio con dependencias simuladas: cada una responde, falla o tarda.
const serviceWith = (deps: {
  db?: () => Promise<unknown>;
  storage?: () => Promise<unknown>;
  mail?: () => Promise<unknown>;
  failedEmails?: number;
  clamHost?: string;
}) =>
  new ReadinessService(
    { get: (k: string) => (k === 'CLAMAV_HOST' ? (deps.clamHost ?? '') : 3310) } as never,
    {
      $queryRaw: () => (deps.db ?? (() => Promise.resolve([1])))(),
      messageLog: { count: () => Promise.resolve(deps.failedEmails ?? 0) },
    } as never,
    { ping: deps.storage ?? (() => Promise.resolve()) } as never,
    { verifyConnection: deps.mail ?? (() => Promise.resolve()) } as never,
  );

describe('Estado de las dependencias (/health/ready)', () => {
  it('todo responde: ok, y el antivirus sin configurar figura como «off»', async () => {
    const report = await serviceWith({ failedEmails: 2 }).check();
    expect(report).toEqual({
      status: 'ok',
      checks: { database: 'ok', storage: 'ok', antivirus: 'off', mail: 'ok' },
      failedEmailsLastHour: 2,
    });
  });

  it('una dependencia caída deja el estado «degraded» y dice cuál, sin el mensaje de error', async () => {
    const report = await serviceWith({ mail: () => Promise.reject(new Error('535 credenciales inválidas en smtp.ejemplo')) }).check();
    expect(report.status).toBe('degraded');
    expect(report.checks.mail).toBe('fail');
    expect(JSON.stringify(report)).not.toMatch(/535|smtp\.ejemplo/);
  });

  it('sin base de datos no se cuentan correos fallidos', async () => {
    const report = await serviceWith({ db: () => Promise.reject(new Error('down')), failedEmails: 9 }).check();
    expect(report.checks.database).toBe('fail');
    expect(report.failedEmailsLastHour).toBe(0);
  });

  it('ClamAV configurado pero sin respuesta: «fail»', async () => {
    // Puerto 1: nadie escucha, la conexión se rechaza al instante.
    await expect(pingClamav('127.0.0.1', 1)).rejects.toThrow();
    const service = new ReadinessService(
      { get: (k: string) => (k === 'CLAMAV_HOST' ? '127.0.0.1' : 1) } as never,
      { $queryRaw: () => Promise.resolve([1]), messageLog: { count: () => Promise.resolve(0) } } as never,
      { ping: () => Promise.resolve() } as never,
      { verifyConnection: () => Promise.resolve() } as never,
    );
    expect((await service.check()).checks.antivirus).toBe('fail');
  });
});

const clamHost = process.env.CLAMAV_TEST_HOST;
const clamPort = Number(process.env.CLAMAV_TEST_PORT ?? 3310);

describe.skipIf(!clamHost)('ClamAV real', () => {
  it('responde PONG al PING', async () => {
    await expect(pingClamav(clamHost!, clamPort)).resolves.toBeUndefined();
  });
});
