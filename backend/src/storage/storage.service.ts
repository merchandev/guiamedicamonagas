import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { EnvConfig } from '../config/env.validation';

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.bucket = this.config.get('S3_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: this.config.get('S3_ENDPOINT', { infer: true }),
      region: this.config.get('S3_REGION', { infer: true }),
      forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: this.config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: this.config.get('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket "${this.bucket}" creado`);
      } catch (error) {
        this.logger.warn(
          `No se pudo verificar/crear el bucket "${this.bucket}": ${(error as Error).message}`,
        );
      }
    }
  }

  buildKey(prefix: string, originalFileName: string): string {
    const ext = originalFileName.split('.').pop()?.toLowerCase().slice(0, 8) ?? 'bin';
    return `${prefix}/${randomUUID()}.${ext}`;
  }

  async uploadPrivateObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'private',
      }),
    );
  }

  /**
   * Genera una URL firmada de solo lectura. `forceDownload` (por defecto true)
   * añade `Content-Disposition: attachment` para que el navegador descargue el
   * archivo en vez de intentar renderizarlo inline — evita MIME-sniffing de un
   * documento con contenido disfrazado bajo un tipo MIME permitido. Se
   * desactiva solo para recursos pensados para incrustarse (p.ej. fotos de
   * perfil en un <img>).
   */
  async getSignedDownloadUrl(key: string, expiresInSeconds = 300, forceDownload = true): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: forceDownload ? 'attachment' : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
