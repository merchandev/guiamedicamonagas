// Valoraciones de pacientes: quién puede opinar (lo decide la API), publicación
// inmediata sin comentario y moderación previa con comentario, promedio desde
// tres, autor anónimo por defecto, respuesta y denuncia del médico.
// La API de CI corre con REVIEWS_ENABLED=true; en producción siguen apagadas.
// Médicos de dermatología: no se suman a los cardiólogos que listan otras pruebas.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  adminToken,
  api,
  completedVisit,
  createPatient,
  createPublishedDoctor,
  type Doctor,
  registeredByCode,
  signIn,
  spreadRateLimits,
  sql,
  verifiedPatient,
} from './support';

interface Notice {
  type: string;
  link: string | null;
}

async function notices(token: string): Promise<Notice[]> {
  return (await api('GET', '/notifications?limit=50', undefined, token)).data.items as Notice[];
}

function review(professionalId: string, rating: number, extra: Record<string, unknown> = {}) {
  return { professionalId, rating, authorDisplay: 'ANONYMOUS', acceptRules: true, ...extra };
}

test('solo opina un paciente con registro completo, cédula aprobada y consulta verificada', async () => {
  const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL', agenda: true });

  // Registro incompleto: la API lo dice y no deja valorar.
  const fresh = await createPatient();
  const mine = await api('GET', '/reviews/me', undefined, fresh.token);
  expect(mine.status).toBe(200);
  expect(mine.data.requirements.canReview).toBe(false);
  expect(mine.data.requirements.completeness.percent).toBeLessThan(100);
  expect(mine.data.requirements.blockers.join(' ')).toContain('Completa tu registro');
  expect((await api('POST', '/reviews', review(doctor.id, 5), fresh.token)).status).toBe(403);

  // Registro completo pero la cédula en revisión.
  const pending = await verifiedPatient();
  await sql(`update "PatientProfile" set "identityStatus" = 'PENDING' where id = $1`, [pending.profileId]);
  const inReview = await api('POST', '/reviews', review(doctor.id, 5), pending.token);
  expect(inReview.status).toBe(403);
  expect(inReview.data.message).toContain('en revisión');

  // Todo en regla, pero sin consulta con ese médico.
  const stranger = await verifiedPatient();
  const noVisit = await api('POST', '/reviews', review(doctor.id, 5), stranger.token);
  expect(noVisit.status).toBe(403);
  expect(noVisit.data.message).toContain('consulta verificada');

  // Una cita realizada pero futura tampoco cuenta.
  const early = await verifiedPatient();
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  const slots = await api('GET', `/appointments/availability?professionalId=${doctor.id}&from=${tomorrow}&to=${tomorrow}`);
  const booked = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: slots.data[0] }, early.token);
  expect((await api('PATCH', `/appointments/me/${booked.data.id}/complete`, undefined, doctor.token)).status).toBe(200);
  expect((await api('POST', '/reviews', review(doctor.id, 5), early.token)).status).toBe(403);

  // Sin aceptar las reglas, o desde una cuenta de médico: no.
  await completedVisit(doctor, stranger);
  expect((await api('POST', '/reviews', review(doctor.id, 5, { acceptRules: false }), stranger.token)).status).toBe(400);
  expect((await api('POST', '/reviews', review(doctor.id, 6), stranger.token)).status).toBe(400);
  expect((await api('POST', '/reviews', review(doctor.id, 5), doctor.token)).status).toBe(403);
  expect((await api('POST', '/reviews', review(doctor.id, 5))).status).toBe(401);

  // Con la consulta verificada, sí; y una sola vez por médico.
  const created = await api('POST', '/reviews', review(doctor.id, 5), stranger.token);
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  expect(created.data.status).toBe('PUBLISHED');
  expect((await api('POST', '/reviews', review(doctor.id, 4), stranger.token)).status).toBe(409);
});

test('sin comentario se publica al instante, el promedio aparece desde la tercera y la ficha la muestra', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL', agenda: true });
  const [first, second, third] = await Promise.all([verifiedPatient(), verifiedPatient(), verifiedPatient()]);
  for (const patient of [first, second, third]) await completedVisit(doctor, patient);

  // El primero valora desde su panel, con el formulario.
  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, first.email);
  const page = await context.newPage();
  await page.goto(`/paciente/valoraciones?medico=${doctor.slug}`);
  const dialog = page.getByRole('dialog', { name: /Tu opinión sobre/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /5 estrellas/ }).check({ force: true });
  await dialog.getByRole('checkbox', { name: 'Acepto estas reglas.' }).check();
  await dialog.getByRole('button', { name: 'Enviar valoración' }).click();
  await expect(page.getByText('¡Gracias! Tu valoración ya está publicada.')).toBeVisible();
  await expect(page.locator('main')).toContainText('Publicada');
  await context.close();

  // Con una sola opinión todavía no hay promedio.
  let list = await api('GET', `/reviews/professional/${doctor.slug}`);
  expect(list.data.summary).toEqual({ average: null, count: 1, distribution: null });
  expect((await notices(doctor.token)).some((n) => n.type === 'REVIEW_PUBLISHED' && n.link === '/dashboard/valoraciones')).toBe(true);

  for (const [patient, rating] of [[second, 4], [third, 3]] as const) {
    const created = await api('POST', '/reviews', review(doctor.id, rating), patient.token);
    expect(created.status, JSON.stringify(created.data)).toBe(201);
  }
  list = await api('GET', `/reviews/professional/${doctor.slug}`);
  expect(list.data.summary.average).toBe(4);
  expect(list.data.summary.count).toBe(3);
  expect(list.data.summary.distribution).toEqual([
    { stars: 5, count: 1 },
    { stars: 4, count: 1 },
    { stars: 3, count: 1 },
    { stars: 2, count: 0 },
    { stars: 1, count: 0 },
  ]);
  const detail = await api('GET', `/professionals/${doctor.slug}`);
  expect(detail.data.rating).toEqual({ average: 4, count: 3 });
  // Nada que identifique a un autor anónimo ni la fecha exacta de la consulta.
  const body = JSON.stringify(list.data);
  for (const patient of [first, second, third]) expect(body).not.toContain(patient.lastName);
  expect(body).not.toMatch(/GMM-|patientId|startsAt|"20\d\d-\d\d-\d\d/);
  expect(list.data.items.every((item: { author: string }) => item.author === 'Paciente verificado')).toBe(true);

  // La ficha pública: promedio, distribución y aviso, sin fallas de accesibilidad.
  const visitor = await browser.newContext();
  const publicPage = await visitor.newPage();
  await publicPage.goto(`/medicos/${doctor.slug}`);
  const section = publicPage.locator('#opiniones');
  await expect(section.getByRole('heading', { name: 'Opiniones de pacientes' })).toBeVisible();
  await expect(section).toContainText('4,0');
  await expect(section).toContainText('3 opiniones');
  await expect(section).toContainText('No son una recomendación de Guía Médica Monagas');
  await expect(section.getByRole('img', { name: '4 de 5 estrellas' }).first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page: publicPage }).include('#opiniones').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await visitor.close();
});

test('con comentario espera moderación; el filtro marca un teléfono; el autor la edita o la borra', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL', agenda: true });
  const patient = await verifiedPatient();
  await completedVisit(doctor, patient);

  const created = await api(
    'POST',
    '/reviews',
    review(doctor.id, 2, { comment: 'Me hizo esperar dos horas. Llámenme al 0414-555.12.34 y les cuento.' }),
    patient.token,
  );
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  expect(created.data.status).toBe('PENDING');
  const [row] = await sql<{ flags: string[] }>(`select flags from "Review" where id = $1`, [created.data.id]);
  expect(row.flags).toContain('PHONE');
  // No se publica ni cuenta para el promedio.
  const list = await api('GET', `/reviews/professional/${doctor.slug}`);
  expect(list.data.items).toEqual([]);
  expect(list.data.summary.count).toBe(0);
  // La administración recibe el aviso; el médico no.
  expect((await notices(await adminToken())).some((n) => n.type === 'REVIEW_PENDING')).toBe(true);
  expect((await notices(doctor.token)).some((n) => n.type === 'REVIEW_PUBLISHED')).toBe(false);

  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, patient.email);
  const page = await context.newPage();
  await page.goto('/paciente/valoraciones');
  await expect(page.locator('main')).toContainText('En revisión');
  await expect(page.locator('main')).toContainText('El equipo revisa tu comentario antes de publicarlo.');

  // Quitar el comentario la publica; borrarla la saca del sitio.
  const edited = await api('PATCH', `/reviews/${created.data.id}`, { comment: '', rating: 3, acceptRules: true }, patient.token);
  expect(edited.data.status).toBe('PUBLISHED');
  expect((await api('GET', `/reviews/professional/${doctor.slug}`)).data.summary.count).toBe(1);
  page.once('dialog', (d) => void d.accept());
  await page.reload();
  await page.getByRole('button', { name: 'Borrar' }).click();
  await expect(page.getByText('Borraste tu valoración.')).toBeVisible();
  expect((await api('GET', `/reviews/professional/${doctor.slug}`)).data.summary.count).toBe(0);
  const [{ count }] = await sql<{ count: string }>(`select "ratingCount" as count from "ProfessionalProfile" where id = $1`, [doctor.id]);
  expect(Number(count)).toBe(0);
  await context.close();
});

test('el médico responde (en revisión) y denuncia; no ve quién es el autor; nombre e inicial solo si el autor lo elige', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL', agenda: true });
  const named = await verifiedPatient();
  const anonymous = await verifiedPatient();
  await registeredByCode(doctor, named);
  await completedVisit(doctor, anonymous);
  expect((await api('POST', '/reviews', review(doctor.id, 4, { authorDisplay: 'INITIAL' }), named.token)).status).toBe(201);
  const anon = await api('POST', '/reviews', review(doctor.id, 1), anonymous.token);
  expect(anon.status).toBe(201);

  const publicList = (await api('GET', `/reviews/professional/${doctor.slug}`)).data;
  const authors = publicList.items.map((item: { author: string; basis: string }) => `${item.author}|${item.basis}`).sort();
  expect(authors).toEqual(['Paciente verificado|APPOINTMENT', `Pedro ${named.lastName[0].toUpperCase()}.|REGISTERED`]);

  const own = await api('GET', '/reviews/me/professional', undefined, doctor.token);
  expect(own.status).toBe(200);
  expect(JSON.stringify(own.data)).not.toContain(anonymous.lastName);
  // Otro médico no responde ni denuncia valoraciones ajenas.
  const other = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL' });
  expect((await api('PUT', `/reviews/${anon.data.id}/reply`, { content: 'Hola' }, other.token)).status).toBe(404);
  expect((await api('POST', `/reviews/${anon.data.id}/report`, { reason: 'FALSE' }, other.token)).status).toBe(404);

  // Desde su panel: responde y denuncia.
  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, doctor.email);
  const page = await context.newPage();
  await page.goto('/dashboard/valoraciones');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Valoraciones');
  await expect(page.getByRole('link', { name: 'Valoraciones', exact: true })).toHaveAttribute('aria-current', 'page');
  const card = page.locator('article').filter({ has: page.getByRole('img', { name: '1 de 5 estrellas' }) });
  await card.getByRole('button', { name: 'Responder' }).click();
  const replyDialog = page.getByRole('dialog', { name: 'Responder la opinión' });
  await replyDialog.getByLabel('Tu respuesta').fill('Lamentamos la espera; reorganizamos los horarios del consultorio.');
  await replyDialog.getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(page.getByText('Enviaste tu respuesta: se publica cuando el equipo la revise.')).toBeVisible();
  await expect(card).toContainText('En revisión');

  await card.getByRole('button', { name: 'Denunciar' }).click();
  const reportDialog = page.getByRole('dialog', { name: 'Denunciar la opinión' });
  await reportDialog.getByRole('combobox', { name: 'Motivo' }).click();
  await page.getByRole('option', { name: 'Es falsa' }).click();
  await reportDialog.getByRole('button', { name: 'Enviar denuncia' }).click();
  await expect(page.getByText(/Enviaste la denuncia/)).toBeVisible();
  await expect(card).toContainText('La administración la está revisando');
  await context.close();

  // La respuesta no se publica hasta moderarla; la denuncia es una sola y avisa a la administración.
  const after = (await api('GET', `/reviews/professional/${doctor.slug}`)).data;
  expect(after.items.every((item: { reply: unknown }) => item.reply === null)).toBe(true);
  expect((await api('POST', `/reviews/${anon.data.id}/report`, { reason: 'OFFENSIVE' }, doctor.token)).status).toBe(409);
  const adminNotices = await notices(await adminToken());
  expect(adminNotices.some((n) => n.type === 'REVIEW_REPORTED')).toBe(true);
  expect(adminNotices.some((n) => n.type === 'REVIEW_REPLY_PENDING')).toBe(true);
});

test('máximo tres valoraciones nuevas por día', async () => {
  const patient = await verifiedPatient();
  const doctors: Doctor[] = [];
  for (let i = 0; i < 4; i++) {
    const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL' });
    await registeredByCode(doctor, patient);
    doctors.push(doctor);
  }
  for (const doctor of doctors.slice(0, 3)) {
    expect((await api('POST', '/reviews', review(doctor.id, 5), patient.token)).status).toBe(201);
  }
  const fourth = await api('POST', '/reviews', review(doctors[3].id, 5), patient.token);
  expect(fourth.status).toBe(429);
  expect(fourth.data.message).toContain('máximo de valoraciones por día');
});
