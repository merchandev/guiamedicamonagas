'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

export interface Municipality {
  id: string;
  slug: string;
  name: string;
  state: { slug: string; name: string };
}

export interface Bank {
  code: string;
  name: string;
  supportsPagoMovil: boolean;
}

// Caché por pestaña: los catálogos cambian muy de vez en cuando.
let municipalitiesCache: Promise<Municipality[]> | null = null;
let banksCache: Promise<Bank[]> | null = null;

/** Municipios de los estados activos, desde el catálogo administrable (no una lista fija). */
export function useMunicipalities(): Municipality[] {
  const [items, setItems] = useState<Municipality[]>([]);
  useEffect(() => {
    municipalitiesCache ??= api.get<Municipality[]>('/geo/municipalities').catch(() => {
      municipalitiesCache = null;
      return [];
    });
    municipalitiesCache.then(setItems);
  }, []);
  return items;
}

/** Bancos activos, desde el catálogo administrable. */
export function useBanks(): Bank[] {
  const [items, setItems] = useState<Bank[]>([]);
  useEffect(() => {
    banksCache ??= api.get<Bank[]>('/payments/banks').catch(() => {
      banksCache = null;
      return [];
    });
    banksCache.then(setItems);
  }, []);
  return items;
}

export function municipalityOptions(items: Municipality[], emptyLabel: string) {
  return [{ value: '', label: emptyLabel }, ...items.map((m) => ({ value: m.name, label: m.name }))];
}
