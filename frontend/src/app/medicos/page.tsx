'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { PaginatedResult, ProfessionalListItem, Specialty } from '@/lib/types';
import { municipalityOptions, useMunicipalities } from '@/lib/catalogs';
import { DoctorCard } from '@/components/DoctorCard';
import { MedicalDisclaimer } from '@/components/legal/MedicalDisclaimer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';

type DirectoryResult = PaginatedResult<ProfessionalListItem> & { featured?: ProfessionalListItem[] };

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
  // Cada respuesta guarda la búsqueda que la pidió: mientras no llega la de
  // los filtros actuales se muestra el indicador de carga, y una respuesta
  // lenta de filtros anteriores nunca reemplaza a la vigente.
  const [response, setResponse] = useState<{ query: string; data: DirectoryResult | null } | null>(null);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const municipalities = useMunicipalities();

  const especialidad = searchParams.get('especialidad') ?? '';
  const municipio = searchParams.get('municipio') ?? '';
  const q = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const filtered = Boolean(especialidad || municipio || q);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (especialidad) params.set('specialty', especialidad);
    if (municipio) params.set('municipality', municipio);
    if (q) params.set('search', q);
    params.set('page', String(page));
    return params.toString();
  }, [especialidad, municipio, q, page]);

  const loading = response?.query !== query;
  const result = loading ? null : response.data;

  useEffect(() => {
    api.get<Specialty[]>('/specialties').then(setSpecialties).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    api.get<DirectoryResult>(`/professionals?${query}`).then(
      (data) => active && setResponse({ query, data }),
      () => active && setResponse({ query, data: null }),
    );
    return () => {
      active = false;
    };
  }, [query]);

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
            id="buscar-medico"
            type="search"
            label="Buscar médico"
            placeholder="Nombre, especialidad o código (GM-…)"
            hint="Solo busca médicos del directorio. Pulsa Enter para buscar."
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
        ) : !result ? (
          <EmptyState
            title="No pudimos cargar el directorio"
            description="Revisa tu conexión e intenta de nuevo en unos minutos."
          />
        ) : result.items.length === 0 && filtered ? (
          <EmptyState
            title="No encontramos médicos con esos filtros"
            description="Intenta con otra especialidad o municipio."
            action={
              <Link href="/medicos" className="text-sm font-semibold text-pine-700 hover:underline">
                Ver todo el directorio
              </Link>
            }
          />
        ) : result.items.length === 0 ? (
          <EmptyState
            title="Estamos verificando a los primeros médicos"
            description="Cada perfil se publica solo después de revisar sus documentos uno por uno. Vuelve pronto."
            action={
              <Link
                href="/registro?tipo=medico"
                className="rounded-lg bg-pine-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pine-800"
              >
                ¿Eres médico en Monagas? Registra tu perfil
              </Link>
            }
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

      <MedicalDisclaimer emergency className="mt-10" />
    </div>
  );
}
