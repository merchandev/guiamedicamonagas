// Utilidades compartidas por las pruebas: llamadas a la API, datos de prueba
// (médicos publicados, pacientes) y sesión en el navegador. Cada prueba crea
// sus propias cuentas con un sufijo único, así que la suite puede repetirse
// sobre la misma base de datos.
import { randomBytes } from 'node:crypto';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

export const API = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';
/** Mailpit (correo de prueba). Sin él se omiten las pruebas que leen correos. */
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? '';
/** Almacenamiento S3 disponible (S3Mock en CI). Sin él se omiten las subidas de archivos. */
export const HAS_STORAGE = process.env.E2E_STORAGE === '1';
/** Contraseña de las cuentas de prueba: al azar en cada ejecución (nada fijo en el repositorio). */
export const PASSWORD = `E2e-${randomBytes(6).toString('hex')}-Aa1`;
/** Imagen PNG mínima válida (1×1): la API re-codifica toda imagen que recibe. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
export const ADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@guiamedicamonagas.com';

const byte = () => randomBytes(1)[0] % 250 + 1;
/** Sufijo único (correos). */
export const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
/** Letras al azar para nombres (los nombres no admiten dígitos). */
export const letters = (n = 6) =>
  Array.from(randomBytes(n), (b) => 'abcdefghijklmnopqrstuvwxyz'[b % 26]).join('').replace(/^./, (c) => c.toUpperCase());
/**
 * IP simulada por llamada. Los límites de la API son por IP y la API toma la
 * IP de X-Forwarded-For (en producción ese encabezado lo pone Traefik, que
 * descarta el del cliente): así las pruebas no chocan con los límites.
 */
export const fakeIp = () => `10.${byte()}.${byte()}.${byte()}`;

export interface ApiResult<T = any> {
  status: number;
  data: T;
}

export async function api<T = any>(method: string, path: string, body?: unknown, token?: string): Promise<ApiResult<T>> {
  const res = await fetch(API + path, {
    method,
    headers: {
      'x-forwarded-for': fakeIp(),
      // Sin cuerpo no se envía Content-Type: Fastify rechaza un JSON vacío.
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/** Consulta directa a la base de prueba, para preparar datos que en la vida real tardan días (documentos aprobados). */
export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

// --- Correo de prueba (Mailpit) -------------------------------------------------

interface MailSummary {
  ID: string;
  Created: string;
}

/** El correo más reciente para `to` llegado después de `since` (espera hasta 20 s). */
export async function latestMail(to: string, since: Date): Promise<{ text: string; html: string; subject: string }> {
  if (!MAILPIT) throw new Error('E2E_MAILPIT_URL no está definido');
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const list = ((await res.json()) as { messages?: MailSummary[] }).messages ?? [];
    // El más reciente llegado después de pedirlo (Mailpit los devuelve del más nuevo al más viejo).
    const fresh = list.find((m) => new Date(m.Created).getTime() >= since.getTime());
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text: string; HTML: string; Subject: string };
      return { text: msg.Text ?? '', html: msg.HTML ?? '', subject: msg.Subject ?? '' };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó ningún correo para ${to}`);
}

export const sixDigitCode = (text: string) => {
  const match = text.match(/\b(\d{6})\b/);
  if (!match) throw new Error('El correo no trae un código de 6 dígitos');
  return match[1];
};

// --- Cuentas de prueba -------------------------------------------------------

let cachedAdmin: { token: string; at: number } | null = null;

/**
 * Token del superadministrador de la semilla (con MFA por correo si está
 * activo). Se reutiliza 5 minutos: cada inicio de sesión manda un código.
 */
export async function adminToken(): Promise<string> {
  if (cachedAdmin && Date.now() - cachedAdmin.at < 5 * 60_000) return cachedAdmin.token;
  cachedAdmin = { token: await freshAdminToken(), at: Date.now() };
  return cachedAdmin.token;
}

async function freshAdminToken(): Promise<string> {
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!password) throw new Error('Falta SEED_SUPERADMIN_PASSWORD para las pruebas de administración');
  const since = new Date();
  const r = await api('POST', '/auth/login', { email: ADMIN_EMAIL, password });
  if (r.data?.accessToken) return r.data.accessToken;
  if (r.data?.mfaRequired) {
    const code = sixDigitCode((await latestMail(ADMIN_EMAIL, since)).text);
    const verified = await api('POST', '/auth/mfa/verify', { challengeToken: r.data.challengeToken, code });
    expect(verified.status, 'MFA del administrador').toBe(200);
    return verified.data.accessToken;
  }
  throw new Error(`Inicio de sesión del administrador: HTTP ${r.status}`);
}

export interface Patient {
  email: string;
  token: string;
  firstName: string;
  lastName: string;
}

export async function createPatient(): Promise<Patient> {
  const email = `paciente-${uid()}@e2e.local`;
  const firstName = 'Pedro';
  const lastName = letters();
  const cedula = `V-${10_000_000 + (randomBytes(4).readUInt32BE(0) % 89_999_999)}`;
  const r = await api('POST', '/auth/register', {
    email,
    password: PASSWORD,
    role: 'USER',
    firstName,
    lastName,
    cedula,
    acceptLegal: true,
    acceptHealthConsent: true,
    declareAdult: true,
  });
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return { email, token: r.data.accessToken, firstName, lastName };
}

export interface Doctor {
  email: string;
  token: string;
  id: string;
  slug: string;
  publicCode: string;
  firstName: string;
  lastName: string;
}

// Los seis del médico y los dos del especialista (título de postgrado y credencial):
// con una especialidad asignada se exigen los ocho para el sello de verificado.
const DOCUMENT_TYPES = [
  'CEDULA_IDENTIDAD',
  'RIF',
  'TITULO_MEDICO',
  'REGISTRO_MPPS_SACS',
  'MATRICULA_COLEGIO_MONAGAS',
  'TITULO_POSTGRADO',
  'CREDENCIAL_ESPECIALIDAD',
  'ARTICULO_8',
];

/**
 * Médico especialista registrado por la API, publicado y verificado: los ocho
 * documentos aprobados (siete cargados en la base y el último aprobado por la
 * administración, que recalcula la publicación y el sello), foto, biografía,
 * especialidad y municipio. Con `tier` recibe un plan (el Perfil Básico oculta
 * foto y biografía en público); con `agenda`, horario todos los días.
 */
export async function createPublishedDoctor(
  opts: { tier?: 'PROFESSIONAL' | 'PROFESSIONAL_PLUS' | 'PREMIUM'; specialtySlug?: string; agenda?: boolean } = {},
): Promise<Doctor> {
  const email = `medico-${uid()}@e2e.local`;
  const firstName = 'Diana';
  const lastName = letters(8);
  const r = await api('POST', '/auth/register', {
    email,
    password: PASSWORD,
    role: 'PROFESSIONAL',
    firstName,
    lastName,
    acceptLegal: true,
    acceptProfessionalTerms: true,
  });
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  const token = r.data.accessToken as string;
  const [profile] = await sql<{ id: string }>(
    `select p.id from "ProfessionalProfile" p join "User" u on u.id = p."userId" where u.email = $1`,
    [email],
  );
  for (const [index, type] of DOCUMENT_TYPES.entries()) {
    await sql(
      `insert into "ProfessionalDocument"(id,"professionalId",type,"fileKey","originalFileName","mimeType","fileSizeBytes",status,"updatedAt")
       values ($1,$2,$3,'documents/e2e.pdf','documento.pdf','application/pdf',1000,$4,now())`,
      [`e2e-${profile.id}-${type}`, profile.id, type, index < DOCUMENT_TYPES.length - 1 ? 'APPROVED' : 'PENDING'],
    );
  }
  if (HAS_STORAGE) {
    // Con almacenamiento, una foto real (pasa por la misma verificación que las del médico).
    const form = new FormData();
    form.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'foto.png');
    const upload = await fetch(`${API}/professionals/me/photo`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': fakeIp() },
      body: form,
    });
    expect(upload.status, await upload.text()).toBe(201);
  } else {
    await sql(`update "ProfessionalProfile" set "photoUrl" = 'professionals/e2e.png' where id = $1`, [profile.id]);
  }
  const specialties = (await api('GET', '/specialties')).data as { id: string; slug: string }[];
  const specialty = specialties.find((s) => s.slug === (opts.specialtySlug ?? 'cardiologia')) ?? specialties[0];
  const updated = await api(
    'PATCH',
    '/professionals/me',
    {
      firstName,
      lastName,
      bio: 'Médica cardióloga con diez años de experiencia en consulta y prevención cardiovascular en Maturín.',
      specialtyIds: [specialty.id],
      municipality: 'Maturín',
    },
    token,
  );
  expect(updated.status, JSON.stringify(updated.data)).toBe(200);
  const review = await api(
    'PATCH',
    `/documents/admin/e2e-${profile.id}-ARTICULO_8/review`,
    { approved: true },
    await adminToken(),
  );
  expect(review.status, JSON.stringify(review.data)).toBe(200);
  if (opts.tier) await sql(`update "ProfessionalProfile" set "planTier" = $2 where id = $1`, [profile.id, opts.tier]);
  if (opts.agenda) {
    expect((await api('PUT', '/agenda/me', { slotDurationMinutes: 30, bufferMinutes: 0, autoConfirm: true }, token)).status).toBe(200);
    for (let day = 0; day <= 6; day++) {
      const block = await api('POST', '/agenda/me/blocks', { dayOfWeek: day, startTime: '07:00', endTime: '20:00' }, token);
      expect(block.status, JSON.stringify(block.data)).toBe(201);
    }
  }
  const [row] = await sql<{ slug: string; publicCode: string }>(
    `select slug, "publicCode" from "ProfessionalProfile" where id = $1`,
    [profile.id],
  );
  return { email, token, id: profile.id, slug: row.slug, publicCode: row.publicCode, firstName, lastName };
}

// --- Navegador ------------------------------------------------------------------

/**
 * Inicia sesión en el contexto del navegador sin pasar por el formulario: la
 * cookie de renovación queda en el contexto y la web recupera la sesión al
 * cargar (el token de acceso vive solo en memoria).
 */
export async function signIn(context: BrowserContext, email: string, password = PASSWORD) {
  const res = await context.request.post(`${API}/auth/login`, {
    data: { email, password },
    headers: { 'x-forwarded-for': fakeIp() },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Cada llamada del navegador a la API sale con una IP simulada distinta (límites por IP). */
export async function spreadRateLimits(context: BrowserContext) {
  // allHeaders() incluye la cookie de sesión; headers() no, y se perdería.
  await context.route(`${API}/**`, async (route) =>
    route.continue({ headers: { ...(await route.request().allHeaders()), 'x-forwarded-for': fakeIp() } }),
  );
}

/** Día del calendario de Caracas, hoy o desplazado: «2026-10-05». */
export function caracasDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

/**
 * En el calendario de mes de una reserva, toca el primer día con horarios
 * libres; si el mes a la vista ya no tiene (fin de mes), pasa al siguiente.
 */
export async function pickFirstFreeDay(page: Page) {
  const calendar = page.getByRole('group', { name: 'Fecha' });
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(calendar.getByText('Buscando horarios libres…')).toHaveCount(0);
    const free = calendar.getByRole('button', { name: /con horarios libres/ });
    if (await free.count()) {
      await free.first().click();
      return;
    }
    await calendar.getByRole('button', { name: 'Mes siguiente' }).click();
  }
  throw new Error('No hay días con horarios libres en los próximos meses');
}

/** La página no se desborda a lo ancho (scroll horizontal en el teléfono). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'la página no debe tener desplazamiento horizontal').toBeLessThanOrEqual(1);
}

/**
 * Registra los errores de la consola y las violaciones de CSP. Las respuestas
 * 401/403/404 esperadas (sesión, permisos) no cuentan.
 */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/status of (401|403|404)/.test(text)) return;
    // Sin almacenamiento local, las fotos de los médicos de prueba no cargan.
    if (!HAS_STORAGE && text.includes('net::ERR_CONNECTION_REFUSED')) return;
    errors.push(text);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/**
 * Visitante que ya decidió sobre las cookies (rechazó las no esenciales): el
 * aviso no aparece. Para los recorridos que no tratan del aviso.
 */
export async function rememberCookieChoice(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'gmm_cookie_consent',
        JSON.stringify({ subjectId: 'e2e', analytics: false, marketing: false, decidedAt: new Date().toISOString() }),
      );
    } catch {
      // sin almacenamiento: el aviso aparece y la prueba sigue igual
    }
  });
}

/**
 * Inicio de sesión del superadministrador por el formulario, con el código por
 * correo si el MFA está activo y aceptando los textos legales pendientes.
 * Con E2E_EXPECT_ADMIN_MFA=1 (CI) exige que el código se pida.
 */
export async function signInAsAdmin(page: Page) {
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? '';
  const since = new Date();
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  const codeField = page.getByLabel(/Código de acceso/);
  await expect(codeField.or(page.getByRole('heading', { level: 1 }).filter({ hasNotText: 'Iniciar sesión' }))).toBeVisible();
  if (await codeField.isVisible()) {
    if (!MAILPIT) throw new Error('El MFA está activo y no hay Mailpit (E2E_MAILPIT_URL) para leer el código');
    await codeField.fill(sixDigitCode((await latestMail(ADMIN_EMAIL, since)).text));
    await page.getByRole('button', { name: 'Verificar' }).click();
  } else if (process.env.E2E_EXPECT_ADMIN_MFA === '1') {
    throw new Error('El MFA de administradores debía pedir un código por correo');
  }
  await expect(page).toHaveURL(/\/admin/);
  const gate = page.getByRole('dialog', { name: 'Actualizamos nuestros textos legales' });
  await page.waitForLoadState('networkidle');
  if (await gate.isVisible()) {
    const boxes = gate.getByRole('checkbox');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await gate.getByRole('button', { name: 'Aceptar y continuar' }).click();
    await expect(gate).toBeHidden();
  }
}
