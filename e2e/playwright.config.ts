import { defineConfig, devices } from '@playwright/test';

// Pruebas de extremo a extremo del sitio: una API y una web reales, con su
// PostgreSQL (ver e2e/README.md). En CI corren en el job «Frontend · extremo a
// extremo»; en local, con E2E_CHANNEL=msedge (o chrome) usan el navegador
// instalado y no hace falta descargar ninguno.
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const channel = process.env.E2E_CHANNEL || undefined;
const allBrowsers = process.env.E2E_TODOS_LOS_NAVEGADORES === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Comparten la base de datos y los límites de la API: una prueba a la vez.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB,
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], channel } },
    // Teléfono Android de 412 px: lo público y las cuentas, donde más se usa el sitio.
    { name: 'movil', use: { ...devices['Pixel 7'], channel }, testMatch: /(publico|cuentas)\.spec\.ts/ },
    // Firefox y Safari (WebKit) solo para lo público, a pedido (E2E_TODOS_LOS_NAVEGADORES=1).
    ...(allBrowsers
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /publico\.spec\.ts/ },
          { name: 'safari-movil', use: { ...devices['iPhone 14'] }, testMatch: /publico\.spec\.ts/ },
        ]
      : []),
  ],
});
