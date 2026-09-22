import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export interface UploadedFileData {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  size: number;
}

/**
 * Lee un único archivo de un request multipart/form-data (Fastify), validando
 * tipo MIME y tamaño máximo antes de materializar el buffer completo.
 */
export async function readSingleUploadedFile(
  req: FastifyRequest,
  allowedMimeTypes: string[],
  maxSizeBytes: number,
): Promise<UploadedFileData> {
  const file = await req.file({ limits: { fileSize: maxSizeBytes } });
  if (!file) {
    throw new BadRequestException('No se recibió ningún archivo');
  }
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new UnsupportedMediaTypeException(
      `Tipo de archivo no permitido: ${file.mimetype}. Permitidos: ${allowedMimeTypes.join(', ')}`,
    );
  }
  const buffer = await file.toBuffer();
  if (file.file.truncated) {
    throw new PayloadTooLargeException(`El archivo excede el tamaño máximo permitido`);
  }
  return {
    buffer,
    filename: file.filename,
    mimetype: file.mimetype,
    size: buffer.length,
  };
}

/**
 * Lee un formulario multipart/form-data que combina campos de texto con un
 * único archivo (p.ej. reportar un pago con su comprobante adjunto).
 */
export async function readMultipartFormWithFile(
  req: FastifyRequest,
  allowedMimeTypes: string[],
  maxSizeBytes: number,
): Promise<{ fields: Record<string, string>; file: UploadedFileData }> {
  const fields: Record<string, string> = {};
  let file: UploadedFileData | undefined;

  for await (const part of req.parts({ limits: { fileSize: maxSizeBytes } })) {
    if (part.type === 'file') {
      if (!allowedMimeTypes.includes(part.mimetype)) {
        throw new UnsupportedMediaTypeException(
          `Tipo de archivo no permitido: ${part.mimetype}. Permitidos: ${allowedMimeTypes.join(', ')}`,
        );
      }
      const buffer = await part.toBuffer();
      if (part.file.truncated) {
        throw new PayloadTooLargeException('El archivo excede el tamaño máximo permitido');
      }
      file = { buffer, filename: part.filename, mimetype: part.mimetype, size: buffer.length };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }

  if (!file) {
    throw new BadRequestException('Debes adjuntar el comprobante de pago');
  }

  return { fields, file };
}
