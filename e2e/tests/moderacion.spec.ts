// Moderación de valoraciones (permiso MODERATE_REVIEWS) y sanciones por días:
// aprobar, rechazar, retirar como evidencia, restaurar y eliminar; respuestas y
// denuncias de los médicos; suspensión de opiniones y de la cuenta, que vence
// sola y no toca citas ni autorizaciones; identidad del autor solo con la bóveda.
import AxeBuilder from '@axe-core/playwright';
import { expect, request, test } from '@playwright/test';
import {
  adminToken,
  api,
  API,
  completedVisit,
  createPublishedDoctor,
  type Doctor,
  PASSWORD,
  registeredByCode,
  signIn,
  signInAsAdmin,
  spreadRateLimits,
  sql,
  verifiedPatient,
} from './support';

interface Notice {
  type: string;
  title: string;
  content: string;
}

async function notices(token: string): Promise<Notice[]> {
  return (await api('GET', '/notifications?limit=50', undefined, token)).data.items as Notice[];
}

const dermatologist = () => createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL', agenda: true });

async function reviewWithComment(doctor: Doctor, comment: string) {
  const patient = await verifiedPatient();
  await completedVisit(doctor, patient);
  const created = await api(
    'POST',
    '/reviews',
    { professionalId: doctor.id, rating: 2, comment, authorDisplay: 'ANONYMOUS', acceptRules: true },
    patient.token,
  );
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  expect(created.data.status).toBe('PENDING');
  return { patient, id: created.data.id as string };
}

const publicItems = async (doctor: Doctor) =>
  (await api('GET', `/reviews/professional/${doctor.slug}`)).data.items as { id: string; comment: string | null; reply: unknown }[];

test('la administración aprueba, rechaza, retira, restaura y elimina, y el autor recibe cada decisión', async () => {
  const admin = await adminToken();
  const doctor = await dermatologist();
  const first = await reviewWithComment(doctor, 'La consulta empezó tarde, pero el trato fue respetuoso y claro.');
  const second = await reviewWithComment(doctor, 'No me explicó nada y me atendió muy rápido.');

  // Solo con el permiso de moderar.
  expect((await api('GET', '/reviews/admin', undefined, doctor.token)).status).toBe(403);
  expect((await api('GET', '/reviews/admin', undefined, first.patient.token)).status).toBe(403);

  // La cola no dice quién escribió cada opinión.
  const queue = await api('GET', `/reviews/admin?tab=PENDING&search=${doctor.lastName}`, undefined, admin);
  expect(queue.status).toBe(200);
  expect(queue.data.items.map((item: { id: string }) => item.id).sort()).toEqual([first.id, second.id].sort());
  expect(JSON.stringify(queue.data)).not.toContain(first.patient.lastName);
  expect(queue.data.counts.PENDING).toBeGreaterThanOrEqual(2);

  // Aprobar: se publica y avisa al médico y al autor.
  expect((await api('PATCH', `/reviews/admin/${first.id}/approve`, undefined, admin)).status).toBe(200);
  expect((await publicItems(doctor)).map((item) => item.comment)).toContain('La consulta empezó tarde, pero el trato fue respetuoso y claro.');
  expect((await notices(first.patient.token)).some((n) => n.title === 'Tu opinión se publicó')).toBe(true);
  expect((await notices(doctor.token)).some((n) => n.type === 'REVIEW_PUBLISHED')).toBe(true);
  expect((await api('PATCH', `/reviews/admin/${first.id}/approve`, undefined, admin)).status).toBe(409);

  // Rechazar exige motivo; el autor lo recibe y puede corregirla.
  expect((await api('PATCH', `/reviews/admin/${second.id}/reject`, { reason: 'corto' }, admin)).status).toBe(400);
  const rejected = await api('PATCH', `/reviews/admin/${second.id}/reject`, { reason: 'Describe la atención sin calificar a la persona.' }, admin);
  expect(rejected.status).toBe(200);
  const rejectedNotice = (await notices(second.patient.token)).find((n) => n.title === 'Tu opinión no se publicó');
  expect(rejectedNotice?.content).toContain('Describe la atención sin calificar a la persona.');
  const fixed = await api('PATCH', `/reviews/${second.id}`, { comment: 'La consulta fue muy breve.', acceptRules: true }, second.patient.token);
  expect(fixed.data.status).toBe('PENDING');

  // Retirar: sale del sitio y del promedio, se guarda como evidencia y el autor ya no la toca.
  const withdrawn = await api('PATCH', `/reviews/admin/${first.id}/withdraw`, { reason: 'Contiene una acusación que no se puede sostener.' }, admin);
  expect(withdrawn.status).toBe(200);
  expect(await publicItems(doctor)).toEqual([]);
  const [evidence] = await sql<{ status: string; comment: string }>(`select status, comment from "Review" where id = $1`, [first.id]);
  expect(evidence).toEqual({ status: 'WITHDRAWN', comment: 'La consulta empezó tarde, pero el trato fue respetuoso y claro.' });
  expect((await notices(first.patient.token)).some((n) => n.title === 'Retiramos tu opinión')).toBe(true);
  expect((await api('PATCH', `/reviews/${first.id}`, { rating: 5, acceptRules: true }, first.patient.token)).status).toBe(403);
  expect((await api('DELETE', `/reviews/${first.id}`, undefined, first.patient.token)).status).toBe(403);

  // Restaurar la vuelve a publicar.
  expect((await api('PATCH', `/reviews/admin/${first.id}/restore`, undefined, admin)).status).toBe(200);
  expect((await publicItems(doctor)).map((item) => item.id)).toEqual([first.id]);

  // Eliminar para siempre exige escribir ELIMINAR; en la auditoría queda el motivo, no el texto.
  expect((await api('POST', `/reviews/admin/${second.id}/delete`, { reason: 'Revela datos de salud de otra persona.', confirm: 'eliminar' }, admin)).status).toBe(400);
  const deleted = await api('POST', `/reviews/admin/${second.id}/delete`, { reason: 'Revela datos de salud de otra persona.', confirm: 'ELIMINAR' }, admin);
  expect(deleted.status, JSON.stringify(deleted.data)).toBe(201);
  expect(await sql(`select id from "Review" where id = $1`, [second.id])).toEqual([]);
  const [audit] = await sql<{ details: { reason: string } }>(
    `select details from "AuditLog" where action = 'REVIEW_DELETED_BY_ADMIN' and "resourceId" = $1`,
    [second.id],
  );
  expect(audit.details.reason).toBe('Revela datos de salud de otra persona.');
  expect(JSON.stringify(audit.details)).not.toContain('La consulta fue muy breve.');
  expect((await notices(second.patient.token)).some((n) => n.title === 'Eliminamos tu opinión')).toBe(true);
});

test('respuestas y denuncias: la administración publica la respuesta y resuelve cada denuncia', async () => {
  const admin = await adminToken();
  const doctor = await dermatologist();
  const [author, other] = [await verifiedPatient(), await verifiedPatient()];
  await completedVisit(doctor, author);
  await registeredByCode(doctor, other);
  const first = (await api('POST', '/reviews', { professionalId: doctor.id, rating: 1, authorDisplay: 'ANONYMOUS', acceptRules: true }, author.token)).data.id;
  const second = (await api('POST', '/reviews', { professionalId: doctor.id, rating: 2, authorDisplay: 'ANONYMOUS', acceptRules: true }, other.token)).data.id;

  // La respuesta se publica cuando la administración la aprueba.
  expect((await api('PUT', `/reviews/${first}/reply`, { content: 'Gracias por su opinión; ya ajustamos los horarios.' }, doctor.token)).status).toBe(200);
  const replies = await api('GET', `/reviews/admin?tab=REPLIES&search=${doctor.lastName}`, undefined, admin);
  expect(replies.data.items.map((item: { id: string }) => item.id)).toEqual([first]);
  expect((await api('PATCH', `/reviews/admin/${first}/reply`, { action: 'REJECT' }, admin)).status).toBe(400);
  expect((await api('PATCH', `/reviews/admin/${first}/reply`, { action: 'APPROVE' }, admin)).status).toBe(200);
  const published = (await publicItems(doctor)).find((item) => item.id === first);
  expect(published?.reply).toEqual({ content: 'Gracias por su opinión; ya ajustamos los horarios.' });
  expect((await notices(doctor.token)).some((n) => n.title === 'Tu respuesta se publicó')).toBe(true);

  // Una denuncia desestimada: la opinión sigue y el médico recibe la respuesta.
  expect((await api('POST', `/reviews/${first}/report`, { reason: 'FALSE' }, doctor.token)).status).toBe(201);
  const reported = await api('GET', `/reviews/admin?tab=REPORTED&search=${doctor.lastName}`, undefined, admin);
  expect(reported.data.items).toHaveLength(1);
  const caseData = (await api('GET', `/reviews/admin/${first}`, undefined, admin)).data;
  expect(caseData.reports[0]).toMatchObject({ reason: 'FALSE', status: 'OPEN', reporter: `Dr(a). ${doctor.firstName} ${doctor.lastName}` });
  const resolved = await api('PATCH', `/reviews/admin/reports/${caseData.reports[0].id}`, { status: 'DISMISSED', note: 'La consulta está verificada por una cita realizada.' }, admin);
  expect(resolved.status).toBe(200);
  expect((await notices(doctor.token)).find((n) => n.title === 'Revisamos tu denuncia')?.content).toContain('La consulta está verificada');

  // Retirar una opinión denunciada deja la denuncia como procedente y se lo dice al médico.
  expect((await api('POST', `/reviews/${second}/report`, { reason: 'NOT_MY_PATIENT' }, doctor.token)).status).toBe(201);
  expect((await api('PATCH', `/reviews/admin/${second}/withdraw`, { reason: 'El médico no tuvo esta consulta según su registro.' }, admin)).status).toBe(200);
  const [report] = await sql<{ status: string }>(`select status from "ReviewReport" where "reviewId" = $1`, [second]);
  expect(report.status).toBe('UPHELD');
  expect((await notices(doctor.token)).some((n) => n.title === 'Tu denuncia fue procedente')).toBe(true);
});

test('sanciones por días: sin opiniones o con la cuenta suspendida, sin tocar citas ni autorizaciones, y vencen solas', async ({ browser }) => {
  const admin = await adminToken();
  const doctor = await dermatologist();
  const patient = await verifiedPatient();
  await completedVisit(doctor, patient);
  await registeredByCode(doctor, patient);
  const [user] = await sql<{ id: string }>(`select id from "User" where email = $1`, [patient.email]);

  // Reglas de la duración y del permiso.
  const base = { userId: user.id, reason: 'Publicó insultos contra un médico.' };
  expect((await api('POST', '/reviews/admin/sanctions', { ...base, type: 'REVIEWS', days: 0 }, admin)).status).toBe(400);
  expect((await api('POST', '/reviews/admin/sanctions', { ...base, type: 'REVIEWS', days: 366 }, admin)).status).toBe(400);
  expect((await api('POST', '/reviews/admin/sanctions', { ...base, type: 'REVIEWS' }, admin)).status).toBe(400);
  expect((await api('POST', '/reviews/admin/sanctions', { ...base, type: 'ACCOUNT', indefinite: true }, admin)).status).toBe(400);
  expect((await api('POST', '/reviews/admin/sanctions', { ...base, type: 'REVIEWS', days: 3 }, doctor.token)).status).toBe(403);

  // Sin opiniones por 3 días: no puede valorar; al levantarla, sí.
  const reviewsBan = await api('POST', '/reviews/admin/sanctions', { ...base, type: 'REVIEWS', days: 3 }, admin);
  expect(reviewsBan.status, JSON.stringify(reviewsBan.data)).toBe(201);
  const blocked = await api('POST', '/reviews', { professionalId: doctor.id, rating: 4, authorDisplay: 'ANONYMOUS', acceptRules: true }, patient.token);
  expect(blocked.status).toBe(403);
  expect(blocked.data.message).toMatch(/No puedes escribir ni editar opiniones hasta el \d+ de \w+ de \d{4}/);
  expect((await notices(patient.token)).some((n) => n.type === 'SANCTION_APPLIED')).toBe(true);
  expect((await api('PATCH', `/reviews/admin/sanctions/${reviewsBan.data.id}/lift`, { reason: 'Se revisó el caso y no correspondía.' }, admin)).status).toBe(200);
  expect((await api('POST', '/reviews', { professionalId: doctor.id, rating: 4, authorDisplay: 'ANONYMOUS', acceptRules: true }, patient.token)).status).toBe(201);

  // Cuenta suspendida 7 días: se cierran sus sesiones y no entra, con la fecha y el motivo.
  const grantsBefore = await sql<{ id: string }>(
    `select g.id from "PatientDataGrant" g join "PatientProfile" p on p.id = g."patientId" where p."userId" = $1 and g."revokedAt" is null`,
    [user.id],
  );
  expect(grantsBefore.length).toBeGreaterThan(0);
  const accountBan = await api('POST', '/reviews/admin/sanctions', { ...base, type: 'ACCOUNT', days: 7 }, admin);
  expect(accountBan.status).toBe(201);
  expect((await api('GET', '/auth/me', undefined, patient.token)).status).toBe(401);
  const login = await api('POST', '/auth/login', { email: patient.email, password: PASSWORD });
  expect(login.status).toBe(403);
  expect(login.data.code).toBe('ACCOUNT_SUSPENDED_UNTIL');
  expect(login.data.message).toMatch(/suspendida hasta el \d+ de \w+ de \d{4}\. Motivo: Publicó insultos contra un médico\./);
  // Sus autorizaciones a médicos siguen vigentes (la suspensión indefinida de «Cuentas» sí las revoca).
  const grantsAfter = await sql<{ id: string }>(
    `select g.id from "PatientDataGrant" g join "PatientProfile" p on p.id = g."patientId" where p."userId" = $1 and g."revokedAt" is null`,
    [user.id],
  );
  expect(grantsAfter.map((g) => g.id).sort()).toEqual(grantsBefore.map((g) => g.id).sort());

  // La pantalla de inicio de sesión lo explica y ofrece reclamar.
  const context = await browser.newContext();
  await spreadRateLimits(context);
  const page = await context.newPage();
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(patient.email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Filtrado por texto: el anunciador de rutas de Next también tiene el rol «alert».
  await expect(page.getByRole('alert').filter({ hasText: 'Tu cuenta está suspendida hasta el' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reclamar' })).toHaveAttribute('href', '/reclamos?tipo=REVIEW_ABUSE');
  await context.close();

  // Vence sola: con la fecha ya pasada vuelve a entrar.
  await sql(`update "UserSanction" set "startsAt" = now() - interval '8 days', "endsAt" = now() - interval '1 minute' where id = $1`, [accountBan.data.id]);
  await sql(`update "User" set "suspendedUntil" = now() - interval '1 minute' where id = $1`, [user.id]);
  expect((await api('POST', '/auth/login', { email: patient.email, password: PASSWORD })).status).toBe(200);

  // Al médico se le puede suspender la posibilidad de responder.
  const own = (await api('GET', '/reviews/me/professional', undefined, doctor.token)).data.items[0];
  const [doctorUser] = await sql<{ id: string }>(`select id from "User" where email = $1`, [doctor.email]);
  expect((await api('POST', '/reviews/admin/sanctions', { userId: doctorUser.id, type: 'REVIEWS', indefinite: true, reason: 'Respuestas con datos clínicos de pacientes.' }, admin)).status).toBe(201);
  const reply = await api('PUT', `/reviews/${own.id}/reply`, { content: 'Respuesta de prueba' }, doctor.token);
  expect(reply.status).toBe(403);
  expect(reply.data.message).toContain('por tiempo indefinido');
});

test('la identidad del autor es un registro de paciente: exige la bóveda y queda en la auditoría', async () => {
  const admin = await adminToken();
  const doctor = await dermatologist();
  const { patient, id } = await reviewWithComment(doctor, 'Muy amable y puntual en la consulta.');
  const [profile] = await sql<{ patientCode: string }>(
    `select p."patientCode" from "PatientProfile" p join "User" u on u.id = p."userId" where u.email = $1`,
    [patient.email],
  );

  // El caso trae el texto, las denuncias y las sanciones, pero no quién es.
  const caseData = await api('GET', `/reviews/admin/${id}`, undefined, admin);
  expect(caseData.status).toBe(200);
  expect(JSON.stringify(caseData.data)).not.toContain(patient.lastName);
  expect(JSON.stringify(caseData.data)).not.toContain(profile.patientCode);

  // Sin la bóveda abierta, la identidad no sale.
  const locked = await api('GET', `/patients/admin/reviews/${id}/author`, undefined, admin);
  expect(locked.status).toBe(403);
  expect(locked.data.code).toBe('PATIENT_VAULT_LOCKED');
  expect((await api('GET', `/patients/admin/reviews/${id}/author`, undefined, doctor.token)).status).toBe(403);

  // Con el código de seguridad (solo si la API de pruebas lo tiene configurado).
  const vaultCode = process.env.E2E_PATIENT_VAULT_CODE;
  if (!vaultCode) return;
  const session = await request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${admin}` } });
  expect((await session.post(`${API}/patients/admin/vault/unlock`, { data: { code: vaultCode } })).status()).toBe(200);
  const author = await session.get(`${API}/patients/admin/reviews/${id}/author`);
  expect(author.status()).toBe(200);
  expect(await author.json()).toMatchObject({ patientCode: profile.patientCode, name: `Pedro ${patient.lastName}` });
  await session.post(`${API}/patients/admin/vault/lock`);
  await session.dispose();
  const [audit] = await sql<{ n: number }>(
    `select count(*)::int as n from "AuditLog" where action = 'REVIEW_AUTHOR_VIEWED' and "resourceId" = $1`,
    [id],
  );
  expect(audit.n).toBe(1);
});

test('pantalla de moderación: abrir un caso y aprobarlo; sin fallas de accesibilidad', async ({ page }) => {
  const doctor = await dermatologist();
  await reviewWithComment(doctor, 'Me atendió con calma y respondió todas mis dudas.');
  await spreadRateLimits(page.context());
  await signInAsAdmin(page);
  await page.goto('/admin/valoraciones');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Valoraciones');
  await expect(page.getByRole('link', { name: 'Valoraciones', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByLabel('Médico').fill(doctor.lastName);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const card = page.locator('article').filter({ hasText: 'Me atendió con calma y respondió todas mis dudas.' });
  await expect(card).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  await card.getByRole('button', { name: 'Revisar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisar la valoración' });
  await expect(dialog).toContainText('Ver quién es (con el código de seguridad)');
  await dialog.getByRole('button', { name: 'Aprobar y publicar' }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toBeHidden();
  expect((await publicItems(doctor)).map((item) => item.comment)).toEqual(['Me atendió con calma y respondió todas mis dudas.']);
});

test('reclamos: categoría «Valoración abusiva o falsa» con el enlace de la opinión precargado', async ({ page }) => {
  const url = 'https://guiamedicamonagas.com/medicos/ejemplo#opinion-1';
  await page.goto(`/reclamos?tipo=REVIEW_ABUSE&url=${encodeURIComponent(url)}`);
  await expect(page.getByLabel(/Página o perfil/)).toHaveValue(url);
  const created = await api('POST', '/legal-requests', {
    category: 'REVIEW_ABUSE',
    requesterName: 'Carmen Prueba',
    requesterEmail: `reclamo-${Date.now()}@e2e.local`,
    subjectUrl: url,
    description: 'La opinión publicada contiene datos de salud de otra persona y debe retirarse.',
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
});
