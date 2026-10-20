'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import { newsletterApi, type SubscriberList, type SubscriberStatus } from '@/lib/newsletter';

const STATUS: Record<SubscriberStatus, { label: string; tone: 'neutral' | 'pine' | 'gold' | 'red' | 'amber' }> = {
  PENDING: { label: 'Pendiente', tone: 'amber' },
  ACTIVE: { label: 'Activo', tone: 'pine' },
  UNSUBSCRIBED: { label: 'Dado de baja', tone: 'neutral' },
};

export default function SuscriptoresPage() {
  const [data, setData] = useState<SubscriberList | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(
    () => newsletterApi.listSubscribers({ status: status || undefined, search: search || undefined, page }).then(setData),
    [status, search, page],
  );

  useEffect(() => {
    load().catch(() => setData({ items: [], total: 0, page: 1, pageSize: 50 }));
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setAdding(true);
    try {
      await newsletterApi.addSubscriber(email.trim(), name.trim() || undefined);
      setEmail('');
      setName('');
      setInfo('Suscriptor agregado.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo agregar.');
    } finally {
      setAdding(false);
    }
  };

  const importList = async () => {
    setError(null);
    setInfo(null);
    setImporting(true);
    try {
      const r = await newsletterApi.importSubscribers(bulk);
      setBulk('');
      setInfo(`Importados: ${r.added} nuevos, ${r.updated} actualizados (de ${r.unique} correos válidos).`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo importar.');
    } finally {
      setImporting(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este suscriptor de la lista?')) return;
    await newsletterApi.removeSubscriber(id).catch(() => undefined);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Suscriptores</h1>
        <Link href="/admin/boletines" className="text-sm text-pine-700 hover:underline">
          ← Boletines
        </Link>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={add} className="card space-y-3 p-5">
          <h2 className="font-medium text-ink-900">Agregar uno</h2>
          <Input label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <Button type="submit" loading={adding}>Agregar</Button>
        </form>

        <div className="card space-y-3 p-5">
          <h2 className="font-medium text-ink-900">Importar varios</h2>
          <Textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={5}
            placeholder="Pega una lista o CSV: correos separados por coma, espacio o salto de línea."
            hint="Se extraen los correos válidos, se deduplican y quedan activos."
          />
          <Button variant="outline" onClick={importList} loading={importing} disabled={!bulk.trim()}>
            Importar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Select
            ariaLabel="Filtrar por estado"
            value={status}
            onChange={(v) => {
              setPage(1);
              setStatus(v);
            }}
            placeholder="Todos los estados"
            options={[
              { value: '', label: 'Todos los estados' },
              { value: 'ACTIVE', label: 'Activos' },
              { value: 'PENDING', label: 'Pendientes' },
              { value: 'UNSUBSCRIBED', label: 'Dados de baja' },
            ]}
          />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <Input
            placeholder="Buscar por correo"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
      </div>

      {!data ? (
        <PageSpinner />
      ) : (
        <>
          <p className="text-sm text-ink-500">{data.total} suscriptor(es) en la lista propia.</p>
          <div className="card divide-y divide-ink-50">
            {data.items.length === 0 ? (
              <p className="p-4 text-sm text-ink-500">Sin resultados.</p>
            ) : (
              data.items.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-900">{s.email}</p>
                    {s.name && <p className="truncate text-xs text-ink-500">{s.name}</p>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>Eliminar</Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {data.total > data.pageSize && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="text-sm text-ink-500">Página {data.page}</span>
              <Button variant="outline" size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
