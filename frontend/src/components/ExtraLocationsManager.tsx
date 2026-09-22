'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

interface Location {
  id: string;
  name: string;
  address: string;
  municipality: string | null;
  phone: string | null;
  whatsapp: string | null;
}

export function ExtraLocationsManager() {
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', municipality: '', phone: '', whatsapp: '' });

  const load = async () => {
    try {
      const items = await api.get<Location[]>('/professionals/me/locations');
      setLocations(items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setLocked(true);
        setLocations([]);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/professionals/me/locations', {
        ...form,
        municipality: form.municipality || undefined,
        phone: form.phone || undefined,
        whatsapp: form.whatsapp || undefined,
      });
      setForm({ name: '', address: '', municipality: '', phone: '', whatsapp: '' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo agregar la sede');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    await api.delete(`/professionals/me/locations/${id}`).catch(() => undefined);
    load();
  };

  if (locations === null) {
    return (
      <div className="card flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (locked) {
    return (
      <EmptyState
        title="Varias sedes es un beneficio del plan Profesional Plus"
        description="Actualiza tu plan para agregar consultorios adicionales."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="card space-y-6 p-6">
      <h2 className="text-lg font-semibold text-ink-900">Sedes adicionales</h2>
      {error && <Alert tone="error">{error}</Alert>}

      {locations.length > 0 && (
        <ul className="space-y-2">
          {locations.map((loc) => (
            <li key={loc.id} className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-sm">
              <div>
                <p className="font-medium text-ink-800">{loc.name}</p>
                <p className="text-ink-500">
                  {loc.address}
                  {loc.municipality ? `, ${loc.municipality}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(loc.id)}>
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre de la sede" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Municipio" value={form.municipality} onChange={(e) => setForm({ ...form, municipality: e.target.value })} />
        <Input label="Dirección" required className="sm:col-span-2" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        <Button type="submit" loading={submitting} className="sm:col-span-2">
          Agregar sede
        </Button>
      </form>
    </div>
  );
}
