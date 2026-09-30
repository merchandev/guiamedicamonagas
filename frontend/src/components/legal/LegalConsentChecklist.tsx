'use client';

import { ACCEPTANCE_DOCUMENTS, ACCEPTANCE_ORDER, legalDoc, type LegalDocumentKey } from '@/lib/legal';

/**
 * Una casilla por cada texto que la cuenta debe aceptar, con su declaración y
 * los enlaces a los documentos completos. Las aceptaciones son separadas a
 * propósito: el servidor registra cada documento con su versión.
 */
export function LegalConsentChecklist({
  documents,
  checked,
  onChange,
  idPrefix = 'legal',
}: {
  documents: LegalDocumentKey[];
  checked: LegalDocumentKey[];
  onChange: (next: LegalDocumentKey[]) => void;
  idPrefix?: string;
}) {
  const ordered = ACCEPTANCE_ORDER.filter((key) => documents.includes(key));
  const toggle = (key: LegalDocumentKey) =>
    onChange(checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key]);

  return (
    <fieldset className="space-y-3">
      <legend className="field-label">Para continuar, marca cada casilla</legend>
      {ordered.map((key) => {
        const item = ACCEPTANCE_DOCUMENTS[key];
        const id = `${idPrefix}-${key}`;
        return (
          <div key={key} className="flex items-start gap-3 rounded-lg border border-ink-100 p-3">
            <input
              id={id}
              type="checkbox"
              checked={checked.includes(key)}
              onChange={() => toggle(key)}
              aria-describedby={`${id}-docs`}
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-ink-300 text-pine-700 focus:ring-pine-600"
            />
            <div className="text-sm">
              <label htmlFor={id} className="cursor-pointer text-ink-800">
                {item.statement}
              </label>
              <p id={`${id}-docs`} className="mt-1 text-xs text-ink-500">
                Leer:{' '}
                {item.docs.map((slug, i) => {
                  const doc = legalDoc(slug);
                  return (
                    <span key={slug}>
                      {i > 0 && ' · '}
                      <a href={doc.href} target="_blank" rel="noopener" className="font-medium text-pine-700 underline">
                        {doc.short} (v{doc.version})
                      </a>
                    </span>
                  );
                })}
              </p>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

/** true si todas las casillas requeridas están marcadas. */
export function allAccepted(documents: LegalDocumentKey[], checked: LegalDocumentKey[]) {
  return documents.every((key) => checked.includes(key));
}
