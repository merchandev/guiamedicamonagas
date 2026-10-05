'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { REVIEWS_PUBLIC_NOTICE } from '@/lib/legal';
import type { PublicReview, PublicReviewPage, ReviewSummaryData } from '@/lib/reviews';
import { Button } from '@/components/ui/Button';
import { ReviewSummary } from './ReviewSummary';
import { ReviewCard } from './ReviewCard';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** «Opiniones de pacientes» en la ficha pública: la primera página llega del servidor, el resto con «Ver más». */
export function DoctorReviews({
  slug,
  summary,
  initialItems,
  totalPages,
}: {
  slug: string;
  summary: ReviewSummaryData;
  initialItems: PublicReview[];
  totalPages: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.get<PublicReviewPage>(`/reviews/professional/${slug}?page=${page + 1}`);
      if (next.enabled) {
        setItems((current) => [...current, ...next.items.filter((item) => !current.some((c) => c.id === item.id))]);
        setPage(next.page);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar más opiniones');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="opiniones" aria-labelledby="opiniones-titulo" className="mt-10 scroll-mt-24 border-t border-ink-100 pt-8">
      <h2 id="opiniones-titulo" className="mb-4 font-semibold text-ink-900">
        Opiniones de pacientes
      </h2>
      <ReviewSummary summary={summary} />
      <p className="mt-4 text-xs leading-relaxed text-ink-500">{REVIEWS_PUBLIC_NOTICE}</p>

      {items.length > 0 && (
        <div className="mt-5 space-y-3">
          {items.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              reportHref={`/reclamos?tipo=REVIEW_ABUSE&url=${encodeURIComponent(`${SITE_URL}/medicos/${slug}#opinion-${review.id}`)}`}
            />
          ))}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {page < totalPages && (
        <Button variant="outline" size="sm" className="mt-4" loading={loading} onClick={() => void loadMore()}>
          Ver más opiniones
        </Button>
      )}

      <p className="mt-5 text-sm text-ink-600">
        ¿Te atendió este médico?{' '}
        <Link href={`/paciente/valoraciones?medico=${encodeURIComponent(slug)}`} className="font-medium text-pine-700 underline">
          Escribe tu opinión
        </Link>
        . Hace falta una cuenta de paciente con la identidad verificada y una consulta verificada.
      </p>
    </section>
  );
}
