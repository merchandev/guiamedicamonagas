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
    <div className="container-page grid gap-8 py-10 md:grid-cols-[220px_1fr]">
      <aside>
        <h2 className="mb-4 font-display text-lg font-semibold text-ink-950">{title}</h2>
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100',
                pathname === link.href && 'bg-pine-50 text-pine-800',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
