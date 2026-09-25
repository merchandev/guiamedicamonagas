'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Specialty } from '@/lib/types';
import { municipalityOptions, useMunicipalities } from '@/lib/catalogs';
import { Select } from '@/components/ui/Select';

export function HeroSearch({ specialties }: { specialties: Specialty[] }) {
  const router = useRouter();
  const [especialidad, setEspecialidad] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [q, setQ] = useState('');
  const municipalities = useMunicipalities();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (especialidad) params.set('especialidad', especialidad);
    if (municipio) params.set('municipio', municipio);
    if (q) params.set('q', q);
    router.push(`/medicos${params.toString() ? `?${params.toString()}` : ''}`);
  };

  return (
    <form onSubmit={onSubmit} className="card grid items-start gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:p-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Buscar médico por nombre, especialidad o código"
        placeholder="Nombre, especialidad o código (GM-…)"
        className="h-11 rounded-lg border border-ink-300 px-3.5 text-sm shadow-sm placeholder:text-ink-400 hover:border-ink-400 focus:border-pine-600 focus:outline-none focus:ring-2 focus:ring-pine-600/20"
      />
      <Select
        value={especialidad}
        onChange={setEspecialidad}
        placeholder="Cualquier especialidad"
        options={[
          { value: '', label: 'Cualquier especialidad' },
          ...specialties.map((s) => ({ value: s.slug, label: s.name })),
        ]}
      />
      <Select
        value={municipio}
        onChange={setMunicipio}
        placeholder="Cualquier municipio"
        options={municipalityOptions(municipalities, 'Cualquier municipio')}
      />
      <button
        type="submit"
        className="h-11 rounded-lg bg-pine-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-pine-800"
      >
        Buscar
      </button>
    </form>
  );
}
