'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { REVIEW_REPLY_NOTICE, REVIEWS_PUBLIC_NOTICE } from '@/lib/legal';
import { formatDate } from '@/lib/dates';
import {
  REPORT_REASONS,
  REVIEW_STATUS,
  type PublicReview,
  type ReviewReportReason,
  type ReviewStatus,
  type ReviewSummaryData,
} from '@/lib/reviews';
import { useReviewsEnabled } from '@/lib/use-reviews';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { ReviewSummary } from '@/components/reviews/ReviewSummary';

interface DoctorReview extends Omit<PublicReview, 'reply'> {
  reply: { content: string; status: ReviewStatus; moderationNote: string | null; updatedAt: string } | null;
  report: { reason: ReviewReportReason; status: 'OPEN' | 'UPHELD' | 'DISMISSED'; createdAt: string } | null;
}

interface DoctorReviewsPage {
  slug: string;
  isPublished: boolean;
  summary: ReviewSummaryData;
  items: DoctorReview[];
  total: number;
  page: number;
  totalPages: number;
}

const REPORT_STATUS: Record<NonNullable<DoctorReview['report']>['status'], string> = {
  OPEN: 'La administración la está revisando',
  UPHELD: 'La administración te dio la razón',
  DISMISSED: 'La administración la revisó y la mantuvo',
};

const TEXT_MAX = 1000;

export default function DoctorReviewsPage() {
  const enabled = useReviewsEnabled();
  const [data, setData] = useState<DoctorReviewsPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replying, setReplying] = useState<DoctorReview | null>(null);
  const [reporting, setReporting] = useState<DoctorReview | null>(null);

  const load = useCallback((target: number) => {
    api
      .get<DoctorReviewsPage>(`/reviews/me/professional?page=${target}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus valoraciones'));
  }, []);

  useEffect(() => {
    if (enabled) load(page);
  }, [enabled, page, load]);

  const removeReply = async (review: DoctorReview) => {
    if (!window.confirm('¿Borrar tu respuesta?')) return;
    setError(null);
    try {
      await api.delete(`/reviews/${review.id}/reply`);
      setNotice('Borraste tu respuesta.');
      load(page);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo borrar la respuesta');
    }
  };

  if (enabled === null) return <PageSpinner />;
  if (!enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Valoraciones</h1>
        <EmptyState title="Las valoraciones aún no están disponibles" />
      </div>
    );
  }
  if (!data) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Valoraciones</h1>
        <p className="mt-1 text-sm text-ink-600">
          Lo que tus pacientes opinan de tu atención, tal como se ve en{' '}
          <Link href={`/medicos/${data.slug}#opiniones`} className="font-medium text-pine-700 underline">
            tu ficha
          </Link>
          . Solo opinan pacientes con la identidad verificada y una consulta verificada contigo.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="card space-y-4 p-6" aria-label="Resumen">
        <ReviewSummary summary={data.summary} />
        <p className="text-xs leading-relaxed text-ink-500">{REVIEWS_PUBLIC_NOTICE}</p>
        <p className="text-xs leading-relaxed text-ink-500">
          No puedes borrar ni ocultar opiniones, ni pedirlas a cambio de descuentos o beneficios. Puedes responder una vez a
          cada una y, si una incumple las reglas, denunciarla: la administración la revisa. No ves quién escribió una opinión
          anónima.
        </p>
      </section>

      {data.items.length === 0 ? (
        <EmptyState title="Todavía no tienes opiniones publicadas" />
      ) : (
        <div className="space-y-3">
          {data.items.map((review) => (
            <ReviewCard
              key={review.id}
              review={{ ...review, reply: review.reply?.status === 'PUBLISHED' ? { content: review.reply.content } : null }}
            >
              {review.reply && review.reply.status !== 'PUBLISHED' && (
                <div className="mt-3 rounded-lg border border-ink-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">Tu respuesta</p>
                    <Badge tone={REVIEW_STATUS[review.reply.status].tone}>{REVIEW_STATUS[review.reply.status].label}</Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{review.reply.content}</p>
                  {review.reply.moderationNote && (
                    <p className="mt-1 text-sm text-red-700">Motivo: {review.reply.moderationNote}</p>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {review.reply?.status !== 'WITHDRAWN' && (
                  <Button size="sm" variant="outline" onClick={() => setReplying(review)}>
                    {review.reply ? 'Editar respuesta' : 'Responder'}
                  </Button>
                )}
                {review.reply && review.reply.status !== 'WITHDRAWN' && (
                  <Button size="sm" variant="ghost" onClick={() => void removeReply(review)}>
                    Borrar respuesta
                  </Button>
                )}
                {review.report ? (
                  <span className="text-xs text-ink-500">
                    Denunciada el {formatDate(review.report.createdAt, { dateStyle: 'long' })}: {REPORT_STATUS[review.report.status]}
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setReporting(review)}>
                    Denunciar
                  </Button>
                )}
              </div>
            </ReviewCard>
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Páginas">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anteriores
          </Button>
          <span className="text-sm text-ink-600">
            Página {data.page} de {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            Siguientes
          </Button>
        </nav>
      )}

      {replying && (
        <ReplyDialog
          review={replying}
          onClose={() => setReplying(null)}
          onDone={() => {
            setReplying(null);
            setNotice('Enviaste tu respuesta: se publica cuando el equipo la revise.');
            load(page);
          }}
        />
      )}
      {reporting && (
        <ReportDialog
          review={reporting}
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            setNotice('Enviaste la denuncia. La administración la revisa; mientras tanto la opinión sigue publicada.');
            load(page);
          }}
        />
      )}
    </div>
  );
}

function ReplyDialog({ review, onClose, onDone }: { review: DoctorReview; onClose: () => void; onDone: () => void }) {
  const [content, setContent] = useState(review.reply?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put(`/reviews/${review.id}/reply`, { content: content.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la respuesta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={review.reply ? 'Editar tu respuesta' : 'Responder la opinión'} widthClassName="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Alert tone="warning">{REVIEW_REPLY_NOTICE}</Alert>
        <Textarea
          label="Tu respuesta"
          rows={5}
          required
          minLength={2}
          maxLength={TEXT_MAX}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          hint={`${content.length}/${TEXT_MAX}`}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={content.trim().length < 2}>
            Enviar respuesta
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReportDialog({ review, onClose, onDone }: { review: DoctorReview; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<ReviewReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/reviews/${review.id}/report`, { reason, details: details.trim() || undefined });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar la denuncia');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Denunciar la opinión" widthClassName="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm text-ink-600">
          La opinión sigue publicada mientras la administración la revisa. No reveles datos clínicos del paciente en los
          detalles.
        </p>
        <Select
          label="Motivo"
          required
          value={reason}
          onChange={(value) => setReason(value as ReviewReportReason)}
          options={[{ value: '', label: 'Elige un motivo' }, ...REPORT_REASONS]}
        />
        <Textarea
          label="Detalles (opcional)"
          rows={4}
          maxLength={TEXT_MAX}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={!reason}>
            Enviar denuncia
          </Button>
        </div>
      </form>
    </Modal>
  );
}
