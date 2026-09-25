import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Filtro global: normaliza la forma de los errores y evita filtrar detalles
 * internos (stack traces, mensajes de Prisma/Node) al cliente en producción.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Ocurrió un error inesperado. Intenta de nuevo.';
    // Código estable opcional para que el cliente distinga casos con el mismo
    // estado HTTP (p. ej. PATIENT_VAULT_LOCKED frente a otro 403).
    let code: string | undefined;
    if (isHttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null && 'message' in body) {
        message = (body as { message: string | string[] }).message;
        const rawCode = (body as { code?: unknown }).code;
        if (typeof rawCode === 'string' && /^[A-Z_]{1,64}$/.test(rawCode)) code = rawCode;
      }
    }

    if (!isHttpException || status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).send({
      statusCode: status,
      message,
      ...(code ? { code } : {}),
      timestamp: new Date().toISOString(),
      path: (ctx.getRequest() as { url?: string }).url,
    });
  }
}
