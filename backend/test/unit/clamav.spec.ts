import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { scanWithClamav } from '../../src/uploads/clamav.scanner';
import { DOCUMENT_TYPES, IMAGE_TYPES, UploadSecurityService } from '../../src/uploads/upload-security.service';

// Archivo de prueba estándar EICAR (68 bytes, inofensivo), en base64 para que
// este archivo fuente no dispare a ningún antivirus del equipo de desarrollo.
const EICAR = Buffer.from(
  'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=',
  'base64',
);

const serviceFor = (host: string, port: number) =>
  new UploadSecurityService({ get: (k: string) => (k === 'CLAMAV_HOST' ? host : port) } as never);
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#0f6e5c' } }).png().toBuffer();
const raw = (buffer: Buffer) => ({ buffer, filename: 'foto.png', declaredMimetype: 'image/png', size: buffer.length });

describe('ClamAV caído: la subida se rechaza (falla cerrado)', () => {
  it('sin respuesta de clamd no se acepta ningún archivo', async () => {
    // Puerto 1: nadie escucha, la conexión se rechaza al instante.
    await expect(serviceFor('127.0.0.1', 1).secure(raw(await png()), IMAGE_TYPES)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

// Contra un clamd real: en CI hay un contenedor ClamAV y CLAMAV_TEST_HOST lo
// apunta; en desarrollo sin antivirus local, se omite.
const clamHost = process.env.CLAMAV_TEST_HOST;
const clamPort = Number(process.env.CLAMAV_TEST_PORT ?? 3310);

describe.skipIf(!clamHost)('ClamAV real', () => {
  it('detecta EICAR', async () => {
    expect(await scanWithClamav(clamHost!, clamPort, EICAR)).toMatch(/eicar/i);
  });

  it('deja pasar un archivo limpio', async () => {
    expect(await scanWithClamav(clamHost!, clamPort, await png())).toBeNull();
  });

  it('la subida de una imagen real pasa por el antivirus y se acepta', async () => {
    const secured = await serviceFor(clamHost!, clamPort).secure(raw(await png()), DOCUMENT_TYPES);
    expect(secured.mimetype).toBe('image/png');
  });

  it('un PDF que el antivirus marca se rechaza (422), aunque su formato sea válido', async () => {
    // PDF mínimo con el patrón EICAR incrustado: pasa la verificación de
    // formato, así que solo lo detiene el análisis antivirus si lo reconoce.
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), EICAR, Buffer.from('\n%%EOF\n')]);
    const verdict = await scanWithClamav(clamHost!, clamPort, pdf);
    if (verdict) {
      await expect(serviceFor(clamHost!, clamPort).secure(raw(pdf), DOCUMENT_TYPES)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    }
  });
});
