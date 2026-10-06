// Sincronización en tiempo real (ACT-0049): lo que cambia en un lado (otro
// dispositivo, la app, la API) aparece en la página abierta sin recargarla.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { api, caracasDay, createPatient, createPublishedDoctor, pickFirstFreeDay, signIn, spreadRateLimits } from './support';

/** Se cumple cuando el canal de la página está conectado y en sus salas (mensaje «ready»). */
function liveChannel(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on('websocket', (socket) => {
      if (!socket.url().includes('/realtime')) return;
      socket.on('framereceived', (frame) => {
        if (String(frame.payload).includes('"ready"')) resolve();
      });
    });
  });
}

async function openAs(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  await spreadRateLimits(context);
  await signIn(context, email);
  return context.newPage();
}

async function firstFreeSlot(doctorId: string): Promise<string> {
  const res = await api('GET', `/appointments/availability?professionalId=${doctorId}&from=${caracasDay()}&to=${caracasDay(30)}`);
  expect(res.status).toBe(200);
  const slots = [...(res.data as string[])].sort();
  expect(slots.length, 'el médico tiene horarios libres').toBeGreaterThan(0);
  return slots[0];
}

test('la agenda y la campana del médico muestran al instante la cita que reserva un paciente', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const page = await openAs(browser, doctor.email);
  const live = liveChannel(page);
  await page.goto('/dashboard/agenda/historial');
  await live;
  // El médico de prueba ya tiene avisos (documentos aprobados, verificación).
  const unread = (await api('GET', '/notifications/unread-count', undefined, doctor.token)).data.count as number;
  const label = (count: number) => (count ? `Notificaciones: ${count} sin leer` : 'Notificaciones');
  const bell = page.getByRole('button', { name: /^Notificaciones/ });
  await expect(bell).toHaveAttribute('aria-label', label(unread));

  // El paciente reserva desde otro lado (la app usa esta misma API).
  const booked = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: await firstFreeSlot(doctor.id) }, patient.token);
  expect(booked.status, JSON.stringify(booked.data)).toBe(201);
  const code = (await api('GET', `/appointments/me/${booked.data.id}`, undefined, doctor.token)).data.patient.patientCode as string;

  // Sin recargar, y antes de la consulta de respaldo de la campana (cada minuto).
  await expect(page.locator('main')).toContainText(code, { timeout: 10_000 });
  await expect(bell).toHaveAttribute('aria-label', label(unread + 1), { timeout: 10_000 });
  await page.context().close();
});

test('el paciente ve en «Mis citas» la cancelación que hace el médico en otro dispositivo', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const booked = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: await firstFreeSlot(doctor.id) }, patient.token);
  expect(booked.status, JSON.stringify(booked.data)).toBe(201);

  const page = await openAs(browser, patient.email);
  const live = liveChannel(page);
  await page.goto('/paciente/citas');
  await live;
  await expect(page.locator('main')).toContainText(doctor.lastName);
  await expect(page.locator('main')).not.toContainText('Cancelada');

  const cancelled = await api('PATCH', `/appointments/${booked.data.id}/cancel`, { cancellationReason: 'Imprevisto del consultorio' }, doctor.token);
  expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
  await expect(page.locator('main')).toContainText('Cancelada', { timeout: 10_000 });
  await page.context().close();
});

test('si otro paciente toma el horario elegido, la reserva lo quita y avisa', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const [patient, other] = await Promise.all([createPatient(), createPatient()]);
  const page = await openAs(browser, patient.email);
  const live = liveChannel(page);
  // El navegador pide mirar los horarios de ese médico apenas aparece el calendario.
  const watching = page.waitForEvent('websocket', { predicate: (s) => s.url().includes('/realtime') }).then((socket) =>
    socket.waitForEvent('framesent', { predicate: (frame) => String(frame.payload).includes('"watch"') }),
  );
  await page.goto(`/medicos/${doctor.slug}/agendar`);
  await live;
  await watching;

  await pickFirstFreeDay(page);
  const slots = page.getByRole('group', { name: 'Hora' }).getByRole('button');
  await expect(slots.first()).toBeVisible();
  await slots.first().click();
  await expect(slots.first()).toHaveAttribute('aria-pressed', 'true');

  // Otro paciente reserva justo ese horario (el primero libre).
  const taken = await api('POST', '/appointments', { professionalId: doctor.id, startsAt: await firstFreeSlot(doctor.id) }, other.token);
  expect(taken.status, JSON.stringify(taken.data)).toBe(201);

  await expect(page.getByRole('status').filter({ hasText: 'El horario que elegiste se acaba de ocupar' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('group', { name: 'Hora' }).getByRole('button', { pressed: true })).toHaveCount(0);
  await page.context().close();
});
