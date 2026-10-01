// Directorio: un médico publicado aparece y se encuentra por nombre, código y
// especialidad; su ficha muestra lo profesional y nada privado.
import { expect, test } from '@playwright/test';
import { api, createPublishedDoctor, spreadRateLimits, type Doctor } from './support';

let doctor: Doctor;

test.beforeAll(async () => {
  doctor = await createPublishedDoctor({ specialtySlug: 'cardiologia' });
});

test.beforeEach(async ({ context }) => {
  await spreadRateLimits(context);
});

test('se encuentra por apellido, por código GM y por especialidad', async ({ page }) => {
  const card = page.getByRole('link', { name: new RegExp(doctor.lastName) }).first();

  await page.goto('/medicos');
  await page.getByLabel('Buscar médico').fill(doctor.lastName);
  await page.getByLabel('Buscar médico').press('Enter');
  await expect(card).toBeVisible();

  await page.goto(`/medicos?q=${encodeURIComponent(doctor.publicCode)}`);
  await expect(card).toBeVisible();

  await page.goto(`/medicos?especialidad=cardiologia&q=${encodeURIComponent(doctor.lastName)}`);
  await expect(card).toBeVisible();

  // Con otra especialidad no aparece, y el aviso ofrece volver al directorio completo.
  await page.goto(`/medicos?especialidad=dermatologia&q=${encodeURIComponent(doctor.lastName)}`);
  await expect(page.getByText('No encontramos médicos con esos filtros')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver todo el directorio' })).toBeVisible();
});

test('la ficha pública muestra datos profesionales y ningún dato privado', async ({ page, request }) => {
  // Con todos sus documentos aprobados lleva el sello de verificado.
  expect((await api('GET', `/professionals/${doctor.slug}`)).data?.verificationStatus).toBe('VERIFIED');
  await page.goto(`/medicos/${doctor.slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(doctor.lastName);
  await expect(page.locator('main')).toContainText('Cardiología');
  const html = await (await request.get(`/medicos/${doctor.slug}`)).text();
  expect(html).toContain('application/ld+json');
  // Nada de la verificación interna (archivos, correos) llega a la página.
  expect(html).not.toContain('documents/e2e.pdf');
  expect(html).not.toContain(doctor.email);
});

test('una ficha que no existe responde 404', async ({ request }) => {
  expect((await request.get('/medicos/no-existe-este-medico-e2e')).status()).toBe(404);
});

test('la página de la especialidad lo lista una vez publicado', async ({ page }) => {
  // La página se regenera cada minuto (ISR): se reintenta hasta que aparezca.
  await expect(async () => {
    await page.goto('/especialidades/cardiologia');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cardiología');
    await expect(page.getByRole('link', { name: new RegExp(doctor.lastName) }).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 80_000, intervals: [2_000, 5_000, 10_000] });
});
