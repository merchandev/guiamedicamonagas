'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useRealtimeRefresh } from '@/lib/realtime';
import { REVIEW_RULES, REVIEW_RULES_VERSION } from '@/lib/legal';
import { capitalizeFirst, formatMonthKey } from '@/lib/dates';
import { REVIEW_BASIS_LABEL, REVIEW_STATUS, type ReviewAuthorDisplay, type ReviewBasis, type ReviewStatus } from '@/lib/reviews';
import { useReviewsEnabled } from '@/lib/use-reviews';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageSpinner } from '@/components/ui/Spinner';
import { StarInput } from '@/components/reviews/StarInput';
import { Stars } from '@/components/reviews/Stars';

interface CompletenessItem {
  key: string;
  label: string;
  done: boolean;
}

interface Requirements {
  completeness: { percent: number; items: CompletenessItem[] };
  identity: 'MISSING' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  emailVerified: boolean;
  adult: boolean;
  canReview: boolean;
  blockers: string[];
}

interface OwnReview {
  id: string;
  rating: number;
  comment: string | null;
  authorDisplay: ReviewAuthorDisplay;
  status: ReviewStatus;
  moderationNote: string | null;
  consultationMonth: string;
  reply: { content: string } | null;
}

interface DoctorEntry {
  professional: { id: string; slug: string; name: string; specialty: string | null; isPublished: boolean };
  consultation: { basis: ReviewBasis; month: string } | null;
  review: OwnReview | null;
}

interface MyReviews {
  requirements: Requirements;
  authorPreview: string | null;
  doctors: DoctorEntry[];
}

const IDENTITY_LABEL: Record<Requirements['identity'], string> = {
  MISSING: 'Falta subir la foto de tu cédula',
  PENDING: 'En revisión',
  VERIFIED: 'Verificada',
  REJECTED: 'Rechazada: sube una foto nueva',
};

const COMMENT_MAX = 1000;

function ReviewsContent() {
  const enabled = useReviewsEnabled();
  const doctorSlug = useSearchParams().get('medico');
  const [data, setData] = useState<MyReviews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<DoctorEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const openedFromLink = useRef(false);

  const load = useCallback(() => {
    api
      .get<MyReviews>('/reviews/me')
      .then((result) => {
        setData(result);
        // ?medico=… llega desde la ficha del médico o desde «Mis citas»: abre su formulario una vez.
        if (!openedFromLink.current && doctorSlug) {
          openedFromLink.current = true;
          const entry = result.doctors.find((d) => d.professional.slug === doctorSlug);
          if (entry && result.requirements.canReview && entry.consultation && entry.review?.status !== 'WITHDRAWN') {
            setEditing(entry);
          }
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus valoraciones'));
  }, [doctorSlug]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  useRealtimeRefresh(['reviews', 'appointments'], () => enabled && load());

  const remove = async (review: OwnReview) => {
    if (!window.confirm('¿Borrar tu valoración? Puedes escribir otra después.')) return;
    setDeletingId(review.id);
    setError(null);
    try {
      await api.delete(`/reviews/${review.id}`);
      setNotice('Borraste tu valoración.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo borrar la valoración');
    } finally {
      setDeletingId(null);
    }
  };

  if (enabled === null) return <PageSpinner />;
  if (!enabled) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl">Mis valoraciones</h1>
        <EmptyState title="Las valoraciones aún no están disponibles" description="Te avisaremos cuando puedas opinar sobre tus médicos." />
      </div>
    );
  }
  if (!data) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  const { requirements } = data;
  const linkedMissing = doctorSlug && !data.doctors.some((d) => d.professional.slug === doctorSlug && d.consultation);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Mis valoraciones</h1>
        <p className="mt-1 text-sm text-ink-600">
          Puedes opinar sobre los médicos con los que tuviste una consulta verificada: una cita realizada en la plataforma o
          que te hayan registrado con tu código.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {linkedMissing && (
        <Alert tone="warning">
          Todavía no puedes valorar a ese médico: hace falta una consulta verificada con él o ella (una cita realizada en la
          plataforma o que te haya registrado con tu código).
        </Alert>
      )}

      <section className="card space-y-4 p-6" aria-labelledby="requisitos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="requisitos" className="text-lg font-semibold text-ink-900">
            Requisitos para valorar
          </h2>
          {requirements.canReview ? <Badge tone="pine">Cumples los requisitos</Badge> : <Badge tone="amber">Faltan pasos</Badge>}
        </div>
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink-800">Tu registro</span>
            <span className="font-semibold text-ink-900">{requirements.completeness.percent} %</span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100"
            role="progressbar"
            aria-label="Tu registro"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={requirements.completeness.percent}
          >
            <div className="h-full rounded-full bg-pine-600" style={{ width: `${requirements.completeness.percent}%` }} />
          </div>
          <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {requirements.completeness.items.map((item) => (
              <li key={item.key} className={item.done ? 'text-ink-700' : 'text-ink-500'}>
                <span aria-hidden="true" className={item.done ? 'text-pine-700' : 'text-ink-400'}>
                  {item.done ? '✓' : '○'}
                </span>{' '}
                {item.label}
                <span className="sr-only">{item.done ? ': listo' : ': falta'}</span>
              </li>
            ))}
            <li className={requirements.identity === 'VERIFIED' ? 'text-ink-700' : 'text-ink-500'}>
              <span aria-hidden="true" className={requirements.identity === 'VERIFIED' ? 'text-pine-700' : 'text-ink-400'}>
                {requirements.identity === 'VERIFIED' ? '✓' : '○'}
              </span>{' '}
              Cédula aprobada: {IDENTITY_LABEL[requirements.identity]}
            </li>
          </ul>
        </div>
        {!requirements.canReview && (
          <Alert tone="warning">
            <ul className="list-disc space-y-1 pl-4">
              {requirements.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
            <Link href="/paciente" className="mt-2 inline-block font-medium underline">
              Completar mi perfil
            </Link>
          </Alert>
        )}
        <p className="text-xs text-ink-500">
          No te pedimos datos de salud para opinar: solo tu identidad y tu contacto, para saber que eres una persona real.
        </p>
      </section>

      <section aria-labelledby="mis-medicos" className="space-y-3">
        <h2 id="mis-medicos" className="text-lg font-semibold text-ink-900">
          Tus médicos
        </h2>
        {data.doctors.length === 0 ? (
          <EmptyState
            title="Todavía no tienes consultas verificadas"
            description="Cuando un médico marque como realizada una cita tuya, o te registre con tu código, podrás valorarlo aquí."
          />
        ) : (
          data.doctors.map((entry) => {
            const { professional, consultation, review } = entry;
            const canWrite = requirements.canReview && !!consultation && professional.isPublished && review?.status !== 'WITHDRAWN';
            return (
              <article
                key={professional.id}
                className={`card space-y-3 p-5 ${doctorSlug === professional.slug ? 'ring-2 ring-pine-300' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/medicos/${professional.slug}`} className="font-semibold text-ink-900 hover:underline">
                      Dr(a). {professional.name}
                    </Link>
                    {professional.specialty && <p className="text-sm text-pine-700">{professional.specialty}</p>}
                    {consultation && (
                      <p className="mt-0.5 text-xs text-ink-500">
                        {REVIEW_BASIS_LABEL[consultation.basis]} · {capitalizeFirst(formatMonthKey(consultation.month))}
                      </p>
                    )}
                  </div>
                  {review && <Badge tone={REVIEW_STATUS[review.status].tone}>{REVIEW_STATUS[review.status].label}</Badge>}
                </div>

                {review && (
                  <div className="rounded-lg bg-ink-50/70 p-3">
                    <Stars value={review.rating} />
                    {review.comment && <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-700">{review.comment}</p>}
                    <p className="mt-1.5 text-xs text-ink-500">
                      Se muestra como: {review.authorDisplay === 'INITIAL' && data.authorPreview ? data.authorPreview : 'Paciente verificado'}
                    </p>
                    {review.status === 'PENDING' && (
                      <p className="mt-1.5 text-xs text-ink-600">El equipo revisa tu comentario antes de publicarlo.</p>
                    )}
                    {review.status === 'REJECTED' && (
                      <p className="mt-1.5 text-sm text-red-700">
                        No se publicó{review.moderationNote ? `: ${review.moderationNote}` : '.'} Puedes corregirla y enviarla de
                        nuevo.
                      </p>
                    )}
                    {review.status === 'WITHDRAWN' && (
                      <p className="mt-1.5 text-sm text-ink-700">
                        La administración la retiró del sitio{review.moderationNote ? `: ${review.moderationNote}` : '.'} Si no
                        estás de acuerdo, puedes reclamar en{' '}
                        <Link href="/reclamos" className="font-medium underline">
                          Reclamos
                        </Link>
                        .
                      </p>
                    )}
                    {review.reply && (
                      <div className="mt-2 rounded-md bg-white p-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-pine-800">Respuesta del médico</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{review.reply.content}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {canWrite && (
                    <Button size="sm" variant={review ? 'outline' : 'primary'} onClick={() => setEditing(entry)}>
                      {review ? 'Editar mi opinión' : 'Valorar'}
                    </Button>
                  )}
                  {review && review.status !== 'WITHDRAWN' && (
                    <Button size="sm" variant="ghost" loading={deletingId === review.id} onClick={() => void remove(review)}>
                      Borrar
                    </Button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      {editing && (
        <ReviewDialog
          entry={editing}
          authorPreview={data.authorPreview}
          onClose={() => setEditing(null)}
          onDone={(status) => {
            setEditing(null);
            setNotice(
              status === 'PUBLISHED'
                ? '¡Gracias! Tu valoración ya está publicada.'
                : '¡Gracias! El equipo revisará tu comentario antes de publicarlo.',
            );
            load();
          }}
        />
      )}
    </div>
  );
}

function ReviewDialog({
  entry,
  authorPreview,
  onClose,
  onDone,
}: {
  entry: DoctorEntry;
  authorPreview: string | null;
  onClose: () => void;
  onDone: (status: ReviewStatus) => void;
}) {
  const existing = entry.review;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [authorDisplay, setAuthorDisplay] = useState<ReviewAuthorDisplay>(existing?.authorDisplay ?? 'ANONYMOUS');
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingError, setRatingError] = useState<string | undefined>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) {
      setRatingError('Elige de 1 a 5 estrellas');
      return;
    }
    setRatingError(undefined);
    setSaving(true);
    setError(null);
    const body = { rating, comment: comment.trim(), authorDisplay, acceptRules: accepted };
    try {
      const result = existing
        ? await api.patch<{ status: ReviewStatus }>(`/reviews/${existing.id}`, body)
        : await api.post<{ status: ReviewStatus }>('/reviews', { ...body, professionalId: entry.professional.id });
      onDone(result.status);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar tu valoración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Tu opinión sobre Dr(a). ${entry.professional.name}`} widthClassName="max-w-xl">
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        {existing?.status === 'PUBLISHED' && (
          <Alert tone="info">Si la guardas con comentario, sale del sitio hasta que el equipo revise el comentario.</Alert>
        )}
        <StarInput value={rating} onChange={setRating} error={ratingError} />
        <Textarea
          label="Comentario (opcional)"
          rows={5}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          hint={`${comment.length}/${COMMENT_MAX}. Sobre la atención: trato, puntualidad, explicaciones, el lugar de consulta.`}
        />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">Cómo se muestra tu nombre</legend>
          <div className="space-y-2 text-sm text-ink-700">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="authorDisplay"
                className="mt-1"
                checked={authorDisplay === 'ANONYMOUS'}
                onChange={() => setAuthorDisplay('ANONYMOUS')}
              />
              <span>
                «Paciente verificado» <span className="text-ink-500">(recomendado: nadie sabe quién eres)</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="authorDisplay"
                className="mt-1"
                checked={authorDisplay === 'INITIAL'}
                onChange={() => setAuthorDisplay('INITIAL')}
              />
              <span>
                Mi nombre y la inicial de mi apellido{authorPreview ? ` («${authorPreview}»)` : ''}
              </span>
            </label>
          </div>
        </fieldset>
        <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-4">
          <p className="text-sm font-semibold text-ink-900">Reglas de las valoraciones (versión {REVIEW_RULES_VERSION})</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
            {REVIEW_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-sm text-ink-800">
            <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>Acepto estas reglas.</span>
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={!accepted}>
            {existing ? 'Guardar y enviar' : 'Enviar valoración'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function PatientReviewsPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ReviewsContent />
    </Suspense>
  );
}
