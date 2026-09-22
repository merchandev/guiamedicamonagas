'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PageSpinner } from '@/components/ui/Spinner';

interface AdminStats {
  pendingDocuments: number;
  pendingPayments: number;
  totalProfessionals: number;
  verifiedProfessionals: number;
  inReviewProfessionals: number;
  totalOrganizations: number;
  unreadMessages: number;
  recentAuditLogs: { id: string; action: string; resource: string; createdAt: string; user?: { email: string } | null }[];
}

export default function AdminHome() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    api.get<AdminStats>('/admin/stats').then(setStats).catch(() => undefined);
  }, []);

  if (!stats) return <PageSpinner />;

  const cards = [
    { label: 'Documentos pendientes', value: stats.pendingDocuments, href: '/admin/verificaciones', tone: 'text-gold-700' },
    { label: 'Pagos pendientes', value: stats.pendingPayments, href: '/admin/pagos', tone: 'text-gold-700' },
    { label: 'Médicos verificados', value: stats.verifiedProfessionals, href: '/admin/medicos', tone: 'text-pine-700' },
    { label: 'Médicos en revisión', value: stats.inReviewProfessionals, href: '/admin/verificaciones', tone: 'text-ink-700' },
    { label: 'Total de médicos', value: stats.totalProfessionals, href: '/admin/medicos', tone: 'text-ink-700' },
    { label: 'Organizaciones', value: stats.totalOrganizations, href: '/admin/organizaciones', tone: 'text-ink-700' },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl">Resumen</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-5 hover:shadow-card">
            <p className="text-sm text-ink-500">{c.label}</p>
            <p className={`mt-1 text-3xl font-bold ${c.tone}`}>{c.value}</p>
          </Link>
        ))}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink-900">Actividad reciente</h2>
        <div className="space-y-2">
          {stats.recentAuditLogs.map((log) => (
            <div key={log.id} className="flex items-center justify-between border-b border-ink-50 py-2 text-sm last:border-0">
              <span className="text-ink-700">
                {log.action} — {log.resource}
              </span>
              <span className="text-xs text-ink-400">
                {log.user?.email ?? 'sistema'} · {new Date(log.createdAt).toLocaleString('es-VE')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
