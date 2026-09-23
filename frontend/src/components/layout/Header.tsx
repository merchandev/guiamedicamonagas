'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { homePathFor, useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';

const NAV_LINKS = [
  { href: '/medicos', label: 'Médicos' },
  { href: '/especialidades', label: 'Especialidades' },
  { href: '/farmacias', label: 'Farmacias y clínicas' },
  { href: '/planes', label: 'Planes' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const dashboardHref = user ? homePathFor(user.role) : '/iniciar-sesion';

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-canvas/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-ink-950">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pine-700 text-sm font-bold text-white">
            GM
          </span>
          Guía Médica Monagas
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                pathname.startsWith(link.href) && 'bg-pine-50 text-pine-800',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Link
                href={dashboardHref}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
              >
                Mi panel
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
              <Link href="/iniciar-sesion" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                Iniciar sesión
              </Link>
              <Link
                href="/registro"
                className="rounded-lg bg-pine-700 px-4 py-2 text-sm font-medium text-white hover:bg-pine-800"
              >
                Soy médico
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 md:hidden"
          aria-label="Abrir menú"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-ink-100 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
              >
                {link.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-ink-100" />
            {user ? (
              <>
                <Link href={dashboardHref} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100">
                  Mi panel
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
                  Soy médico
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
