// Política de acceso de TODAS las rutas de la API, leída de los decoradores
// (sin levantar la aplicación):
// - Las rutas públicas (@Public) son exactamente las de la lista de abajo: una
//   ruta pública nueva exige agregarla aquí a conciencia.
// - Toda ruta de administración (un segmento «admin») exige un permiso
//   concreto (@RequirePermissions), no solo un rol.
// - Ninguna ruta es pública y a la vez exige rol o permiso.
// El guard global de JWT protege todo lo que no es @Public; RolesGuard aplica
// @Roles y @RequirePermissions (common/guards).
import 'reflect-metadata';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../src/common/permissions';

interface Route {
  route: string;
  isPublic: boolean;
  roles: string[];
  permissions: string[];
  file: string;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

const joinPath = (...parts: (string | undefined)[]) =>
  '/' + parts.flatMap((p) => (p ?? '').split('/')).filter(Boolean).join('/');

async function collectRoutes(): Promise<Route[]> {
  const src = join(__dirname, '../../src');
  const routes: Route[] = [];
  for (const file of controllerFiles(src)) {
    const mod = (await import(file)) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const base = Reflect.getMetadata(PATH_METADATA, exported) as string | undefined;
      if (base === undefined) continue;
      const proto = (exported as { prototype: Record<string, unknown> }).prototype;
      for (const key of Object.getOwnPropertyNames(proto)) {
        const handler = proto[key];
        if (key === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const meta = <T>(k: string) =>
          (Reflect.getMetadata(k, handler) as T | undefined) ?? (Reflect.getMetadata(k, exported) as T | undefined);
        for (const p of Array.isArray(path) ? path : [path]) {
          routes.push({
            route: `${RequestMethod[method]} ${joinPath(base, p)}`,
            isPublic: meta<boolean>(IS_PUBLIC_KEY) === true,
            roles: meta<string[]>(ROLES_KEY) ?? [],
            permissions: meta<string[]>(PERMISSIONS_KEY) ?? [],
            file: relative(src, file).split('\\').join('/'),
          });
        }
      }
    }
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Todo lo que responde sin sesión. Revisado el 2026-10-01 (ACT-0039): lectura
 * del directorio y catálogos, autenticación, canales públicos (reclamos,
 * contacto, consentimiento de cookies, analítica con consentimiento) y salud.
 * /health/ready es pública para la API pero Caddy la bloquea desde Internet.
 */
const PUBLIC_ROUTES = [
  'GET /appointments/availability',
  'GET /auth/verify-email',
  'GET /cookie-consent/config',
  'GET /geo/municipalities',
  'GET /geo/municipalities/:id/parishes',
  'GET /geo/states',
  'GET /health',
  'GET /health/ready',
  'GET /organizations',
  'GET /organizations/:slug',
  'GET /organizations/invitations/preview',
  'GET /payments/banks',
  'GET /professionals',
  'GET /professionals/:slug',
  'GET /professionals/:slug/share-photo',
  'GET /professionals/by-code/:code',
  'GET /professionals/landing-pages',
  'GET /professionals/sitemap',
  'GET /seo/global',
  'GET /seo/pages/meta',
  'GET /specialties',
  'GET /specialties/:slug',
  'GET /subscriptions/exchange-rate',
  'GET /subscriptions/plans',
  'GET /subscriptions/showcase',
  'POST /analytics/track',
  'POST /auth/forgot-password',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/mfa/verify',
  'POST /auth/refresh',
  'POST /auth/register',
  'POST /auth/reset-password',
  'POST /contact',
  'POST /cookie-consent',
  'POST /legal-requests',
  'POST /legal-requests/lookup',
];

describe('política de acceso de las rutas', async () => {
  const routes = await collectRoutes();

  it('lee todas las rutas de los controladores', () => {
    expect(routes.length).toBeGreaterThan(150);
    expect(new Set(routes.map((r) => r.route)).size).toBe(routes.length);
  });

  it('solo las rutas de la lista responden sin sesión', () => {
    expect(routes.filter((r) => r.isPublic).map((r) => r.route)).toEqual([...PUBLIC_ROUTES].sort((a, b) => a.localeCompare(b)));
  });

  it('una ruta pública no exige rol ni permiso (sería una contradicción)', () => {
    expect(routes.filter((r) => r.isPublic && (r.roles.length || r.permissions.length)).map((r) => r.route)).toEqual([]);
  });

  it('toda ruta de administración exige un permiso concreto, no solo un rol', () => {
    const admin = routes.filter((r) => r.route.split(' ')[1].split('/').includes('admin'));
    expect(admin.length).toBeGreaterThan(40);
    expect(admin.filter((r) => r.permissions.length === 0).map((r) => `${r.route} (${r.file})`)).toEqual([]);
  });

  it('los roles de administración se controlan con permisos, nunca con @Roles(ADMIN)', () => {
    expect(
      routes.filter((r) => r.roles.some((role) => role === 'ADMIN' || role === 'SUPERADMIN')).map((r) => r.route),
    ).toEqual([]);
  });

  it('las rutas «me» del médico exigen el rol de médico', () => {
    const doctorOnly = ['/agenda/me', '/professionals/me', '/documents/me', '/posts/me', '/analytics/me', '/appointments/me/patients', '/appointments/me/agenda'];
    const loose = routes.filter(
      (r) => doctorOnly.some((prefix) => r.route.split(' ')[1].startsWith(prefix)) && !r.roles.includes('PROFESSIONAL'),
    );
    expect(loose.map((r) => r.route)).toEqual([]);
  });
});
