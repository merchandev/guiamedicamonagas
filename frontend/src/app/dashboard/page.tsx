'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import { VERIFICATION_LABELS } from '@/lib/labels';

interface OwnProfile {
  slug: string;
  verificationStatus: string;
  isPublished: boolean;
  documents: { status: string }[];
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<OwnProfile | null>(null);

  useEffect(() => {
    api.get<OwnProfile>('/professionals/me').then(setProfile).catch(() => undefined);
  }, []);

  if (!profile) return <PageSpinner />;

  const status = VERIFICATION_LABELS[profile.verificationStatus] ?? VERIFICATION_LABELS.PENDING;
  const pendingDocs = profile.documents.filter((d) => d.status === 'PENDING').length;
  const rejectedDocs = profile.documents.filter((d) => d.status === 'REJECTED').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Hola, {user?.professionalProfile?.firstName ?? 'Doctor(a)'}</h1>
        <p className="mt-1 text-ink-600">Este es el estado de tu perfil en Guía Médica Monagas.</p>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-ink-500">Estado de verificación</p>
            <Badge tone={status.tone} className="mt-1 text-sm">
              {status.label}
            </Badge>
          </div>
          {profile.isPublished && (
            <Link href={`/medicos/${profile.slug}`} className="text-sm font-medium text-pine-700 hover:underline">
              Ver mi perfil público →
            </Link>
          )}
        </div>

        {profile.verificationStatus !== 'VERIFIED' && (
          <div className="mt-4 rounded-lg bg-gold-50 p-4 text-sm text-gold-900">
            {rejectedDocs > 0
              ? `Tienes ${rejectedDocs} documento(s) rechazado(s). Revísalos y vuelve a subirlos.`
              : pendingDocs > 0
                ? `Tienes ${pendingDocs} documento(s) en revisión. Te avisaremos por correo y WhatsApp.`
                : 'Sube tus documentos legales y gremiales para activar tu perfil público.'}
            <Link href="/dashboard/documentos" className="ml-2 font-semibold underline">
              Ir a documentos
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/perfil" className="card p-5 hover:shadow-card">
          <h3 className="font-semibold text-ink-900">Mi perfil</h3>
          <p className="mt-1 text-sm text-ink-500">Datos personales, contacto y especialidades.</p>
        </Link>
        <Link href="/dashboard/pagos" className="card p-5 hover:shadow-card">
          <h3 className="font-semibold text-ink-900">Suscripción</h3>
          <p className="mt-1 text-sm text-ink-500">Reporta tu pago móvil y revisa tu estado.</p>
        </Link>
        <Link href="/dashboard/mensajes" className="card p-5 hover:shadow-card">
          <h3 className="font-semibold text-ink-900">Mensajes</h3>
          <p className="mt-1 text-sm text-ink-500">Mensajes recibidos desde tu perfil público.</p>
        </Link>
      </div>
    </div>
  );
}
