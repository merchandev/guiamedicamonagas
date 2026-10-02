'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export function DashboardShell({
  title,
  links,
  children,
}: {
  title: string;
  links: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    // grid-cols-1 + min-w-0: en el teléfono el menú se desplaza dentro de su
    // fila en lugar de ensanchar toda la página.
    <div className="container-page grid grid-cols-1 gap-8 py-10 md:grid-cols-[220px_1fr]">
      <aside className="min-w-0">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink-950">{title}</h2>
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {links.map((link) => {
            // Las secciones con subpáginas (/dashboard/agenda/historial) siguen marcadas;
            // la portada del panel (/dashboard) solo en su propia página.
            const nested = link.href.split('/').length > 2 && pathname.startsWith(`${link.href}/`);
            const active = pathname === link.href || nested;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100',
                  active && 'bg-pine-50 text-pine-800',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
