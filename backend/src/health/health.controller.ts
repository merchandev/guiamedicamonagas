import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { ReadinessService } from './readiness.service';

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Guia Medica Monagas API v1',
      // Commit con el que se construyó la imagen (deploy.sh lo pasa al build):
      // permite comprobar desde fuera qué versión corre en producción.
      version: (process.env.GMM_BUILD_SHA || 'dev').slice(0, 12),
      builtAt: process.env.GMM_BUILT_AT || null,
    };
  }

  /**
   * Dependencias de la API: base de datos, almacenamiento, antivirus y correo.
   * 200 si todas responden, 503 si alguna falla. Es para el monitoreo del
   * propio servidor (scripts/healthcheck.sh entra directo al contenedor):
   * Caddy no la expone a Internet, porque cada consulta toca todas las
   * dependencias.
   */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const report = await this.readiness.check();
    if (report.status !== 'ok') reply.status(503);
    return report;
  }
}
