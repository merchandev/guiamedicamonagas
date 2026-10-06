'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { PRESCRIPTION_STATUS, type PrescriptionPad, type PrescriptionSummary } from '@/lib/prescriptions';
import { MissingRequirements } from '@/components/prescriptions/MissingRequirements';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';

interface PrescriptionPage {
  items: PrescriptionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export default function DoctorPrescriptionsPage() {
  const [pad, setPad] = useState<PrescriptionPad | null>(null);
  const [data, setData] = useState<PrescriptionPage | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api.get<PrescriptionPad>('/prescriptions/pad').then(setPad, (e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu talonario'));
  }, []);

  const load = useCallback((q: string, pageNumber: number) => {
    const params = new URLSearchParams({ page: String(pageNumber) });
    if (q) params.set('q', q);
    return api.get<PrescriptionPage>(`/prescriptions?${params}`);
  }, []);

  useEffect(() => {
    load(search, 1).then(
      (result) => setData(result),
      (e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus récipes'),
    );
  }, [load, search]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() === search) return;
    setPage(1);
    setData(null);
    setSearch(query.trim());
  };

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const next = await load(search, page + 1);
      setPage(page + 1);
      setData({ ...next, items: [...data.items, ...next.items] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar más récipes');
    } finally {
      setLoadingMore(false);
    }
  };

  if (!pad) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Récipes</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            Emite récipes con tu firma, tu sello y los datos que exige la norma del MPPS. Descárgalos en PDF, envíalos por
            WhatsApp o por correo, o entrégalos a un paciente de tu directorio. La farmacia los verifica con su código.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/recipes/talonario" className="inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-medium text-ink-800 hover:bg-ink-50">
            Talonario: firma, sello y logo
          </Link>
          {pad.canIssue ? (
            <Link href="/dashboard/recipes/nuevo" className="inline-flex h-11 items-center rounded-lg bg-pine-700 px-4 text-sm font-medium text-white hover:bg-pine-800">
              Nuevo récipe
            </Link>
          ) : (
            <Button disabled>Nuevo récipe</Button>
          )}
        </div>
      </div>

      <MissingRequirements pad={pad} />
      {error && <Alert tone="error">{error}</Alert>}

      <form role="search" onSubmit={submitSearch} className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-80">
          <Input
            label="Buscar"
            placeholder="Paciente, cédula, N° o medicamento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {search && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery('');
              setPage(1);
              setData(null);
              setSearch('');
            }}
          >
            Ver todos
          </Button>
        )}
      </form>

      {!data ? (
        <PageSpinner />
      ) : data.items.length === 0 ? (
        <EmptyState
          title={search ? 'Ningún récipe coincide' : 'Aún no has emitido récipes'}
          description={search ? 'Prueba con otro nombre, cédula o número.' : 'Cuando emitas uno, aparecerá aquí con su código de verificación.'}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {data.total === 1 ? '1 récipe' : `${data.total} récipes`}
            {search ? ` para «${search}»` : ''}
          </p>
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li key={item.id}>
                <Link href={`/dashboard/recipes/${item.id}`} className="card block p-4 transition-colors hover:border-pine-300">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink-900">
                      N° {item.numberLabel} · {item.patientName}
                      {item.patientCedula ? <span className="font-normal text-ink-600"> · C.I. {item.patientCedula}</span> : null}
                    </p>
                    <div className="flex gap-2">
                      {item.delivered && <Badge tone="gold">En su cuenta</Badge>}
                      <Badge tone={PRESCRIPTION_STATUS[item.status].tone}>{PRESCRIPTION_STATUS[item.status].label}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{item.itemsSummary}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    Emitido el {formatDate(item.issuedAt, { dateStyle: 'long' })} · vence el {formatDate(item.expiresAt, { dateStyle: 'long' })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {!search && data.items.length < data.total && (
            <Button variant="outline" onClick={() => void loadMore()} loading={loadingMore}>
              Ver más
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
