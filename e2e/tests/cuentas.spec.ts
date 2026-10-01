// Cuentas: registro desde los formularios (paciente y médico), salir y volver
// a entrar, contraseña equivocada y, con Mailpit, verificación del correo y
// recuperación de la contraseña.
import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { MAILPIT, PASSWORD, api, latestMail, letters, spreadRateLimits, uid, watchConsole } from './support';

const randomCedula = () => `V-${10_000_000 + (randomBytes(4).readUInt32BE(0) % 89_999_999)}`;

async function acceptAllLegal(page: Page) {
  const boxes = page.getByRole('group', { name: /marca cada casilla/i }).getByRole('checkbox');
  const count = await boxes.count();
  expect(count, 'casillas de aceptación de los textos legales').toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await boxes.nth(i).check();
}

/** «Salir» está en la cabecera o, en el teléfono, dentro del menú. */
async function logout(page: Page) {
  const exit = page.getByRole('button', { name: 'Salir' });
  if (!(await exit.first().isVisible())) await page.getByRole('button', { name: 'Abrir menú' }).click();
  await exit.filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
}

async function loginWithForm(page: Page, email: string, password: string) {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeEach(async ({ context }) => {
  await spreadRateLimits(context);
});

test('paciente: se registra desde el formulario, sale y vuelve a entrar', async ({ page }) => {
  const errors = watchConsole(page);
  const email = `paciente-ui-${uid()}@e2e.local`;
  await page.goto('/registro?tipo=paciente');
  await page.getByLabel('Nombres').fill('Ana');
  await page.getByLabel('Apellidos').fill(letters());
  await page.getByLabel('Cédula de identidad').fill(randomCedula());
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
  await page.getByLabel('Confirmar contraseña').fill(PASSWORD);
  await acceptAllLegal(page);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page).toHaveURL(/\/paciente/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mi perfil de paciente');

  await logout(page);
  await loginWithForm(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/paciente/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mi perfil de paciente');
  expect(errors, 'errores en la consola').toEqual([]);
});

test('médico: se registra desde el formulario y llega a sus documentos de verificación', async ({ page }) => {
  await page.goto('/registro?tipo=medico');
  await page.getByLabel('Nombres').fill('Diana');
  await page.getByLabel('Apellidos').fill(letters());
  await page.getByLabel('Correo electrónico').fill(`medico-ui-${uid()}@e2e.local`);
  await page.getByLabel(/^Contraseña/).fill(PASSWORD);
  await page.getByLabel('Confirmar contraseña').fill(PASSWORD);
  await acceptAllLegal(page);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page).toHaveURL(/\/dashboard\/documentos/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Documentos de verificación');
  // Los seis requisitos, en orden de obtención (sin solvencia deontológica).
  await expect(page.locator('main')).toContainText('Cédula');
  await expect(page.locator('main')).toContainText('Artículo 8');
  await expect(page.locator('main')).not.toContainText('Solvencia');
});

test('una contraseña equivocada muestra el error y no abre la sesión', async ({ page }) => {
  const email = `paciente-${uid()}@e2e.local`;
  await api('POST', '/auth/register', {
    email,
    password: PASSWORD,
    role: 'USER',
    firstName: 'Luis',
    lastName: letters(),
    cedula: randomCedula(),
    acceptLegal: true,
    acceptHealthConsent: true,
    declareAdult: true,
  });
  await loginWithForm(page, email, `${PASSWORD}-no`);
  // En «main»: Next.js tiene además un anunciador de rutas con rol «alert», vacío.
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/iniciar-sesion/);
});

test.describe('con correo (Mailpit)', () => {
  test.skip(!MAILPIT, 'necesita E2E_MAILPIT_URL');

  test('verificación del correo con el enlace recibido', async ({ page }) => {
    const email = `verifica-${uid()}@e2e.local`;
    const since = new Date();
    const r = await api('POST', '/auth/register', {
      email,
      password: PASSWORD,
      role: 'USER',
      firstName: 'Marta',
      lastName: letters(),
      cedula: randomCedula(),
      acceptLegal: true,
      acceptHealthConsent: true,
      declareAdult: true,
    });
    expect(r.status).toBe(201);
    const mail = await latestMail(email, since);
    const link = mail.html.match(/href="([^"]*verificar-correo[^"]*)"/)?.[1];
    expect(link, 'enlace de verificación en el correo').toBeTruthy();
    await page.goto(new URL(link!.replace(/&amp;/g, '&')).pathname + new URL(link!.replace(/&amp;/g, '&')).search);
    await expect(page.locator('main')).toContainText(/Correo verificado/i);
  });

  test('recuperación de la contraseña: correo, enlace y nueva contraseña', async ({ page }) => {
    const email = `recupera-${uid()}@e2e.local`;
    await api('POST', '/auth/register', {
      email,
      password: PASSWORD,
      role: 'USER',
      firstName: 'Rosa',
      lastName: letters(),
      cedula: randomCedula(),
      acceptLegal: true,
      acceptHealthConsent: true,
      declareAdult: true,
    });
    const since = new Date();
    await page.goto('/olvide-contrasena');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByRole('button').filter({ hasText: /enlace|enviar|recuperar/i }).first().click();
    const mail = await latestMail(email, since);
    const link = mail.html.match(/href="([^"]*restablecer-contrasena[^"]*)"/)?.[1]?.replace(/&amp;/g, '&');
    expect(link, 'enlace para restablecer en el correo').toBeTruthy();
    const url = new URL(link!);
    await page.goto(url.pathname + url.search);
    const newPassword = `${PASSWORD}-nueva`;
    await page.getByLabel('Nueva contraseña').fill(newPassword);
    await page.getByLabel('Confirmar contraseña').fill(newPassword);
    await page.getByRole('button').filter({ hasText: /restablecer|guardar|cambiar/i }).first().click();
    const main = page.locator('main');
    await expect(main.getByRole('alert').or(main.getByRole('status')).first()).toBeVisible();

    await loginWithForm(page, email, newPassword);
    await expect(page).toHaveURL(/\/paciente/);
  });
});
