import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import type { EnvConfig } from '../config/env.validation';
import type { UploadedFileData } from '../common/utils/multipart';
import { scanWithClamav } from './clamav.scanner';
import { detectFileType, EXTENSION_BY_MIME, findActivePdfContent, SafeMimeType } from './file-inspection';

export const IMAGE_TYPES: SafeMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
export const DOCUMENT_TYPES: SafeMimeType[] = [...IMAGE_TYPES, 'application/pdf'];

const MAX_IMAGE_SIDE = 2400;
// Defensa contra "bombas de descompresión": una imagen pequeña en bytes que
// declara dimensiones gigantescas al decodificarse.
const MAX_INPUT_PIXELS = 40_000_000;

export interface SecuredFile {
  buffer: Buffer;
  mimetype: SafeMimeType;
  extension: string;
  size: number;
}

/**
 * SEC-04 — toda subida pasa por aquí antes de llegar al almacenamiento:
 *  1. Tipo real por magic bytes (el MIME declarado por el cliente se ignora).
 *  2. Imágenes: se decodifican y RE-CODIFICAN con sharp. El archivo guardado
 *     es una imagen nueva generada por el servidor: sin EXIF/GPS, sin datos
 *     anexados tras el final de la imagen, sin polyglots.
 *  3. PDF: se rechazan los que contienen JavaScript, acciones de lanzamiento
 *     o archivos incrustados.
 *  4. Antivirus ClamAV si CLAMAV_HOST está configurado (falla cerrado: si
 *     está configurado y no responde, la subida se rechaza).
 */
@Injectable()
export class UploadSecurityService {
  private readonly logger = new Logger(UploadSecurityService.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async secure(file: UploadedFileData, allowed: SafeMimeType[]): Promise<SecuredFile> {
    const detected = detectFileType(file.buffer);
    if (!detected || !allowed.includes(detected)) {
      throw new UnsupportedMediaTypeException(
        `El contenido del archivo no corresponde a un tipo permitido (${allowed.map((m) => EXTENSION_BY_MIME[m].toUpperCase()).join(', ')})`,
      );
    }

    await this.scanForMalware(file.buffer);

    if (detected === 'application/pdf') {
      const activeContent = findActivePdfContent(file.buffer);
      if (activeContent) {
        throw new UnprocessableEntityException(
          'El PDF contiene contenido activo (scripts, acciones o archivos incrustados). Expórtalo o escanéalo de nuevo como PDF simple.',
        );
      }
      return { buffer: file.buffer, mimetype: detected, extension: 'pdf', size: file.buffer.length };
    }

    const buffer = await this.reencodeImage(file.buffer, detected);
    return { buffer, mimetype: detected, extension: EXTENSION_BY_MIME[detected], size: buffer.length };
  }

  private async reencodeImage(input: Buffer, type: SafeMimeType): Promise<Buffer> {
    try {
      const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true });
      if (type === 'image/png') return await pipeline.png({ compressionLevel: 9 }).toBuffer();
      if (type === 'image/webp') return await pipeline.webp({ quality: 85 }).toBuffer();
      return await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    } catch {
      throw new UnprocessableEntityException('La imagen está dañada o no se pudo procesar');
    }
  }

  private async scanForMalware(buffer: Buffer) {
    const host = this.config.get('CLAMAV_HOST', { infer: true });
    if (!host) return;
    const port = this.config.get('CLAMAV_PORT', { infer: true });
    let signature: string | null;
    try {
      signature = await scanWithClamav(host, port, buffer);
    } catch (error) {
      this.logger.error(`ClamAV no disponible: ${(error as Error).message}`);
      throw new ServiceUnavailableException('El análisis antivirus no está disponible; intenta de nuevo en unos minutos');
    }
    if (signature) {
      this.logger.warn(`Archivo rechazado por ClamAV: ${signature}`);
      throw new UnprocessableEntityException('El archivo fue rechazado por el análisis antivirus');
    }
  }
}
