'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/dashboard/agenda', label: 'Calendario' },
  { href: '/dashboard/agenda/horario', label: 'Horario' },
  { href: '/dashboard/agenda/historial', label: 'Historial' },
];

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl">Agenda</h1>
        <nav aria-label="Secciones de la agenda" className="flex gap-1 border-b border-ink-100">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                  active ? 'border-pine-700 text-pine-800' : 'border-transparent text-ink-600 hover:text-ink-900',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
