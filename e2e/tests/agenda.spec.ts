// Agenda del médico: calendario con arrastrar y soltar, «Mover» sin arrastrar,
// horario semanal, historial de cada cita, límites de reserva, bloqueos y
// citas fuera de horario sin solapes. También la reprogramación del paciente.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  api,
  caracasDay,
  createPatient,
  createPublishedDoctor,
  pickFirstFreeDay,
  signIn,
  spreadRateLimits,
  sql,
  type Doctor,
  type Patient,
} from './support';

interface Detail {
  id: string;
  startsAt: string;
  status: string;
  patient: { patientId: string; patientCode: string; name: string | null };
  events: { type: string; actor: string; previousStartsAt: string | null; newStartsAt: string | null; outsideSchedule: boolean }[];
}

/** «2026-10-05» + «09:00» de Caracas → instante ISO. */
const caracas = (day: string, time: string) => new Date(`${day}T${time}:00-04:00`).toISOString();
const tomorrow = () => caracasDay(1);

async function freeSlots(doctorId: string, day: string): Promise<string[]> {
  const res = await api('GET', `/appointments/availability?professionalId=${doctorId}&from=${day}&to=${day}`);
  expect(res.status).toBe(200);
  return res.data as string[];
}

/** El paciente reserva un horario de mañana (por defecto el primero, 7:00). */
async function book(doctor: Doctor, patient: Patient, startsAt?: string, extra: Record<string, unknown> = {}) {
  const slot = startsAt ?? (await freeSlots(doctor.id, tomorrow()))[0];
  const res = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: slot, ...extra }, patient.token);
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data as { id: string; startsAt: string };
}

async function detail(doctor: Doctor, id: string): Promise<Detail> {
  const res = await api('GET', `/appointments/me/${id}`, undefined, doctor.token);
  expect(res.status).toBe(200);
  return res.data as Detail;
}

async function doctorPage(browser: import('@playwright/test').Browser, doctor: Doctor): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  await spreadRateLimits(context);
  await signIn(context, doctor.email);
  return context.newPage();
}

test('el médico mueve una cita arrastrándola en el calendario y queda en su historial', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const appointment = await book(doctor, patient, caracas(tomorrow(), '07:00'));
  const { patient: label } = await detail(doctor, appointment.id);

  const page = await doctorPage(browser, doctor);
  // Desde un aviso (?cita=…) el calendario va al día de la cita y abre su detalle.
  await page.goto(`/dashboard/agenda?cita=${appointment.id}`);
  const dialog = page.getByRole('dialog', { name: `Cita con ${label.patientCode}` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).click();

  const event = page.locator('.fc-timegrid-event', { hasText: label.patientCode });
  await expect(event).toBeVisible();
  const from = await page.locator('td.fc-timegrid-slot-lane[data-time="07:00:00"]').boundingBox();
  const to = await page.locator('td.fc-timegrid-slot-lane[data-time="09:00:00"]').boundingBox();
  const box = await event.boundingBox();
  // Se arrastra 2 horas hacia abajo, en la misma columna (mañana).
  const x = box!.x + box!.width / 2;
  const y = box!.y + Math.min(8, box!.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 10, { steps: 4 });
  await page.mouse.move(x, y + (to!.y - from!.y), { steps: 12 });
  await page.mouse.up();

  const confirm = page.getByRole('dialog', { name: 'Mover la cita' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Le avisaremos al paciente');
  await confirm.getByRole('button', { name: 'Mover la cita' }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('Cita movida');

  const moved = await detail(doctor, appointment.id);
  expect(moved.startsAt).toBe(caracas(tomorrow(), '09:00'));
  const rescheduled = moved.events.find((e) => e.type === 'RESCHEDULED');
  expect(rescheduled).toMatchObject({ actor: 'PROFESSIONAL', previousStartsAt: caracas(tomorrow(), '07:00'), newStartsAt: caracas(tomorrow(), '09:00') });

  // El paciente recibe el aviso; el médico no se avisa a sí mismo.
  const patientNotices = (await api('GET', '/notifications', undefined, patient.token)).data.items as { type: string }[];
  expect(patientNotices.some((n) => n.type === 'APPOINTMENT_RESCHEDULED')).toBe(true);
  const doctorNotices = (await api('GET', '/notifications', undefined, doctor.token)).data.items as { type: string }[];
  expect(doctorNotices.some((n) => n.type === 'APPOINTMENT_RESCHEDULED')).toBe(false);

  // Accesibilidad del calendario (WCAG 2 A/AA, fallas graves).
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.help}`);
  expect(serious, 'fallas de accesibilidad graves o críticas').toEqual([]);
  await page.context().close();
});

test('«Mover» sin arrastrar: el médico elige otro día y hora libres en el detalle', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const appointment = await book(doctor, patient, caracas(tomorrow(), '07:00'));

  const page = await doctorPage(browser, doctor);
  await page.goto(`/dashboard/agenda?cita=${appointment.id}`);
  const dialog = page.getByRole('dialog', { name: /^Cita con / });
  await dialog.getByRole('button', { name: 'Mover' }).click();
  await pickFirstFreeDay(page);
  const hours = dialog.getByRole('group', { name: 'Hora' }).getByRole('button');
  await expect(hours.first()).toBeVisible();
  await hours.nth(3).click();
  await dialog.getByRole('button', { name: 'Guardar el cambio' }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('Cita movida');

  const moved = await detail(doctor, appointment.id);
  expect(moved.startsAt).not.toBe(appointment.startsAt);
  expect(moved.events.map((e) => e.type)).toEqual(['CREATED', 'RESCHEDULED']);
  await page.context().close();
});

test('fuera de horario solo para el médico y nunca encima de otra cita', async () => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const day = tomorrow();
  const first = await book(doctor, patient, caracas(day, '07:00'));

  // A las 21:00 no hay horario de atención: el médico la carga marcándolo.
  const late = { firstName: 'Ana', lastName: 'Prueba', startsAt: caracas(day, '21:00') };
  expect((await api('POST', '/appointments/me/manual', late, doctor.token)).status).toBe(409);
  expect((await api('POST', '/appointments/me/manual', { ...late, outsideSchedule: true }, doctor.token)).status).toBe(201);
  // 21:15 pisa la de 21:00 (30 min): ni fuera de horario.
  const overlap = await api('POST', '/appointments/me/manual', { ...late, startsAt: caracas(day, '21:15'), outsideSchedule: true }, doctor.token);
  expect(overlap.status).toBe(409);

  // El paciente no puede llevar su cita fuera del horario, aunque lo pida.
  const patientMove = await api('PATCH', `/appointments/${first.id}/reschedule`, { startsAt: caracas(day, '21:30'), outsideSchedule: true }, patient.token);
  expect(patientMove.status).toBe(409);

  // El médico la corre a las 7:10 (fuera de la cuadrícula): ese horario y el de 7:30 dejan de ofrecerse.
  const doctorMove = await api('PATCH', `/appointments/${first.id}/reschedule`, { startsAt: caracas(day, '07:10'), outsideSchedule: true }, doctor.token);
  expect(doctorMove.status, JSON.stringify(doctorMove.data)).toBe(200);
  const slots = await freeSlots(doctor.id, day);
  expect(slots).not.toContain(caracas(day, '07:30'));
  expect(slots).toContain(caracas(day, '08:00'));
  const other = await createPatient();
  const clash = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: caracas(day, '07:30') }, other.token);
  expect(clash.status).toBe(409);
  expect((await detail(doctor, first.id)).events.at(-1)).toMatchObject({ type: 'RESCHEDULED', outsideSchedule: true });
});

test('límites de reserva del paciente: antelación mínima y días hacia adelante', async () => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const config = { slotDurationMinutes: 30, bufferMinutes: 0, autoConfirm: false, bookingWindowDays: 7, minNoticeMinutes: 1440 };
  expect((await api('PUT', '/agenda/me', config, doctor.token)).status).toBe(200);

  const all = await api('GET', `/appointments/availability?professionalId=${doctor.id}&from=${caracasDay()}&to=${caracasDay(20)}`);
  const days = new Set((all.data as string[]).map((s) => new Date(s).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })));
  expect(days.has(caracasDay())).toBe(false);
  expect([...days].every((d) => d <= caracasDay(7))).toBe(true);
  expect((all.data as string[]).every((s) => new Date(s).getTime() >= Date.now() + 24 * 3600_000 - 60_000)).toBe(true);

  const tooFar = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: caracas(caracasDay(10), '09:00') }, patient.token);
  expect(tooFar.status).toBe(400);
  expect(String(tooFar.data.message)).toContain('7 días');
  const tooSoon = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: new Date(Date.now() + 3 * 3600_000).toISOString() }, patient.token);
  expect(tooSoon.status).toBe(400);
  expect(String(tooSoon.data.message)).toContain('antelación');
});

test('un tramo bloqueado deja de ofrecerse y aparece en el calendario con su motivo', async () => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const day = tomorrow();
  const block = await api('POST', '/agenda/me/exceptions', { date: day, isBlocked: true, startTime: '08:00', endTime: '10:00', reason: 'Junta médica' }, doctor.token);
  expect(block.status).toBe(201);
  const slots = await freeSlots(doctor.id, day);
  expect(slots).toContain(caracas(day, '07:30'));
  expect(slots).not.toContain(caracas(day, '08:00'));
  expect(slots).not.toContain(caracas(day, '09:30'));
  expect(slots).toContain(caracas(day, '10:00'));

  const calendar = await api('GET', `/appointments/me/calendar?from=${day}&to=${day}`, undefined, doctor.token);
  expect(calendar.data.days[0].blocked).toEqual([
    expect.objectContaining({ id: block.data.id, allDay: false, reason: 'Junta médica', start: caracas(day, '08:00') }),
  ]);
  expect((await api('DELETE', `/agenda/me/exceptions/${block.data.id}`, undefined, doctor.token)).status).toBe(200);
  expect(await freeSlots(doctor.id, day)).toContain(caracas(day, '08:00'));
});

test('el horario semanal se edita también sin arrastrar, con el formulario y la lista', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const page = await doctorPage(browser, doctor);
  await page.goto('/dashboard/agenda/horario');
  await expect(page.getByRole('heading', { name: 'Horario semanal' })).toBeVisible();
  // El domingo también se ve en la cuadrícula (lunes a domingo).
  await expect(page.locator('.gmm-schedule-block')).toHaveCount(7);

  await page.getByLabel('Desde').fill('21:00');
  await page.getByLabel('Hasta').fill('22:00');
  await page.getByRole('button', { name: 'Agregar bloque' }).click();
  await expect(page.getByText('Cambios guardados')).toBeVisible();
  const remove = page.getByRole('button', { name: 'Eliminar el bloque del lunes de 21:00 a 22:00' });
  await expect(remove).toBeVisible();
  let blocks = (await api('GET', '/agenda/me/blocks', undefined, doctor.token)).data as { dayOfWeek: number; startTime: string }[];
  expect(blocks.some((b) => b.dayOfWeek === 1 && b.startTime === '21:00')).toBe(true);

  await remove.click();
  await page.getByRole('dialog', { name: 'Quitar el bloque' }).getByRole('button', { name: 'Quitar el bloque' }).click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByText('Cambios guardados')).toBeVisible();
  blocks = (await api('GET', '/agenda/me/blocks', undefined, doctor.token)).data;
  expect(blocks.some((b) => b.dayOfWeek === 1 && b.startTime === '21:00')).toBe(false);
  await page.context().close();
});

test('el paciente reprograma su cita desde «Mis citas» y el médico recibe el aviso', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const appointment = await book(doctor, patient, caracas(tomorrow(), '07:00'));

  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, patient.email);
  const page = await context.newPage();
  await page.goto('/paciente/citas');
  await page.getByRole('button', { name: 'Reprogramar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reprogramar la cita' });
  await pickFirstFreeDay(page);
  await dialog.getByRole('group', { name: 'Hora' }).getByRole('button').nth(2).click();
  await dialog.getByRole('button', { name: 'Cambiar a este horario' }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('Cita reprogramada');

  const moved = await detail(doctor, appointment.id);
  expect(moved.startsAt).not.toBe(appointment.startsAt);
  expect(moved.events.at(-1)).toMatchObject({ type: 'RESCHEDULED', actor: 'PATIENT' });
  const notices = (await api('GET', '/notifications', undefined, doctor.token)).data.items as { type: string; title: string; link: string }[];
  const notice = notices.find((n) => n.type === 'APPOINTMENT_RESCHEDULED');
  expect(notice?.title).toBe('Cita reprogramada por el paciente');
  expect(notice?.link).toBe(`/dashboard/agenda?cita=${appointment.id}`);
  await context.close();
});

test('historial: los datos del paciente según su autorización, filtros y totales', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const day = tomorrow();
  // Una con permiso de identidad (el médico ve su nombre) y otra que se cancela.
  const shared = await book(doctor, patient, caracas(day, '07:00'), { shareScopes: ['IDENTITY'], shareDays: 30 });
  const cancelled = await book(doctor, patient, caracas(day, '08:00'));
  expect((await api('PATCH', `/appointments/${cancelled.id}/cancel`, { cancellationReason: 'Viaje' }, patient.token)).status).toBe(200);

  const { patient: label } = await detail(doctor, shared.id);
  expect(label.name).toBe(`${patient.firstName} ${patient.lastName}`);
  // Ver el nombre de un paciente con cuenta queda en la auditoría.
  const audits = await sql(`select count(*)::int as n from "AuditLog" where action = 'PATIENT_AGENDA_VIEWED' and details::text like $1`, [`%${label.patientId}%`]);
  expect(audits[0].n).toBeGreaterThan(0);

  const page = await doctorPage(browser, doctor);
  await page.goto(`/dashboard/agenda/historial?paciente=${label.patientId}`);
  await expect(page.getByRole('heading', { name: `Citas con ${patient.firstName} ${patient.lastName}` })).toBeVisible();
  await expect(page.locator('main')).toContainText('Cancelada: 1');
  // El médico de prueba confirma solo (confirmación automática).
  await expect(page.locator('main')).toContainText('Confirmada: 1');

  await page.getByRole('combobox', { name: 'Estado' }).click();
  await page.getByRole('option', { name: 'Cancelada' }).click();
  await page.getByRole('button', { name: 'Filtrar' }).click();
  const rows = page.locator('main .card button').filter({ hasText: label.patientCode });
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  const dialog = page.getByRole('dialog', { name: /^Cita con / });
  await expect(dialog).toContainText('Cancelada por el paciente');
  await expect(dialog).toContainText('motivo: Viaje');
  await page.context().close();
});
