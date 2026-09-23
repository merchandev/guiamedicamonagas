import { z } from 'zod';

/**
 * z.coerce.boolean() usa Boolean(valor) por debajo: CUALQUIER string no
 * vacío (incluido literalmente "false") se convierte en `true`. Eso rompía
 * en silencio SMTP_SECURE=false (nodemailer intentaba TLS contra Mailpit)
 * y WHATSAPP_ENABLED=false (el flag de no-op en dev quedaba inactivo).
 * Este helper solo acepta los strings "true"/"false" explícitamente.
 */
function envBoolean(defaultValue: boolean) {
  return z
    .enum(['true', 'false'])
    .default(String(defaultValue) as 'true' | 'false')
    .transform((val) => val === 'true');
}

// Valores que jamás deben aparecer en producción.
const INSECURE_DEFAULTS = ['password', 'supersecret123', 'dev_master_key', 'change_me', 'CHANGE_ME'];

/** Valida que un string no sea un default inseguro conocido (solo en NODE_ENV=production). */
function noInsecureDefault(fieldName: string) {
  return z.string().superRefine((val, ctx) => {
    if (process.env.NODE_ENV !== 'production') return;
    for (const forbidden of INSECURE_DEFAULTS) {
      if (val.toLowerCase().includes(forbidden.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${fieldName} contiene el valor inseguro '${forbidden}'. Genera un secreto real con: openssl rand -base64 48`,
        });
      }
    }
  });
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  JWT_SECRET: z.string().min(32).and(noInsecureDefault('JWT_SECRET')),
  JWT_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32).and(noInsecureDefault('JWT_REFRESH_SECRET')),
  JWT_REFRESH_EXPIRATION_DAYS: z.coerce.number().default(7),

  COOKIE_SECRET: z.string().min(32).and(noInsecureDefault('COOKIE_SECRET')),
  // Cookie del refresh token: debe ir en `true` en cuanto el sitio sirva por
  // HTTPS. En `false` solo para un lanzamiento HTTP temporal (el navegador
  // nunca reenvía una cookie `secure` por una conexión sin cifrar).
  COOKIE_SECURE: envBoolean(true),

  S3_ENDPOINT: z.string().url(),
  // URL pública (vía proxy de Caddy) para las descargas firmadas que ve el
  // navegador. Si no se define, se reutiliza S3_ENDPOINT (comportamiento
  // actual sin cambios en desarrollo local, donde el navegador sí alcanza
  // el contenedor de MinIO directamente).
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1).and(noInsecureDefault('S3_SECRET_KEY')),
  S3_FORCE_PATH_STYLE: envBoolean(true),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: envBoolean(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().min(1),

  WHATSAPP_ENABLED: envBoolean(false),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_ADMIN_NUMBER: z.string().optional().default(''),

  PAGO_MOVIL_BANK_NAME: z.string().default('Banesco'),
  PAGO_MOVIL_BANK_CODE: z.string().default('0134'),
  PAGO_MOVIL_PHONE: z.string().default(''),
  PAGO_MOVIL_ID: z.string().default(''),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas o faltantes:\n${issues}`);
  }
  return parsed.data;
}
