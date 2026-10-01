// Canal de reclamos: cualquier persona envía una solicitud, recibe un número
// de seguimiento y consulta su estado con ese número y su correo.
import { expect, test } from '@playwright/test';
import { spreadRateLimits, uid, watchConsole } from './support';

test('reclamo sin cuenta → número de seguimiento → consulta del estado', async ({ page, context }) => {
  await spreadRateLimits(context);
  const errors = watchConsole(page);
  const email = `reclamo-${uid()}@e2e.local`;

  await page.goto('/reclamos');
  await page.getByRole('combobox', { name: /Tipo de solicitud/ }).click();
  await page.getByRole('option', { name: 'Publicidad o contenido engañoso' }).click();
  await page.getByLabel(/^Nombre y apellido/).fill('Carmen Prueba');
  await page.getByLabel(/^Correo de respuesta/).fill(email);
  await page.getByLabel(/^Describe tu solicitud/).fill('Un perfil promete curas garantizadas, lo que contradice la política de publicidad médica.');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();

  await expect(page.getByRole('heading', { name: 'Recibimos tu solicitud' })).toBeVisible();
  const ticket = (await page.locator('.font-mono').first().textContent())!.trim();
  expect(ticket.length).toBeGreaterThan(5);

  await page.getByRole('link', { name: 'Consultar el estado de esta solicitud' }).click();
  await expect(page).toHaveURL(/\/reclamos\/estado/);
  await expect(page.getByLabel(/^Número de solicitud/)).toHaveValue(ticket);
  await page.getByLabel(/^Correo con el que la enviaste/).fill(email);
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByRole('heading', { name: ticket })).toBeVisible();
  await expect(page.locator('main')).toContainText('Publicidad o contenido engañoso');

  // Con otro correo no se revela nada de la solicitud.
  await page.getByLabel(/^Correo con el que la enviaste/).fill(`otro-${email}`);
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  expect(errors, 'errores en la consola').toEqual([]);
});
