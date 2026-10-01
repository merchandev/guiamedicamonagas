// Páginas públicas: cargan sin errores, no se desbordan en el teléfono, no
// tienen fallas graves de accesibilidad (axe, WCAG 2 A/AA) y respetan lo
// prometido en la portada y en /planes.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, spreadRateLimits, watchConsole } from './support';

const PAGES: { path: string; heading: RegExp }[] = [
  { path: '/', heading: /Encuentra un médico de confianza/ },
  { path: '/planes', heading: /Planes para tu perfil médico/ },
  { path: '/medicos', heading: /Directorio de médicos/ },
  { path: '/especialidades', heading: /Especialidades médicas/ },
  { path: '/legal', heading: /Centro legal/ },
  { path: '/privacidad', heading: /privacidad/i },
  { path: '/reclamos', heading: /reclamos/i },
  { path: '/registro', heading: /Crear cuenta/ },
  { path: '/iniciar-sesion', heading: /Iniciar sesión/ },
];

test.beforeEach(async ({ context }) => {
  await spreadRateLimits(context);
});

for (const { path, heading } of PAGES) {
  test(`${path}: carga sin errores, sin desbordarse y sin fallas graves de accesibilidad`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
    expect(serious, 'fallas de accesibilidad graves o críticas').toEqual([]);
    expect(errors, 'errores en la consola').toEqual([]);
  });
}

test('portada: el HTML del servidor trae las cifras reales (nunca «0+» ni «0 profesionales»)', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).toContain('Municipios de Monagas');
  expect(html).not.toMatch(/>0\+</);
  expect(html).not.toMatch(/>0(<!-- -->)? ?(<!-- -->)?profesional/);
});

test('/planes: Marca Médica con 2 videos profesionales cada mes y su llamado', async ({ page }) => {
  await page.goto('/planes');
  await expect(page.locator('#marca-medica')).toContainText('Marca Médica');
  await expect(page.getByText('2 videos profesionales cada mes').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Quiero impulsar mi marca/ })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Agencia');
  await expect(page.locator('main')).not.toContainText('Profesional Plus');
});

test('centro legal: lista los documentos y cada uno muestra su versión', async ({ page }) => {
  await page.goto('/legal');
  const documents = page.locator('main a[href^="/"]');
  expect(await documents.count()).toBeGreaterThanOrEqual(21);
  await page.goto('/privacidad');
  await expect(page.getByText(/Versión \d+(\.\d+)?/).first()).toBeVisible();
});

test('SEO: URL canónica (sin filtros) y tarjeta para compartir en las páginas principales', async ({ request }) => {
  const pages: [string, string][] = [
    ['/', '/'],
    ['/planes', '/planes'],
    ['/especialidades', '/especialidades'],
    ['/medicos?especialidad=cardiologia', '/medicos'],
  ];
  for (const [path, canonical] of pages) {
    const html = await (await request.get(path)).text();
    const href = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(href, `canónica de ${path}`).toBeTruthy();
    expect(new URL(href!).pathname, `canónica de ${path}`).toBe(canonical);
    expect(html, `og:image de ${path}`).toMatch(/<meta property="og:image" content="[^"]*opengraph-image/);
  }
  const card = await request.get('/opengraph-image');
  expect(card.ok()).toBeTruthy();
  expect(card.headers()['content-type']).toContain('image/png');
});

test('/version.json dice qué versión está publicada y no se guarda en caché', async ({ request }) => {
  const res = await request.get('/version.json');
  expect(res.ok()).toBeTruthy();
  expect(await res.json()).toMatchObject({ service: 'Guia Medica Monagas web', version: expect.any(String) });
  expect(res.headers()['cache-control']).toContain('no-store');
});

test('cabeceras de seguridad y área del paciente fuera de buscadores', async ({ request }) => {
  const home = (await request.get('/')).headers();
  expect(home['x-content-type-options']).toBe('nosniff');
  expect(home['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(home['x-powered-by'], 'no se anuncia el software del servidor').toBeUndefined();
  const csp = home['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  const patientArea = (await request.get('/paciente')).headers();
  expect(patientArea['x-robots-tag']).toContain('noindex');
});
