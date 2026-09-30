import type { Metadata } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { LEGAL_EFFECTIVE_DATE_LABEL, legalDoc, type LegalDocSlug } from '@/lib/legal';

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** Título, descripción y URL canónica de una página legal a partir del registro. */
export function legalMetadata(slug: LegalDocSlug): Metadata {
  const doc = legalDoc(slug);
  return { title: doc.title, description: doc.summary, alternates: { canonical: doc.href } };
}

/**
 * Marco común de las páginas legales: versión y fecha, índice, secciones
 * numeradas y documentos relacionados. Cada página solo aporta su contenido.
 */
export function LegalPage({
  slug,
  lead,
  sections,
  related = [],
  children,
}: {
  slug: LegalDocSlug;
  /** Resumen en lenguaje llano, antes del índice. */
  lead?: React.ReactNode;
  sections: LegalSection[];
  related?: LegalDocSlug[];
  /** Contenido adicional después de las secciones (por ejemplo, un formulario). */
  children?: React.ReactNode;
}) {
  const doc = legalDoc(slug);
  return (
    <div className="container-page max-w-3xl py-12">
      <nav aria-label="Ruta" className="text-sm text-ink-500">
        <Link href="/legal" className="text-pine-700 hover:underline">
          Centro legal
        </Link>{' '}
        <span aria-hidden>›</span> {doc.short}
      </nav>
      <h1 className="mt-2 text-3xl">{doc.title}</h1>
      <p className="mt-2 text-sm text-ink-500">
        Versión {doc.version} — vigente desde el {LEGAL_EFFECTIVE_DATE_LABEL}.
      </p>
      {lead && <div className="mt-4 text-ink-700">{lead}</div>}

      {sections.length > 3 && (
        <nav aria-label="Contenido" className="card mt-6 p-5 text-sm">
          <p className="mb-2 font-semibold text-ink-900">Contenido</p>
          <ol className="grid gap-1 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-pine-700 hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <article className="mt-8 space-y-8 text-ink-700">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold text-ink-900">
              {i + 1}. {s.title}
            </h2>
            {s.body}
          </section>
        ))}
      </article>

      {children}

      <aside className="mt-12 border-t border-ink-100 pt-6 text-sm">
        {related.length > 0 && (
          <>
            <p className="font-semibold text-ink-900">Documentos relacionados</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {related.map((r) => {
                const item = legalDoc(r);
                return (
                  <li key={r}>
                    <Link href={item.href} className="text-pine-700 hover:underline">
                      {item.short}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className={cn('text-ink-500', related.length > 0 && 'mt-4')}>
          ¿Dudas o reclamos sobre este documento? Escríbenos por el{' '}
          <Link href="/reclamos" className="text-pine-700 underline">
            canal de reclamos y solicitudes
          </Link>
          . Todos los textos están en el{' '}
          <Link href="/legal" className="text-pine-700 underline">
            Centro legal
          </Link>
          .
        </p>
      </aside>
    </div>
  );
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('mt-2', className)}>{children}</p>;
}

export function Ul({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn('mt-2 list-disc space-y-1 pl-5', className)}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Callout({
  title,
  tone = 'pine',
  children,
}: {
  title?: string;
  tone?: 'pine' | 'gold' | 'red';
  children: React.ReactNode;
}) {
  const tones = {
    pine: 'border-pine-200 bg-pine-50 text-pine-900',
    gold: 'border-gold-200 bg-gold-50 text-gold-900',
    red: 'border-red-200 bg-red-50 text-red-800',
  };
  return (
    <div className={cn('mt-3 rounded-lg border px-4 py-3 text-sm', tones[tone])}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

/** Enlace a otro documento legal por su clave del registro. */
export function DocLink({ to, children }: { to: LegalDocSlug; children?: React.ReactNode }) {
  const doc = legalDoc(to);
  return (
    <Link href={doc.href} className="text-pine-700 underline">
      {children ?? doc.short}
    </Link>
  );
}

/**
 * Tabla simple de dos a cuatro columnas (matrices de retención, cookies,
 * casos). En pantallas angostas cada fila se apila como una ficha, con el
 * nombre de la columna delante de cada dato, para leerla sin desplazarse.
 */
export function LegalTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-3 rounded-lg border border-ink-100">
      <table className="w-full text-left text-sm max-sm:block">
        <thead className="bg-ink-50 text-ink-900 max-sm:sr-only">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 max-sm:block">
          {rows.map((row, i) => (
            <tr key={i} className="align-top max-sm:block max-sm:px-4 max-sm:py-3">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn('px-4 py-2 max-sm:block max-sm:px-0 max-sm:py-0.5', j === 0 && 'font-medium text-ink-900')}
                >
                  {j > 0 && (
                    <span aria-hidden className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-500 sm:hidden">
                      {head[j]}:
                    </span>
                  )}
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
