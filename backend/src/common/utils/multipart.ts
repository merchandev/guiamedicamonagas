import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export interface UploadedFileData {
  buffer: Buffer;
  filename: string;
  /** MIME declarado por el cliente: solo informativo, NUNCA para decidir el tipo (ver UploadSecurityService). */
  declaredMimetype: string;
  size: number;
}

/**
 * Lee un único archivo de un request multipart/form-data (Fastify) con tope
 * de tamaño. El tipo real se valida después, por contenido, en
 * UploadSecurityService.secure().
 */
export async function readSingleUploadedFile(req: FastifyRequest, maxSizeBytes: number): Promise<UploadedFileData> {
  const file = await req.file({ limits: { fileSize: maxSizeBytes } });
  if (!file) {
    throw new BadRequestException('No se recibió ningún archivo');
  }
  const buffer = await file.toBuffer();
  if (file.file.truncated) {
    throw new PayloadTooLargeException('El archivo excede el tamaño máximo permitido');
  }
  return { buffer, filename: file.filename, declaredMimetype: file.mimetype, size: buffer.length };
}

/**
 * Lee un formulario multipart/form-data que combina campos de texto con un
 * único archivo (p.ej. reportar un pago con su comprobante adjunto).
 */
export async function readMultipartFormWithFile(
  req: FastifyRequest,
  maxSizeBytes: number,
): Promise<{ fields: Record<string, string>; file: UploadedFileData }> {
  const fields: Record<string, string> = {};
  let file: UploadedFileData | undefined;

  for await (const part of req.parts({ limits: { fileSize: maxSizeBytes } })) {
    if (part.type === 'file') {
      const buffer = await part.toBuffer();
      if (part.file.truncated) {
        throw new PayloadTooLargeException('El archivo excede el tamaño máximo permitido');
      }
      file = { buffer, filename: part.filename, declaredMimetype: part.mimetype, size: buffer.length };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }

  if (!file) {
    throw new BadRequestException('Debes adjuntar el comprobante de pago');
  }

  return { fields, file };
}
