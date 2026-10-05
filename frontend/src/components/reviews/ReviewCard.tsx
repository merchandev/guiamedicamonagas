import { capitalizeFirst, formatMonthKey } from '@/lib/dates';
import { REVIEW_BASIS_LABEL, type PublicReview } from '@/lib/reviews';
import { Stars } from './Stars';

/** Una opinión publicada: estrellas, autor, consulta verificada (mes y año), comentario y respuesta del médico. */
export function ReviewCard({
  review,
  reportHref,
  children,
}: {
  review: PublicReview;
  /** En la ficha pública: enlace al canal de reclamos para denunciar esta opinión. */
  reportHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <article id={`opinion-${review.id}`} className="scroll-mt-24 rounded-lg border border-ink-100 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={review.rating} />
        <span className="text-sm font-semibold text-ink-900">{review.author}</span>
      </div>
      <p className="mt-1 text-xs text-ink-500">
        Consulta verificada · {REVIEW_BASIS_LABEL[review.basis]} · {capitalizeFirst(formatMonthKey(review.consultationMonth))}
      </p>
      {review.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{review.comment}</p>}
      {review.reply && (
        <div className="mt-3 rounded-lg bg-pine-50/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-pine-800">Respuesta del médico</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{review.reply.content}</p>
        </div>
      )}
      {reportHref && (
        <a href={reportHref} className="mt-2 inline-block text-xs text-ink-500 underline hover:text-ink-700">
          Denunciar esta opinión
        </a>
      )}
      {children}
    </article>
  );
}
