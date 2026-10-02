// Centro de notificaciones: la campana de la cabecera, la página de cada panel,
// los correos opcionales y los avisos a la administración.
import { expect, test } from '@playwright/test';
import { adminToken, api, createPatient, createPublishedDoctor, signIn, spreadRateLimits, uid } from './support';

interface Notice {
  id: string;
  type: string;
  title: string;
  content: string;
  link: string | null;
  isRead: boolean;
}

async function notices(token: string): Promise<Notice[]> {
  const res = await api('GET', '/notifications?limit=50', undefined, token);
  expect(res.status).toBe(200);
  return (res.data as { items: Notice[] }).items;
}

async function unread(token: string): Promise<number> {
  return (await api('GET', '/notifications/unread-count', undefined, token)).data.count as number;
}

/** El paciente reserva por la API el primer horario libre de mañana. */
async function book(doctorId: string, patientToken: string) {
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  const slots = await api('GET', `/appointments/availability?professionalId=${doctorId}&from=${tomorrow}&to=${tomorrow}`);
  expect((slots.data as string[]).length, 'hay horarios libres mañana').toBeGreaterThan(0);
  const created = await api('POST', '/appointments', { professionalId: doctorId, startsAt: slots.data[0] }, patientToken);
  expect(created.status, JSON.stringify(created.data)).toBe(201);
}

test('la campana avisa al médico de una cita nueva y lo lleva a sus citas', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  await book(doctor.id, patient.token);

  const before = await unread(doctor.token);
  expect(before).toBeGreaterThan(0);
  const request = (await notices(doctor.token)).find((n) => n.type === 'APPOINTMENT_REQUESTED');
  expect(request?.link, 'el aviso lleva a las citas del médico').toBe('/dashboard/citas');

  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, doctor.email);
  const page = await context.newPage();
  await page.goto('/dashboard');
  const bell = page.getByRole('button', { name: /^Notificaciones: \d+ sin leer$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.getByRole('region', { name: 'Notificaciones' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /Nueva solicitud de cita/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/citas$/);
  await expect.poll(() => unread(doctor.token)).toBe(before - 1);

  // La página «Notificaciones» del panel: marcar todo como leído apaga el contador.
  await page.getByRole('button', { name: /^Notificaciones/ }).first().click();
  await page.getByRole('region', { name: 'Notificaciones' }).getByRole('link', { name: 'Ver todas' }).click();
  await expect(page).toHaveURL(/\/dashboard\/notificaciones$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notificaciones');
  await expect(page.locator('main')).toContainText('Nueva solicitud de cita');
  await page.getByRole('button', { name: 'Marcar todas como leídas' }).click();
  await expect(page.getByRole('button', { name: 'Notificaciones', exact: true })).toBeVisible();
  expect(await unread(doctor.token)).toBe(0);
  await context.close();
});

test('el paciente apaga los recordatorios por correo y la preferencia queda guardada', async ({ browser }) => {
  const patient = await createPatient();
  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, patient.email);
  const page = await context.newPage();
  await page.goto('/paciente/notificaciones');
  const reminders = page.getByRole('switch', { name: /Recordatorios de tus citas/ });
  await expect(reminders).toHaveAttribute('aria-checked', 'true');
  await reminders.click();
  await expect(reminders).toHaveAttribute('aria-checked', 'false');
  await expect(reminders).toBeEnabled();

  await page.reload();
  await expect(page.getByRole('switch', { name: /Recordatorios de tus citas/ })).toHaveAttribute('aria-checked', 'false');
  const prefs = await api('GET', '/notifications/preferences', undefined, patient.token);
  expect(prefs.data.email).toEqual([expect.objectContaining({ type: 'APPOINTMENT_REMINDER', enabled: false })]);

  // Solo se aceptan los correos opcionales de su tipo de cuenta.
  const foreign = await api('PUT', '/notifications/preferences', { emailOptOut: ['APPOINTMENT_CONFIRMED'] }, patient.token);
  expect(foreign.status).toBe(400);
  await context.close();
});

test('la administración recibe en la campana cada reclamo nuevo', async () => {
  const description = `Prueba de aviso a la administración ${uid()}: el perfil muestra datos que no corresponden.`;
  const created = await api('POST', '/legal-requests', {
    category: 'OTHER',
    requesterName: 'Carmen Prueba',
    requesterEmail: `reclamo-${uid()}@e2e.local`,
    description,
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  const ticket = created.data.ticket as string;

  const admin = await adminToken();
  const notice = (await notices(admin)).find((n) => n.type === 'LEGAL_REQUEST_CREATED' && n.title.includes(ticket));
  expect(notice, 'aviso del reclamo en la campana').toBeTruthy();
  expect(notice!.link).toBe('/admin/solicitudes');
});

test('cada cuenta ve y marca solo sus propios avisos', async () => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  await book(doctor.id, patient.token);
  const foreign = (await notices(doctor.token)).find((n) => !n.isRead);
  expect(foreign).toBeTruthy();

  // El paciente no puede marcar como leído un aviso del médico ni verlo con su id como cursor.
  expect((await api('PATCH', `/notifications/${foreign!.id}/read`, undefined, patient.token)).status).toBe(200);
  expect((await notices(doctor.token)).find((n) => n.id === foreign!.id)?.isRead).toBe(false);
  const page = await api('GET', `/notifications?cursor=${foreign!.id}`, undefined, patient.token);
  expect(JSON.stringify(page.data)).not.toContain(foreign!.id);
  expect((await api('PATCH', '/notifications/no-es-un-id/read', undefined, patient.token)).status).toBe(400);
  expect((await api('GET', '/notifications')).status).toBe(401);
});
