// «Quiero que me contacte» (el paciente elige qué compartir, el médico lo ve
// solo dentro del pedido y el paciente lo retira) y «Apariciones en búsquedas»
// (conteos anónimos, solo con el consentimiento de análisis).
import { expect, test, type BrowserContext } from '@playwright/test';
import { api, createPatient, createPublishedDoctor, signIn, spreadRateLimits, sql } from './support';

interface Notice {
  type: string;
  title: string;
  content: string;
}

async function notices(token: string): Promise<Notice[]> {
  return (await api('GET', '/notifications?limit=50', undefined, token)).data.items as Notice[];
}

/** Paciente con el correo verificado (en la vida real, con el enlace del correo). */
async function patientWithEmail() {
  const patient = await createPatient();
  await sql(`update "User" set "isEmailVerified" = true where email = $1`, [patient.email]);
  return patient;
}

/** El visitante aceptó la analítica del sitio (como si eligiera «Aceptar todas»). */
async function acceptAnalytics(context: BrowserContext) {
  await context.addInitScript(() => {
    window.localStorage.setItem(
      'gmm_cookie_consent',
      JSON.stringify({ subjectId: 'e2e', analytics: true, marketing: false, decidedAt: new Date().toISOString() }),
    );
  });
}

const request = (slug: string, extra: Record<string, unknown> = {}) => ({
  professionalSlug: slug,
  shareName: true,
  phone: '0414-5551234',
  shareEmail: false,
  channel: 'WHATSAPP',
  preferredTime: 'En las mañanas',
  message: 'Quisiera una cita para control de la piel la próxima semana.',
  acceptConsent: true,
  ...extra,
});

test('«Quiero que me contacte»: el paciente elige qué compartir, el médico lo ve en el pedido y el paciente lo retira', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL_PLUS' });
  const patient = await patientWithEmail();

  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, patient.email);
  const page = await context.newPage();
  await page.goto(`/medicos/${doctor.slug}`);
  const form = page.getByRole('form', { name: 'Quiero que me contacte' });
  await expect(form).toBeVisible();
  await form.getByRole('checkbox', { name: /Mi teléfono/ }).check();
  await form.getByLabel('Teléfono', { exact: true }).fill('0414-5551234');
  await form.getByRole('radio', { name: 'WhatsApp' }).check();
  await form.getByLabel(/Horario/).fill('En las mañanas');
  await form.getByLabel('Mensaje').fill('Quisiera una cita para control de la piel la próxima semana.');
  await form.getByRole('checkbox', { name: /Autorizo a Dr\(a\)/ }).check();
  await form.getByRole('button', { name: 'Pedir que me contacte' }).click();
  await expect(page.getByText('Pedido enviado')).toBeVisible();

  // El médico lo ve en su bandeja; el aviso no lleva el teléfono ni el mensaje.
  const inbox = await api('GET', '/contact/me', undefined, doctor.token);
  const received = (inbox.data as { id: string; requestStatus: string; senderPhone: string; preferredChannel: string; identityVerified: boolean }[]).find(
    (m) => m.requestStatus === 'OPEN',
  );
  expect(received).toMatchObject({ senderPhone: '0414-5551234', preferredChannel: 'WHATSAPP', identityVerified: false });
  const notice = (await notices(doctor.token)).find((n) => n.type === 'CONTACT_REQUEST');
  expect(notice?.title).toBe(`Pedido de contacto de Pedro ${patient.lastName[0].toUpperCase()}.`);
  expect(JSON.stringify(notice)).not.toContain('5551234');
  expect(JSON.stringify(notice)).not.toContain('control de la piel');

  // El médico lo marca como contactado y el paciente recibe el aviso.
  expect((await api('PATCH', `/contact/requests/${received!.id}/status`, { status: 'CONTACTED' }, doctor.token)).status).toBe(200);
  expect((await notices(patient.token)).some((n) => n.type === 'CONTACT_REQUEST_CONTACTED')).toBe(true);

  // El paciente lo ve y lo retira: el médico deja de ver sus datos al instante.
  await page.goto('/paciente/contactos');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedidos de contacto');
  await expect(page.locator('main')).toContainText('Contactado');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Retirar el pedido' }).click();
  await expect(page.getByText('Retiraste el pedido: el médico ya no ve tus datos.')).toBeVisible();
  const [row] = await sql<{ senderPhone: string | null; content: string; senderName: string; requestStatus: string }>(
    `select "senderPhone", content, "senderName", "requestStatus" from "ContactMessage" where id = $1`,
    [received!.id],
  );
  expect(row).toEqual({ senderPhone: null, content: '', senderName: 'Datos borrados', requestStatus: 'WITHDRAWN' });
  expect((await notices(doctor.token)).some((n) => n.type === 'CONTACT_REQUEST_WITHDRAWN')).toBe(true);
  await context.close();
});

test('reglas del pedido: correo verificado, plan que recibe mensajes, uno abierto por médico y datos coherentes', async () => {
  const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL_PLUS' });
  const basic = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL' });
  const unverified = await createPatient();
  const patient = await patientWithEmail();

  expect((await api('POST', '/contact/requests', request(doctor.slug))).status).toBe(401);
  expect((await api('POST', '/contact/requests', request(doctor.slug), unverified.token)).status).toBe(403);
  expect((await api('POST', '/contact/requests', request(basic.slug), patient.token)).status).toBe(403);
  expect((await api('POST', '/contact/requests', request(doctor.slug, { acceptConsent: false }), patient.token)).status).toBe(400);
  expect((await api('POST', '/contact/requests', request(doctor.slug, { channel: 'EMAIL' }), patient.token)).status).toBe(400);
  expect((await api('POST', '/contact/requests', request(doctor.slug, { phone: undefined }), patient.token)).status).toBe(400);
  expect((await api('POST', '/contact/requests', request(doctor.slug), doctor.token)).status).toBe(403);

  const created = await api('POST', '/contact/requests', request(doctor.slug), patient.token);
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  expect((await api('POST', '/contact/requests', request(doctor.slug), patient.token)).status).toBe(409);
  // Nadie más toca el pedido.
  expect((await api('PATCH', `/contact/requests/${created.data.id}/status`, { status: 'CLOSED' }, basic.token)).status).toBe(404);
  expect((await api('PATCH', `/contact/requests/${created.data.id}/withdraw`, undefined, unverified.token)).status).toBe(404);
  // Vence a los 30 días.
  const [row] = await sql<{ days: number }>(
    `select round(extract(epoch from ("expiresAt" - "createdAt")) / 86400)::int as days from "ContactMessage" where id = $1`,
    [created.data.id],
  );
  expect(row.days).toBe(30);
});

test('apariciones en búsquedas: se cuentan solo con la analítica aceptada y nunca guardan lo escrito', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ specialtySlug: 'dermatologia', tier: 'PROFESSIONAL' });
  const count = async () =>
    (
      await sql<{ total: number }>(
        `select coalesce(sum(count), 0)::int as total from "SearchAppearance" where "professionalId" = $1 and "specialtySlug" = 'dermatologia'`,
        [doctor.id],
      )
    )[0].total;

  // Sin consentimiento no se cuenta nada.
  const without = await browser.newContext();
  await spreadRateLimits(without);
  const plain = await without.newPage();
  await plain.goto(`/medicos?especialidad=dermatologia&q=${doctor.lastName}`);
  await expect(plain.getByRole('link', { name: new RegExp(doctor.lastName) }).first()).toBeVisible();
  await plain.waitForTimeout(1500);
  expect(await count()).toBe(0);
  await without.close();

  // Con la analítica aceptada, sí: por especialidad, sin el texto buscado.
  const withConsent = await browser.newContext();
  await spreadRateLimits(withConsent);
  await acceptAnalytics(withConsent);
  const page = await withConsent.newPage();
  await page.goto(`/medicos?especialidad=dermatologia&q=${doctor.lastName}`);
  await expect(page.getByRole('link', { name: new RegExp(doctor.lastName) }).first()).toBeVisible();
  await expect.poll(count).toBe(1);
  const rows = await sql<Record<string, unknown>>(`select * from "SearchAppearance" where "professionalId" = $1`, [doctor.id]);
  expect(JSON.stringify(rows)).not.toContain(doctor.lastName.toLowerCase());
  await withConsent.close();

  // Una especialidad o un municipio que no existen se cuentan como «sin filtro».
  const odd = await api('POST', '/analytics/search-appearances', { professionalIds: [doctor.id], specialty: 'oncologia-infantil-x', municipality: 'Atlantis' });
  expect(odd.status).toBe(200);
  const [general] = await sql<{ n: number }>(
    `select count(*)::int as n from "SearchAppearance" where "professionalId" = $1 and "specialtySlug" = '' and municipality = ''`,
    [doctor.id],
  );
  expect(general.n).toBe(1);
  expect((await api('POST', '/analytics/search-appearances', { professionalIds: ['no-es-un-id'] })).status).toBe(400);

  // El médico (plan Profesional) lo ve en sus estadísticas, siempre en total.
  const stats = await api('GET', '/analytics/me', undefined, doctor.token);
  expect(stats.data.searches.last30).toBe(2);
  expect(stats.data.searches.bySpecialty).toEqual([{ slug: 'dermatologia', name: 'Dermatología', count: 1 }]);
});
