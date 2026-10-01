// Administración desde el panel: inicio de sesión (con código por correo si
// el MFA está activo), aprobar el último documento de un médico (queda
// publicado) y suspender y eliminar definitivamente una cuenta (el correo
// queda libre para registrarse de nuevo).
import { expect, test } from '@playwright/test';
import { PASSWORD, api, letters, rememberCookieChoice, signInAsAdmin, spreadRateLimits, sql, uid } from './support';

test.skip(!process.env.SEED_SUPERADMIN_PASSWORD, 'necesita SEED_SUPERADMIN_PASSWORD');

test.beforeEach(async ({ context }) => {
  await spreadRateLimits(context);
  await rememberCookieChoice(context);
});

test('aprobar el último documento publica al médico con el sello de verificado', async ({ page }) => {
  // Médico con 5 de 6 documentos aprobados; el sexto (Artículo 8) queda pendiente.
  const email = `medico-cola-${uid()}@e2e.local`;
  const lastName = letters(8);
  const registered = await api('POST', '/auth/register', {
    email,
    password: PASSWORD,
    role: 'PROFESSIONAL',
    firstName: 'Elena',
    lastName,
    acceptLegal: true,
    acceptProfessionalTerms: true,
  });
  expect(registered.status).toBe(201);
  const [profile] = await sql<{ id: string; slug: string }>(
    `select p.id, p.slug from "ProfessionalProfile" p join "User" u on u.id = p."userId" where u.email = $1`,
    [email],
  );
  const types = ['CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO', 'REGISTRO_MPPS_SACS', 'MATRICULA_COLEGIO_MONAGAS', 'ARTICULO_8'];
  for (const [index, type] of types.entries()) {
    await sql(
      `insert into "ProfessionalDocument"(id,"professionalId",type,"fileKey","originalFileName","mimeType","fileSizeBytes",status,"updatedAt")
       values ($1,$2,$3,'documents/e2e.pdf','documento.pdf','application/pdf',1000,$4,now())`,
      [`e2e-${profile.id}-${type}`, profile.id, type, index < 5 ? 'APPROVED' : 'PENDING'],
    );
  }
  await sql(`update "ProfessionalProfile" set "photoUrl" = 'professionals/e2e.png' where id = $1`, [profile.id]);
  await api(
    'PATCH',
    '/professionals/me',
    { firstName: 'Elena', lastName, bio: 'Médica internista con experiencia en consulta externa y control de enfermedades crónicas en Maturín.' },
    registered.data.accessToken,
  );
  expect((await api('GET', `/professionals/${profile.slug}`)).data?.verificationStatus).not.toBe('VERIFIED');

  await signInAsAdmin(page);
  await page.goto('/admin/verificaciones');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cola de verificación');
  const row = page.locator('.card').filter({ hasText: lastName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Revisar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisar documento' });
  await dialog.getByRole('button', { name: 'Aprobar' }).click();
  await expect(dialog).toBeHidden();

  const publicProfile = await api('GET', `/professionals/${profile.slug}`);
  expect(publicProfile.status).toBe(200);
  expect(publicProfile.data.verificationStatus).toBe('VERIFIED');
});

test('suspender y eliminar definitivamente una cuenta libera el correo', async ({ page }) => {
  const email = `medico-baja-${uid()}@e2e.local`;
  const lastName = letters(8);
  expect(
    (
      await api('POST', '/auth/register', {
        email,
        password: PASSWORD,
        role: 'PROFESSIONAL',
        firstName: 'Tomás',
        lastName,
        acceptLegal: true,
        acceptProfessionalTerms: true,
      })
    ).status,
  ).toBe(201);

  await signInAsAdmin(page);
  await page.goto('/admin/cuentas-medicos');
  await page.getByLabel('Nombre o correo').fill(email);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const row = page.locator('.card > div').filter({ hasText: email });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Suspender' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Motivo/).fill('Prueba automática: cuenta de prueba');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByRole('button', { name: 'Reactivar' })).toBeVisible();
  // Suspendida: ya no puede iniciar sesión (403: la cuenta existe pero está bloqueada).
  expect([401, 403]).toContain((await api('POST', '/auth/login', { email, password: PASSWORD })).status);

  await row.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Motivo/).fill('Prueba automática: eliminar la cuenta de prueba');
  await dialog.getByLabel(/Escribe ELIMINAR/).fill('ELIMINAR');
  await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('eliminada definitivamente')).toBeVisible();

  // El mismo correo vuelve a registrarse como una cuenta nueva.
  const again = await api('POST', '/auth/register', {
    email,
    password: PASSWORD,
    role: 'PROFESSIONAL',
    firstName: 'Tomás',
    lastName,
    acceptLegal: true,
    acceptProfessionalTerms: true,
  });
  expect(again.status).toBe(201);
});
