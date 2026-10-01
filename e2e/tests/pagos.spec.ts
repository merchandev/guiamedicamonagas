// Pago de un plan: la administración registra el Pago Móvil de la plataforma,
// el médico elige un plan y ve esos datos dentro de su panel, reporta el pago
// con su comprobante y la administración lo aprueba: el plan queda activo.
import { expect, test } from '@playwright/test';
import {
  HAS_STORAGE,
  TINY_PNG,
  adminToken,
  api,
  createPublishedDoctor,
  rememberCookieChoice,
  signIn,
  signInAsAdmin,
  spreadRateLimits,
  sql,
} from './support';


test.skip(!process.env.SEED_SUPERADMIN_PASSWORD, 'necesita SEED_SUPERADMIN_PASSWORD');

test('el médico ve el Pago Móvil de la plataforma, reporta su pago y la administración lo aprueba', async ({ browser }) => {
  const admin = await adminToken();
  const banks = ((await api('GET', '/payments/banks')).data as { code: string; supportsPagoMovil: boolean }[]).filter(
    (b) => b.supportsPagoMovil,
  );
  const bank = banks[0];
  const account = {
    holderName: 'Guía Médica Monagas Pruebas',
    documentId: 'J-12345678-9',
    bankCode: bank.code,
    accountNumber: `${bank.code}${'0'.repeat(15)}7`,
    phone: '04141234567',
  };
  const saved = await api('PUT', '/payments/admin/pago-movil-account', account, admin);
  expect(saved.status, JSON.stringify(saved.data)).toBe(200);

  const doctor = await createPublishedDoctor();
  const context = await browser.newContext();
  await spreadRateLimits(context);
  await rememberCookieChoice(context);
  await signIn(context, doctor.email);
  const page = await context.newPage();

  await test.step('elige el plan Profesional y ve los datos de pago dentro del panel', async () => {
    await page.goto('/dashboard/pagos');
    const plan = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Profesional', exact: true }) });
    await plan.getByRole('button', { name: 'Elegir este plan' }).click();
    await expect(page.getByText('Reportar Pago Móvil').first()).toBeVisible();
    await expect(page.locator('main')).toContainText(account.holderName);
    await expect(page.locator('main')).toContainText(account.accountNumber);
  });

  test.skip(!HAS_STORAGE, 'reportar el pago sube el comprobante: necesita almacenamiento S3 (E2E_STORAGE=1)');

  const reference = String(Date.now()).slice(-8);
  await test.step('reporta el pago con su comprobante', async () => {
    await page.getByRole('combobox', { name: /Banco emisor/ }).click();
    await page.getByRole('option', { name: new RegExp(`^${bank.code}`) }).click();
    await page.getByLabel(/^Teléfono emisor/).fill('0414-7654321');
    await page.getByLabel(/^N° de referencia/).fill(reference);
    await page.getByLabel(/^Fecha del pago/).fill(new Date().toISOString().slice(0, 10));
    await page.locator('#pago-comprobante').setInputFiles({ name: 'comprobante.png', mimeType: 'image/png', buffer: TINY_PNG });
    await page.getByRole('button', { name: 'Reportar pago' }).click();
    await expect
      .poll(async () => (await sql(`select status from "Payment" where "referenceNumber" = $1`, [reference]))[0]?.status)
      .toBe('PENDING');
  });

  await test.step('la administración lo aprueba desde Pagos', async () => {
    const adminContext = await browser.newContext();
    await spreadRateLimits(adminContext);
    await rememberCookieChoice(adminContext);
    const adminPage = await adminContext.newPage();
    await signInAsAdmin(adminPage);
    await adminPage.goto('/admin/pagos');
    const row = adminPage.getByRole('row').filter({ hasText: reference });
    await row.getByRole('button', { name: 'Revisar' }).click();
    const dialog = adminPage.getByRole('dialog', { name: 'Revisar pago' });
    await dialog.getByRole('button', { name: 'Aprobar' }).click();
    await expect(dialog).toBeHidden();
    await adminContext.close();
  });

  const subscription = await api('GET', '/subscriptions/me', undefined, doctor.token);
  expect(subscription.data?.status).toBe('ACTIVE');
  expect(subscription.data?.plan?.tier).toBe('PROFESSIONAL');
  await context.close();
});
