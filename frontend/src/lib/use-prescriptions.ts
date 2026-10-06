'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface PrescriptionsConfig {
  enabled: boolean;
  rulesVersion: string;
  maxItems: number;
}

let configRequest: Promise<PrescriptionsConfig> | null = null;

/** Una sola consulta por pestaña: si los récipes digitales están encendidos (PRESCRIPTIONS_ENABLED en la API). */
export function fetchPrescriptionsConfig(): Promise<PrescriptionsConfig> {
  configRequest ??= api.get<PrescriptionsConfig>('/prescriptions/config').catch(() => {
    configRequest = null;
    return { enabled: false, rulesVersion: '', maxItems: 8 };
  });
  return configRequest;
}

/** `null` mientras se consulta; los menús solo muestran «Récipes» si están encendidos. */
export function usePrescriptionsEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPrescriptionsConfig().then((config) => {
      if (alive) setEnabled(config.enabled);
    });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
