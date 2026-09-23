'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { PageSpinner } from '@/components/ui/Spinner';

interface Bank {
  id: string;
  code: string;
  name: string;
  supportsPagoMovil: boolean;
  isActive: boolean;
}

interface State {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}

interface Municipality {
  id: string;
  slug: string;
  name: string;
}

export default function AdminCatalogsPage() {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [states, setStates] = useState<State[]>([]);
  const [stateSlug, setStateSlug] = useState('monagas');
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [municipalityId, setMunicipalityId] = useState('');
  const [newBank, setNewBank] = useState({ code: '', name: '' });
  const [newMunicipality, setNewMunicipality] = useState('');
  const [newParish, setNewParish] = useState('');
  const [parishes, setParishes] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
    }
  };

  const loadBanks = useCallback(() => api.get<Bank[]>('/payments/admin/banks').then(setBanks), []);
  const loadStates = useCallback(() => api.get<State[]>('/geo/admin/states').then(setStates), []);
  const loadMunicipalities = useCallback(
    () => api.get<Municipality[]>(`/geo/municipalities?state=${stateSlug}`).then(setMunicipalities),
    [stateSlug],
  );

  useEffect(() => {
    void loadBanks();
    void loadStates();
  }, [loadBanks, loadStates]);

  useEffect(() => {
    setMunicipalityId('');
    void loadMunicipalities();
  }, [loadMunicipalities]);

  useEffect(() => {
    if (municipalityId) api.get<{ id: string; name: string }[]>(`/geo/municipalities/${municipalityId}/parishes`).then(setParishes);
    else setParishes([]);
  }, [municipalityId]);

  if (!banks) return <PageSpinner />;

  const saveBank = (bank: Pick<Bank, 'code' | 'name'> & Partial<Bank>) =>
    run(async () => {
      await api.put('/payments/admin/banks', {
        code: bank.code,
        name: bank.name,
        supportsPagoMovil: bank.supportsPagoMovil,
        isActive: bank.isActive,
      });
      await loadBanks();
    }, 'Banco guardado');

  const currentState = states.find((s) => s.slug === stateSlug);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Bancos y geografía</h1>
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Bancos para Pago Móvil</h2>
          <p className="text-sm text-ink-500">Fusiones, cierres o bancos nuevos se gestionan aquí, sin desplegar código.</p>
        </div>
        <div className="divide-y divide-ink-50">
          {banks.map((bank) => (
            <div key={bank.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span className="text-sm text-ink-900">
                <span className="font-mono text-ink-500">{bank.code}</span> · {bank.name}
                {!bank.isActive && (
                  <Badge tone="neutral" className="ml-2">
                    Inactivo
                  </Badge>
                )}
              </span>
              <div className="flex items-center gap-4">
                <Switch
                  checked={bank.supportsPagoMovil}
                  onChange={(checked) => saveBank({ ...bank, supportsPagoMovil: checked })}
                  label="Pago Móvil"
                />
                <Switch checked={bank.isActive} onChange={(checked) => saveBank({ ...bank, isActive: checked })} label="Activo" />
              </div>
            </div>
          ))}
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void saveBank({ code: newBank.code, name: newBank.name, supportsPagoMovil: true, isActive: true }).then(() =>
              setNewBank({ code: '', name: '' }),
            );
          }}
        >
          <Input label="Código" placeholder="0000" value={newBank.code} onChange={(e) => setNewBank({ ...newBank, code: e.target.value })} />
          <Input label="Nombre" value={newBank.name} onChange={(e) => setNewBank({ ...newBank, name: e.target.value })} />
          <Button type="submit" disabled={!/^\d{4}$/.test(newBank.code) || newBank.name.trim().length < 2}>
            Agregar banco
          </Button>
        </form>
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Estados, municipios y parroquias</h2>
          <p className="text-sm text-ink-500">
            Activar un estado lo habilita en los formularios y el directorio. Carga sus municipios antes de activarlo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Select label="Estado" value={stateSlug} onChange={setStateSlug} options={states.map((s) => ({ value: s.slug, label: s.name }))} />
          {currentState && (
            <Switch
              checked={currentState.isActive}
              label="Activo"
              onChange={(checked) =>
                run(async () => {
                  await api.patch(`/geo/admin/states/${currentState.slug}`, { isActive: checked });
                  await loadStates();
                }, checked ? 'Estado activado' : 'Estado desactivado')
              }
            />
          )}
        </div>

        <div>
          <p className="field-label">Municipios ({municipalities.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {municipalities.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMunicipalityId(m.id)}
                className={`rounded-full px-3 py-1 text-sm ${municipalityId === m.id ? 'bg-pine-700 text-white' : 'bg-ink-50 text-ink-700'}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.post(`/geo/admin/states/${stateSlug}/municipalities`, { name: newMunicipality });
              setNewMunicipality('');
              await loadMunicipalities();
            }, 'Municipio agregado');
          }}
        >
          <Input label="Nuevo municipio" value={newMunicipality} onChange={(e) => setNewMunicipality(e.target.value)} />
          <Button type="submit" disabled={newMunicipality.trim().length < 2}>
            Agregar municipio
          </Button>
        </form>

        {municipalityId && (
          <div className="space-y-3 rounded-lg border border-ink-100 p-4">
            <p className="field-label">Parroquias</p>
            {parishes.length === 0 ? (
              <p className="text-sm text-ink-500">Sin parroquias cargadas.</p>
            ) : (
              <p className="text-sm text-ink-700">{parishes.map((p) => p.name).join(', ')}</p>
            )}
            <form
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api.post(`/geo/admin/municipalities/${municipalityId}/parishes`, { name: newParish });
                  setNewParish('');
                  setParishes(await api.get(`/geo/municipalities/${municipalityId}/parishes`));
                }, 'Parroquia agregada');
              }}
            >
              <Input label="Nueva parroquia" value={newParish} onChange={(e) => setNewParish(e.target.value)} />
              <Button type="submit" disabled={newParish.trim().length < 2}>
                Agregar parroquia
              </Button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
