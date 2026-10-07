// Recorridos del paciente con un médico real: reservar una cita en línea, y
// entregar su código → el médico lo registra → el paciente revoca y el médico
// pierde el acceso. Además, lo que recibe de su ficha la app móvil.
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { api, caracasDay, createPatient, createPublishedDoctor, pickFirstFreeDay, signIn, spreadRateLimits } from './support';

test('reserva una cita en línea y el médico la recibe en su agenda', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL', agenda: true });
  const patient = await createPatient();
  const context = await browser.newContext();
  await spreadRateLimits(context);
  await signIn(context, patient.email);
  const page = await context.newPage();

  await page.goto(`/medicos/${doctor.slug}/agendar`);
  // Calendario de mes: solo los días con horarios libres se pueden tocar.
  await pickFirstFreeDay(page);
  const slots = page.getByRole('group', { name: 'Hora' }).getByRole('button');
  await expect(slots.first()).toBeVisible();
  const slotLabel = plain((await slots.first().textContent()) ?? '');
  await slots.first().click();
  await expect(slots.first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Motivo de consulta (opcional)').fill('Control anual');
  await page.getByRole('button', { name: 'Solicitar cita' }).click();
  await expect(page.getByRole('heading', { name: '¡Solicitud enviada!' })).toBeVisible();

  await page.goto('/paciente/citas');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mis citas');
  await expect(page.locator('main')).toContainText(doctor.lastName);

  const agenda = await api('GET', `/appointments/me/agenda?from=${caracasDay()}&to=${caracasDay(60)}`, undefined, doctor.token);
  expect(agenda.status).toBe(200);
  expect(JSON.stringify(agenda.data)).toContain('Control anual');

  // El aviso al médico dice la misma hora que eligió el paciente (hora de
  // Caracas), aunque el servidor corra en UTC como en producción y en CI.
  const notices = await api('GET', '/notifications', undefined, doctor.token);
  const request = (notices.data as { items: { type: string; content: string }[] }).items.find((n) => n.type === 'APPOINTMENT_REQUESTED');
  expect(request, 'el médico recibe el aviso de la solicitud').toBeTruthy();
  expect(plain(request!.content)).toContain(slotLabel);
  await context.close();
});

/**
 * «10:00 a. m.» lleva espacios especiales y el navegador y Node pueden
 * escribirlo con matices distintos: se compara sin espacios ni puntos.
 */
function plain(text: string) {
  return text.replace(/[\s.]/g, '').toLowerCase();
}

test('código del paciente: el médico lo registra, el paciente revoca y el médico pierde el acceso', async ({ browser }) => {
  const doctor = await createPublishedDoctor({ tier: 'PROFESSIONAL' });
  const patient = await createPatient();

  // El paciente genera su código en el panel.
  const patientContext = await browser.newContext();
  await spreadRateLimits(patientContext);
  await signIn(patientContext, patient.email);
  const patientPage = await patientContext.newPage();
  await patientPage.goto('/paciente/codigo');
  await patientPage.getByRole('button', { name: 'Generar mi código' }).click();
  const codeText = patientPage.getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(codeText).toBeVisible();
  const code = (await codeText.textContent())!.trim();
  await expect(patientPage.getByRole('img', { name: /QR/i }).or(patientPage.locator('img[src^="data:image/svg+xml"]')).first()).toBeVisible();

  // El médico lo registra desde su panel.
  const doctorContext = await browser.newContext();
  await spreadRateLimits(doctorContext);
  await signIn(doctorContext, doctor.email);
  const doctorPage = await doctorContext.newPage();
  await doctorPage.goto('/dashboard/pacientes');
  await doctorPage.getByLabel('Código del paciente').fill(code);
  await doctorPage.getByRole('button', { name: 'Registrar paciente' }).click();
  await expect(doctorPage.locator('main')).toContainText(patient.lastName);

  const patients = await api('GET', '/appointments/me/patients', undefined, doctor.token);
  const registered = (patients.data as { patientId: string; registered: boolean }[]).find((p) => p.registered);
  expect(registered, 'el paciente aparece en el directorio del médico').toBeTruthy();
  expect((await api('POST', `/appointments/me/patients/${registered!.patientId}/data`, undefined, doctor.token)).status).toBe(201);

  // El paciente ve la autorización y la revoca.
  await patientPage.goto('/paciente/permisos');
  await expect(patientPage.locator('main')).toContainText(doctor.lastName);
  await patientPage.getByRole('button', { name: 'Revocar' }).first().click();
  await expect(patientPage.getByText('Autorización revocada')).toBeVisible();

  // Sin autorización vigente el médico ya no lee sus datos, ni con el mismo código.
  expect((await api('POST', `/appointments/me/patients/${registered!.patientId}/data`, undefined, doctor.token)).status).toBe(403);
  expect((await api('POST', '/appointments/me/patients/register', { code }, doctor.token)).status).toBe(403);
  await patientContext.close();
  await doctorContext.close();
});

test('la app móvil recibe solo los datos básicos de la ficha, sin datos de salud ni de identidad', async () => {
  const patient = await createPatient();
  const full = await api('PATCH', '/patients/me', { allergies: 'Penicilina', medications: [{ name: 'Losartán', schedule: '8 a. m.' }] }, patient.token);
  expect(full.status, JSON.stringify(full.data)).toBe(200);
  const keys = ['firstName', 'lastName', 'municipality', 'patientCode', 'phone'];

  const basic = await api('GET', '/patients/me/basic', undefined, patient.token);
  expect(basic.status).toBe(200);
  expect(Object.keys(basic.data).sort()).toEqual(keys);
  expect(basic.data).toMatchObject({ firstName: patient.firstName, lastName: patient.lastName, phone: null, municipality: null });

  const phone = `0414-${String(randomBytes(4).readUInt32BE(0) % 10_000_000).padStart(7, '0')}`;
  const saved = await api('PATCH', '/patients/me/basic', { phone, municipality: 'Maturín' }, patient.token);
  expect(saved.status, JSON.stringify(saved.data)).toBe(200);
  expect(Object.keys(saved.data).sort()).toEqual(keys);
  expect(saved.data).toMatchObject({ phone, municipality: 'Maturín' });

  // Por esta ruta no se tocan los datos de salud, y la ficha completa de la web sigue igual.
  expect((await api('PATCH', '/patients/me/basic', { allergies: 'Ninguna' }, patient.token)).status).toBe(400);
  expect((await api('GET', '/patients/me', undefined, patient.token)).data).toMatchObject({ allergies: 'Penicilina', phone, municipality: 'Maturín' });
});
