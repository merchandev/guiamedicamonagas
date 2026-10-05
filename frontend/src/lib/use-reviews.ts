'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface ReviewsConfig {
  enabled: boolean;
  minForAverage: number;
}

let configRequest: Promise<ReviewsConfig> | null = null;

/** Una sola consulta por pestaña: si las valoraciones están encendidas (REVIEWS_ENABLED en la API). */
export function fetchReviewsConfig(): Promise<ReviewsConfig> {
  configRequest ??= api.get<ReviewsConfig>('/reviews/config').catch(() => {
    configRequest = null;
    return { enabled: false, minForAverage: 3 };
  });
  return configRequest;
}

/** `null` mientras se consulta; los menús solo muestran «Valoraciones» si están encendidas. */
export function useReviewsEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchReviewsConfig().then((config) => {
      if (alive) setEnabled(config.enabled);
    });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
