import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env.validation';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter({ trustProxy: true });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService<EnvConfig, true>);
  const frontendUrl = config.get('FRONTEND_URL', { infer: true });
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: config.get('COOKIE_SECURE', { infer: true })
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
  });
  await app.register(fastifyCookie, { secret: process.env.COOKIE_SECRET });
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    // Sin esto, @fastify/cors calcula `Access-Control-Allow-Methods` de forma
    // dinámica y puede omitir métodos como PATCH/PUT/DELETE en el preflight
    // según el orden de registro de rutas — bloqueando silenciosamente en el
    // navegador peticiones que curl/Postman sí completan (CORS es una
    // restricción del navegador, no del servidor). Se fija la lista completa
    // de métodos que la API realmente usa.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Guía Médica Monagas API escuchando en el puerto ${port}`);
}

bootstrap();
