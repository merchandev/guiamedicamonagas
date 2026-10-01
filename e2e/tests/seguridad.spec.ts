// Pruebas de seguridad contra la API y la web en marcha (complementan, no
// reemplazan, una prueba de penetración humana):
// - acceso cruzado entre cuentas (IDOR/BOLA) y escalada de médico a administrador;
// - rutas privadas sin sesión y tokens falsificados;
// - freno a la fuerza bruta en el inicio de sesión;
// - contenido de un perfil que intenta ejecutar código (XSS almacenado).
import { expect, test } from '@playwright/test';
import { API, PASSWORD, api, createPatient, createPublishedDoctor, rememberCookieChoice, spreadRateLimits } from './support';

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

test('un médico no lee los datos de un paciente ajeno ni escala a administración', async () => {
  const [doctorA, doctorB] = [await createPublishedDoctor({ tier: 'PROFESSIONAL' }), await createPublishedDoctor({ tier: 'PROFESSIONAL' })];
  const patient = await createPatient();
  const code = (await api('POST', '/patients/me/share-code', undefined, patient.token)).data.code as string;
  const registered = await api('POST', '/appointments/me/patients/register', { code }, doctorA.token);
  expect(registered.status).toBe(201);
  const patientId = registered.data.patientId as string;

  // El médico A sí puede; el B, que nunca recibió el código, no.
  expect((await api('POST', `/appointments/me/patients/${patientId}/data`, undefined, doctorA.token)).status).toBe(201);
  expect([403, 404]).toContain((await api('POST', `/appointments/me/patients/${patientId}/data`, undefined, doctorB.token)).status);
  expect([403, 404]).toContain(
    (await api('POST', `/appointments/me/patients/${patientId}/access-request`, { scopes: ['HEALTH'] }, doctorB.token)).status,
  );

  // Un médico no entra a nada de administración.
  for (const [method, path] of [
    ['GET', '/admin/stats'],
    ['GET', '/admin/accounts/professionals'],
    ['GET', '/documents/admin/queue'],
    ['GET', '/payments/admin/queue'],
    ['GET', '/patients/admin/accounts'],
    ['GET', '/legal-requests/admin'],
    ['PUT', '/payments/admin/pago-movil-account'],
    ['PATCH', `/documents/admin/e2e-${doctorB.id}-ARTICULO_8/review`],
  ] as const) {
    expect((await api(method, path, method === 'GET' ? undefined : { approved: true }, doctorA.token)).status, `${method} ${path}`).toBe(403);
  }
  // Ni a los documentos de otro médico.
  expect([403, 404]).toContain((await api('GET', `/documents/me/e2e-${doctorB.id}-TITULO_MEDICO/download`, undefined, doctorA.token)).status);
});

test('un paciente no ve ni cancela lo de otro paciente, ni entra a las rutas del médico', async () => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const [ana, beto] = [await createPatient(), await createPatient()];
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const slots = (await api('GET', `/appointments/availability?professionalId=${doctor.id}&from=${tomorrow}&to=${tomorrow}`)).data as string[];
  const booked = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: slots[0], reason: 'Control' }, ana.token);
  expect(booked.status, JSON.stringify(booked.data)).toBe(201);

  expect([403, 404]).toContain((await api('PATCH', `/appointments/${booked.data.id}/cancel`, { cancellationReason: 'Intento ajeno' }, beto.token)).status);
  expect(JSON.stringify((await api('GET', '/appointments/me', undefined, beto.token)).data)).not.toContain(booked.data.id);
  for (const path of ['/agenda/me', '/appointments/me/patients', '/professionals/me', '/analytics/me']) {
    expect((await api('GET', path, undefined, ana.token)).status, path).toBe(403);
  }
});

test('sin sesión, las rutas privadas responden 401', async () => {
  for (const path of [
    '/auth/me',
    '/patients/me',
    '/patients/me/grants',
    '/appointments/me',
    '/professionals/me',
    '/payments/pago-movil-account',
    '/analytics/me',
    '/admin/stats',
    '/patients/admin/accounts',
    '/documents/admin/queue',
  ]) {
    expect((await api('GET', path)).status, path).toBe(401);
  }
});

test('un token falsificado no sirve (rol cambiado o sin firma)', async () => {
  const patient = await createPatient();
  const [header, payload] = patient.token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const forgedRole = `${header}.${b64url({ ...claims, role: 'SUPERADMIN' })}.${patient.token.split('.')[2]}`;
  const unsigned = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ ...claims, role: 'SUPERADMIN' })}.`;
  for (const token of [forgedRole, unsigned]) {
    expect((await api('GET', '/admin/stats', undefined, token)).status).toBe(401);
    expect((await api('GET', '/auth/me', undefined, token)).status).toBe(401);
  }
});

test('la fuerza bruta en el inicio de sesión se frena (429)', async () => {
  const patient = await createPatient();
  // Todas las llamadas desde la misma IP (la API la toma de X-Forwarded-For).
  const ip = '10.250.250.250';
  const statuses: number[] = [];
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ email: patient.email, password: `${PASSWORD}-${i}` }),
    });
    statuses.push(res.status);
  }
  expect(statuses).toContain(429);
  expect(statuses.filter((s) => s === 200)).toEqual([]);
});

test('un perfil con código incrustado se muestra como texto y no se ejecuta (XSS almacenado)', async ({ page, context }) => {
  await spreadRateLimits(context);
  await rememberCookieChoice(context);
  // Con plan: el Perfil Básico no muestra la biografía en público.
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL' });
  const payload = '<script>window.__xss=1</script><img src=x onerror="window.__xss=2"> «guion»';
  const bio = `Médica cardióloga con diez años de experiencia en Maturín. ${payload}`;
  const updated = await api('PATCH', '/professionals/me', { firstName: doctor.firstName, lastName: doctor.lastName, bio }, doctor.token);
  expect(updated.status).toBe(200);

  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await page.goto(`/medicos/${doctor.slug}`);
  await expect(page.locator('main')).toContainText('<script>window.__xss=1</script>');
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('main img[src="x"]').count()).toBe(0);
  expect(dialogs).toEqual([]);
});
