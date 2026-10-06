import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/dates';
import { PRESCRIPTION_STATUS, type PrescriptionView } from '@/lib/prescriptions';

const longDate = (value: string) => formatDate(value, { dateStyle: 'long' });

/**
 * El récipe en pantalla, con las mismas dos partes que el PDF: el cuerpo para
 * la farmacia y las indicaciones para el paciente.
 */
export function PrescriptionPaper({ view }: { view: PrescriptionView }) {
  const { prescriber, establishment, patient, items, place } = view.content;
  const status = PRESCRIPTION_STATUS[view.status];
  return (
    <article aria-label={`Récipe N° ${view.numberLabel}`} className="card overflow-hidden">
      <header className="space-y-0.5 border-b-2 border-pine-700 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-lg font-semibold text-ink-900">Dr(a). {prescriber.fullName}</p>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {prescriber.specialties.length > 0 && <p className="text-sm text-ink-600">{prescriber.specialties.join(' · ')}</p>}
        <p className="text-xs text-ink-600">
          C.I. {prescriber.cedula} · M.P.P.S. N° {prescriber.mppsNumber}
          {prescriber.colegioNumber ? ` · C.M. N° ${prescriber.colegioNumber}` : ''}
        </p>
        <p className="text-xs text-ink-500">
          {establishment.name} · {establishment.address} · RIF {establishment.rif}
          {establishment.phone ? ` · Tel. ${establishment.phone}` : ''}
        </p>
      </header>

      <div className="space-y-1 border-b border-ink-100 px-5 py-4 text-sm text-ink-800">
        <p>
          <span className="font-semibold">Paciente:</span> {patient.fullName}
        </p>
        <p>
          {patient.cedula ? `C.I. ${patient.cedula}` : 'Sin cédula'} · Año de nacimiento: {patient.birthYear}
        </p>
        {patient.guardian && (
          <p>
            Representante: {patient.guardian.fullName} (C.I. {patient.guardian.cedula})
          </p>
        )}
        <p className="text-ink-600">
          {place}, {longDate(view.issuedAt)} · Vence el {longDate(view.expiresAt)}
        </p>
      </div>

      <div className="grid md:grid-cols-2 md:divide-x md:divide-dashed md:divide-ink-200">
        <section aria-label="Récipe (para la farmacia)" className="space-y-3 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold tracking-[0.2em] text-pine-800">RÉCIPE</h2>
            <span className="text-sm font-semibold text-ink-800">N° {view.numberLabel}</span>
          </div>
          <ol className="space-y-3 text-sm text-ink-800">
            {items.map((item, index) => (
              <li key={index}>
                <p className="font-semibold text-ink-900">
                  {index + 1}. {item.activeIngredient} {item.concentration}
                  {item.nonSubstitutable && <span className="ml-1 text-xs font-bold text-red-700">INSUSTITUIBLE</span>}
                </p>
                <p className="pl-4">
                  {item.pharmaceuticalForm}, vía {item.route}
                  {item.brandNames ? ` (${item.brandNames})` : ''}
                </p>
                <p className="pl-4">
                  Dosis: {item.dose}. Duración: {item.duration}.{item.quantity ? ` Cantidad: ${item.quantity}.` : ''}
                </p>
              </li>
            ))}
          </ol>
          {view.content.pharmacistNotes && (
            <p className="whitespace-pre-wrap text-sm text-ink-800">
              <span className="font-semibold">Advertencias al farmacéutico:</span> {view.content.pharmacistNotes}
            </p>
          )}
        </section>

        <section aria-label="Indicaciones al paciente" className="space-y-3 border-t border-dashed border-ink-200 p-5 md:border-t-0">
          <h2 className="text-sm font-bold tracking-[0.2em] text-pine-800">INDICACIONES</h2>
          <ol className="space-y-2 text-sm text-ink-800">
            {items.map((item, index) => (
              <li key={index}>
                <span className="font-semibold text-ink-900">
                  {index + 1}. {item.activeIngredient} {item.concentration}
                </span>{' '}
                ({item.pharmaceuticalForm}, vía {item.route}): {item.dose}. Duración: {item.duration}.
                {item.instructions ? ` ${item.instructions}` : ''}
              </li>
            ))}
          </ol>
          {view.content.patientInstructions && (
            <p className="whitespace-pre-wrap text-sm text-ink-800">
              <span className="font-semibold">Indicaciones generales:</span> {view.content.patientInstructions}
            </p>
          )}
        </section>
      </div>

      <footer className="border-t border-ink-100 bg-ink-50 px-5 py-3 text-xs text-ink-600">
        Código de verificación <span className="font-mono font-semibold tracking-wider text-ink-800">{view.code}</span> · Huella{' '}
        <span className="font-mono">{view.fingerprint}</span>
        {view.annulledAt ? ` · Anulado el ${longDate(view.annulledAt)}` : ''}
      </footer>
    </article>
  );
}
