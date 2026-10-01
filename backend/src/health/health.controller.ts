import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller('health')
export class HealthController {
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
}
