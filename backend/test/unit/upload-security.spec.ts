import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectFileType, findActivePdfContent } from '../../src/uploads/file-inspection';
import { IMAGE_TYPES, DOCUMENT_TYPES, UploadSecurityService } from '../../src/uploads/upload-security.service';
import { sanitizeFileName } from '../../src/documents/documents.service';

const config = { get: (k: string) => (k === 'CLAMAV_PORT' ? 3310 : '') } as never;
const security = new UploadSecurityService(config);
const raw = (buffer: Buffer, declared = 'image/jpeg') => ({ buffer, filename: 'x.jpg', declaredMimetype: declared, size: buffer.length });

async function jpegWithGps() {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: '#0f6e5c' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'SECRETO-EXIF', ImageDescription: 'Casa del paciente' } })
    .toBuffer();
}

describe('detectFileType (magic bytes)', () => {
  it('reconoce los formatos reales', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
    const webp = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).webp().toBuffer();
    expect(detectFileType(await jpegWithGps())).toBe('image/jpeg');
    expect(detectFileType(png)).toBe('image/png');
    expect(detectFileType(webp)).toBe('image/webp');
    expect(detectFileType(Buffer.from('%PDF-1.7\n1 0 obj'))).toBe('application/pdf');
  });

  it('un script renombrado a .jpg no pasa, diga lo que diga el MIME', () => {
    expect(detectFileType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00 ejecutable'))).toBeNull();
  });
});

describe('findActivePdfContent', () => {
  it('detecta JavaScript, también con escapes #xx', () => {
    expect(findActivePdfContent(Buffer.from('%PDF-1.4 /OpenAction << /S /JavaScript /JS (app.alert(1)) >>'))).toBe('/JavaScript');
    expect(findActivePdfContent(Buffer.from('%PDF-1.4 << /S /J#61vaScript >>'))).toBe('/JavaScript');
    expect(findActivePdfContent(Buffer.from('%PDF-1.4 << /Launch /F (cmd.exe) >>'))).toBe('/Launch');
    expect(findActivePdfContent(Buffer.from('%PDF-1.4 << /Type /EmbeddedFile >>'))).toBe('/EmbeddedFile');
  });

  it('no confunde bytes de una imagen o texto comprimido con una acción (PDF escaneado)', () => {
    // Datos binarios de un flujo que contienen por azar "/JS " y "/XFA)".
    const binary = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj << /Type /XObject /Subtype /Image /Length 40 >>\nstream\n'),
      Buffer.from([0x9c, 0x2f, 0x4a, 0x53, 0x20, 0xff, 0x2f, 0x58, 0x46, 0x41, 0x29, 0x00]),
      Buffer.from('\nendstream\nendobj\n'),
    ]);
    expect(findActivePdfContent(binary)).toBeNull();
    // Pero una acción real, fuera del flujo, se sigue detectando.
    expect(findActivePdfContent(Buffer.concat([binary, Buffer.from('2 0 obj << /S /JavaScript /JS (x) >> endobj')]))).toBe('/JavaScript');
  });

  it('no marca un PDF simple ni nombres parecidos', () => {
    expect(findActivePdfContent(Buffer.from('%PDF-1.4 << /Type /Page /JSON_like /Font >>'))).toBeNull();
  });
});

describe('UploadSecurityService.secure', () => {
  it('rechaza contenido que no es imagen aunque se declare image/jpeg', async () => {
    await expect(security.secure(raw(Buffer.from('<?php system($_GET[1]); ?>')), IMAGE_TYPES)).rejects.toThrow(/no corresponde/);
  });

  it('rechaza un PDF donde solo se aceptan imágenes', async () => {
    await expect(security.secure(raw(Buffer.from('%PDF-1.7 minimal')), IMAGE_TYPES)).rejects.toThrow(/no corresponde/);
  });

  it('re-codifica imágenes: elimina EXIF y datos anexados (polyglot)', async () => {
    const original = Buffer.concat([await jpegWithGps(), Buffer.from('PK\x03\x04 zip oculto <script>')]);
    expect(original.toString('latin1')).toContain('SECRETO-EXIF');
    const secured = await security.secure(raw(original), IMAGE_TYPES);
    const text = secured.buffer.toString('latin1');
    expect(secured.mimetype).toBe('image/jpeg');
    expect(secured.extension).toBe('jpg');
    expect(text).not.toContain('SECRETO-EXIF');
    expect(text).not.toContain('zip oculto');
    expect((await sharp(secured.buffer).metadata()).exif).toBeUndefined();
  });

  it('rechaza PDF con JavaScript y acepta uno simple', async () => {
    await expect(security.secure(raw(Buffer.from('%PDF-1.4 /JS (x)'), 'application/pdf'), DOCUMENT_TYPES)).rejects.toThrow(/contenido activo/);
    const ok = await security.secure(raw(Buffer.from('%PDF-1.4\n%%EOF'), 'application/pdf'), DOCUMENT_TYPES);
    expect(ok.extension).toBe('pdf');
  });

  it('rechaza imágenes dañadas', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50, 1)]);
    await expect(security.secure(raw(broken), IMAGE_TYPES)).rejects.toThrow(/dañada/);
  });
});

describe('sanitizeFileName', () => {
  it('quita rutas y caracteres peligrosos y usa la extensión real', () => {
    expect(sanitizeFileName('..\\..\\windows\\evil<>.exe', 'pdf')).toBe('evil.pdf');
    expect(sanitizeFileName('../../etc/passwd', 'jpg')).toBe('passwd.jpg');
    expect(sanitizeFileName('', 'png')).toBe('documento.png');
  });
});
