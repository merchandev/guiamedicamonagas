'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { Specialty } from '@/lib/types';

export default function AdminSpecialtiesPage() {
  const [items, setItems] = useState<Specialty[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => api.get<Specialty[]>('/specialties').then(setItems);

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/specialties', { name, description: description || undefined });
      setName('');
      setDescription('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la especialidad');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar esta especialidad?')) return;
    await api.delete(`/specialties/${id}`).catch(() => undefined);
    load();
  };

  if (!items) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Especialidades</h1>

      <form onSubmit={create} className="card grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto]">
        {error && <Alert tone="error" className="sm:col-span-3">{error}</Alert>}
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex items-end">
          <Button type="submit" loading={submitting} className="w-full">
            Agregar
          </Button>
        </div>
      </form>

      <div className="card divide-y divide-ink-50">
        {items.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-ink-900">{s.name}</p>
              {s.description && <p className="text-sm text-ink-500">{s.description}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
              Eliminar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
