import Link from 'next/link';
import type { Metadata } from 'next';
import { serverGet } from '@/lib/server-fetch';
import { Specialty } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Especialidades médicas',
  description: 'Explora médicos por especialidad en el estado Monagas: pediatría, cardiología, ginecología y más.',
};

export default async function EspecialidadesPage() {
  const specialties = (await serverGet<Specialty[]>('/specialties')) ?? [];

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl">Especialidades médicas</h1>
      <p className="mt-2 text-ink-600">Explora el directorio por rama de la medicina.</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {specialties.map((s) => (
          <Link
            key={s.id}
            href={`/medicos?especialidad=${s.slug}`}
            className="card px-4 py-6 text-center transition-transform hover:-translate-y-0.5 hover:shadow-card"
          >
            <span className="font-medium text-ink-800">{s.name}</span>
            {typeof s._count?.professionals === 'number' && (
              <span className="mt-1 block text-xs text-ink-400">
                {s._count.professionals} profesional{s._count.professionals === 1 ? '' : 'es'}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
