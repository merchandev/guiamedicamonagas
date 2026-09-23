'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { PaginatedResult, ProfessionalListItem, Specialty } from '@/lib/types';
import { municipalityOptions, useMunicipalities } from '@/lib/catalogs';
import { DoctorCard } from '@/components/DoctorCard';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';

export default function MedicosPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <MedicosPageContent />
    </Suspense>
  );
}

function MedicosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [result, setResult] = useState<(PaginatedResult<ProfessionalListItem> & { featured?: ProfessionalListItem[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const municipalities = useMunicipalities();

  const especialidad = searchParams.get('especialidad') ?? '';
  const municipio = searchParams.get('municipio') ?? '';
  const page = Number(searchParams.get('page') ?? '1');

  useEffect(() => {
    api.get<Specialty[]>('/specialties').then(setSpecialties).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (especialidad) params.set('specialty', especialidad);
    if (municipio) params.set('municipality', municipio);
    if (searchParams.get('q')) params.set('search', searchParams.get('q')!);
    params.set('page', String(page));
    api
      .get<PaginatedResult<ProfessionalListItem> & { featured?: ProfessionalListItem[] }>(`/professionals?${params.toString()}`)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [especialidad, municipio, page, searchParams]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete('page');
      router.push(`/medicos?${params.toString()}`);
    },
    [router, searchParams],
  );

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`/medicos?${params.toString()}`);
  };

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl">Directorio de médicos</h1>
      <p className="mt-2 text-ink-600">
        Profesionales verificados en el estado Monagas, ordenados por relevancia y perfil completo.
      </p>

      <div className="card mt-6 grid gap-4 p-5 md:grid-cols-4">
        <form
          className="md:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            updateParam('q', search);
          }}
        >
          <Input
            label="Buscar por nombre"
            placeholder="Ej. Juan Pérez"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <Select
          label="Especialidad"
          value={especialidad}
          onChange={(value) => updateParam('especialidad', value)}
          options={[{ value: '', label: 'Todas' }, ...specialties.map((s) => ({ value: s.slug, label: s.name }))]}
        />
        <Select
          label="Municipio"
          value={municipio}
          onChange={(value) => updateParam('municipio', value)}
          options={municipalityOptions(municipalities, 'Todos')}
        />
      </div>

      {!loading && result?.featured && result.featured.length > 0 && (
        <section className="mt-8" aria-label="Perfiles destacados">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-lg font-semibold text-ink-900">Destacados</h2>
            <span className="text-xs text-ink-400">Espacio patrocinado · no es una recomendación clínica</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.featured.map((doctor) => (
              <DoctorCard key={doctor.id} doctor={doctor} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-8 w-8" />
          </div>
        ) : !result || result.items.length === 0 ? (
          <EmptyState
            title="No encontramos médicos con esos filtros"
            description="Intenta con otra especialidad o municipio."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((doctor) => (
                <DoctorCard key={doctor.id} doctor={doctor} />
              ))}
            </div>
            {result.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  Anterior
                </Button>
                <span className="text-sm text-ink-500">
                  Página {result.page} de {result.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= result.totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
