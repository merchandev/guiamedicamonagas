'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { homePathFor, useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import { ORGANIZATIONS_LAUNCHED } from '@/lib/features';

const NAV_LINKS = [
  { href: '/medicos', label: 'Médicos' },
  { href: '/especialidades', label: 'Especialidades' },
  // Mientras diga «Pronto», la etiqueta corta deja espacio a la pastilla.
  ORGANIZATIONS_LAUNCHED
    ? { href: '/farmacias', label: 'Farmacias y clínicas' }
    : { href: '/farmacias', label: 'Farmacias', soon: true },
  { href: '/planes', label: 'Planes' },
];

function SoonPill() {
  return (
    <span className="ml-1.5 whitespace-nowrap rounded-full bg-gold-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-700">
      Pronto
    </span>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const dashboardHref = user ? homePathFor(user.role) : '/iniciar-sesion';
  // Miembros de un equipo cuya cuenta es de otro tipo (paciente, médico…).
  const showOrgLink = !!user && user.role !== 'ORGANIZATION' && (user.organizationMemberships?.length ?? 0) > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-canvas/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap font-display text-lg font-semibold text-ink-950">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pine-700 text-sm font-bold text-white">
            GM
          </span>
          Guía Médica Monagas
        </Link>

        <nav className="hidden items-center gap-1 xl:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                pathname.startsWith(link.href) && 'bg-pine-50 text-pine-800',
              )}
            >
              {link.label}
              {link.soon && <SoonPill />}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          {user ? (
            <>
              <Link
                href={dashboardHref}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
              >
                Mi panel
              </Link>
              {showOrgLink && (
                <Link href="/organizacion" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Mi organización
                </Link>
              )}
              <Link
                href="/cuenta/seguridad"
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
              >
                Seguridad
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  router.push('/');
                }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-100"
              >
                Salir
              </button>
            </>
          ) : (
            <>
              <Link href="/iniciar-sesion" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                Iniciar sesión
              </Link>
              <Link
                href="/registro"
                className="whitespace-nowrap rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white hover:bg-pine-800"
              >
                Quiero registrarme
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 xl:hidden"
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-ink-100 bg-white px-4 py-3 xl:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
              >
                {link.label}
                {link.soon && <SoonPill />}
              </Link>
            ))}
            <div className="my-2 h-px bg-ink-100" />
            {user ? (
              <>
                <Link href={dashboardHref} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Mi panel
                </Link>
                {showOrgLink && (
                  <Link href="/organizacion" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                    Mi organización
                  </Link>
                )}
                <Link href="/cuenta/seguridad" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Seguridad de la cuenta
                </Link>
                <button
                  onClick={async () => {
                    setOpen(false);
                    await logout();
                    router.push('/');
                  }}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-500 hover:bg-ink-100"
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link href="/iniciar-sesion" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Iniciar sesión
                </Link>
                <Link href="/registro" onClick={() => setOpen(false)} className="rounded-lg bg-pine-700 px-3 py-2 text-sm font-medium text-white">
                  Quiero registrarme
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
