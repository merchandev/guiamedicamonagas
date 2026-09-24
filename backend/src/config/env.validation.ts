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

const baseEnvSchema = z.object({
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

  // SEC-05: llavero de cifrado de datos de pacientes, FUERA de PostgreSQL.
  // Perderlas = perder los datos cifrados: respaldarlas aparte, nunca junto
  // al volcado de la base de datos.
  DATA_ENCRYPTION_KEYS: z.string().min(1),
  DATA_ENCRYPTION_ACTIVE_KEY: z.string().default('v1'),
  DATA_LOOKUP_KEY: z.string().min(1),

  // Segundo factor por correo para ADMIN/SUPERADMIN. Obligatorio en
  // producción (ver productionRules); requiere un SMTP real: con el Mailpit
  // interno el código nunca llegaría al buzón.
  ADMIN_MFA_ENABLED: envBoolean(false),
  // Única excepción: fecha límite (AAAA-MM-DD) mientras se configura el SMTP.
  // scripts/deploy.sh bloquea el despliegue cuando vence.
  // Compose pasa "" cuando la variable no está en .env.prod: vacío = sin excepción.
  ADMIN_MFA_WAIVER_UNTIL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'formato AAAA-MM-DD').optional(),
  ),

  // SEC-04: antivirus de subidas (clamd, protocolo INSTREAM por TCP).
  // Obligatorio en producción; vacío solo en desarrollo y pruebas.
  CLAMAV_HOST: z.string().optional().default(''),
  CLAMAV_PORT: z.coerce.number().default(3310),

  PAGO_MOVIL_BANK_NAME: z.string().default('Banesco'),
  PAGO_MOVIL_BANK_CODE: z.string().default('0134'),
  PAGO_MOVIL_PHONE: z.string().default(''),
  PAGO_MOVIL_ID: z.string().default(''),
});

/**
 * Reglas que solo aplican a NODE_ENV=production: la API no arranca sin
 * antivirus ni, salvo excepción fechada y explícita, sin segundo factor para
 * administradores.
 */
export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (!env.CLAMAV_HOST) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CLAMAV_HOST'],
      message: 'es obligatorio en producción: todo archivo subido pasa por el antivirus',
    });
  }
  if (!env.ADMIN_MFA_ENABLED && !env.ADMIN_MFA_WAIVER_UNTIL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ADMIN_MFA_ENABLED'],
      message:
        'debe ser true en producción. Mientras no haya SMTP real, declarar ADMIN_MFA_WAIVER_UNTIL=AAAA-MM-DD (excepción temporal)',
    });
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Avisos de producción que no impiden arrancar (un reinicio del servidor no
 * debe tumbar el sitio), pero que deploy.sh sí trata como bloqueantes.
 */
export function productionWarnings(
  env: Pick<EnvConfig, 'NODE_ENV' | 'ADMIN_MFA_ENABLED' | 'ADMIN_MFA_WAIVER_UNTIL' | 'COOKIE_SECURE' | 'FRONTEND_URL'>,
  today = new Date(),
): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const warnings: string[] = [];
  if (!env.ADMIN_MFA_ENABLED && env.ADMIN_MFA_WAIVER_UNTIL) {
    const expired = env.ADMIN_MFA_WAIVER_UNTIL < today.toISOString().slice(0, 10);
    warnings.push(
      expired
        ? `La excepción de MFA para administradores venció el ${env.ADMIN_MFA_WAIVER_UNTIL}: configurar SMTP real y ADMIN_MFA_ENABLED=true`
        : `Administradores sin segundo factor hasta el ${env.ADMIN_MFA_WAIVER_UNTIL} (excepción temporal): configurar SMTP real`,
    );
  }
  if (!env.COOKIE_SECURE) warnings.push('COOKIE_SECURE=false: la sesión viaja sin HTTPS (NO-GO para pacientes reales)');
  if (!env.FRONTEND_URL.startsWith('https://')) warnings.push('FRONTEND_URL no usa HTTPS (NO-GO para pacientes reales)');
  return warnings;
}

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
