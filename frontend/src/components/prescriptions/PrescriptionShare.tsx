'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { ApiError, saveBlob } from '@/lib/api';
import { brandQrSvg, svgDataUrl } from '@/lib/qr';
import { SITE_DOMAIN } from '@/lib/legal';
import {
  prescriptionFileName,
  prescriptionShareText,
  whatsappShareLink,
  type PrescriptionView,
} from '@/lib/prescriptions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const noSubscription = () => () => undefined;

/** Si el navegador puede pasar un PDF a otra app (WhatsApp, correo…) con el menú de compartir del teléfono. */
function canShareFiles(): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'recipe.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/**
 * Código y QR del récipe, descarga del PDF y formas de compartirlo. El enlace
 * lleva el código después de «#»: no llega a ningún servidor ni a la vista
 * previa que arma WhatsApp.
 */
export function PrescriptionShare({
  view,
  downloadPdf,
  askPhone = false,
}: {
  view: PrescriptionView;
  downloadPdf: () => Promise<Blob>;
  /** El médico puede escribir el WhatsApp del paciente para abrir ese chat. */
  askPhone?: boolean;
}) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const shareFiles = useSyncExternalStore(noSubscription, canShareFiles, () => false);
  const qrSvg = useMemo(() => brandQrSvg(view.verifyUrl), [view.verifyUrl]);
  const usable = view.status === 'VALID';
  const fileName = prescriptionFileName(view.numberLabel);
  const text = prescriptionShareText(view);

  const run = async (kind: 'download' | 'share', action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof ApiError ? e.message : 'No se pudo preparar el PDF. Intenta de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    run('download', async () => {
      saveBlob(await downloadPdf(), fileName);
      setMessage(usable ? 'Se descargó el PDF. Imprime las dos páginas: el original queda en la farmacia y la copia vuelve sellada.' : 'Se descargó el PDF.');
    });

  const sharePdf = () =>
    run('share', async () => {
      const file = new File([await downloadPdf()], fileName, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: `Récipe N° ${view.numberLabel}`, text });
    });

  const copy = async (value: string, done: string) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setMessage(done);
    } catch {
      setMessage('No se pudo copiar; selecciónalo y cópialo manualmente.');
    }
  };

  return (
    <section aria-labelledby="compartir-recipe" className="card space-y-4 p-5">
      <h2 id="compartir-recipe" className="text-lg font-semibold text-ink-900">
        {usable ? 'Descargar y compartir' : 'Descargar'}
      </h2>
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={svgDataUrl(qrSvg)}
          alt={`Código QR del récipe ${view.code}`}
          className="mx-auto h-36 w-36 rounded-lg border border-ink-200 bg-white p-1"
        />
        <div className="space-y-3">
          <div>
            <p className="text-sm text-ink-600">Código de verificación</p>
            <p className="select-all font-mono text-xl font-semibold tracking-[0.15em] text-ink-950">{view.code}</p>
            <p className="mt-1 text-xs text-ink-600">
              Con este código o el QR, el paciente y la farmacia ven el récipe y lo descargan en {SITE_DOMAIN}/recipe.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={download} loading={busy === 'download'}>
              Descargar PDF
            </Button>
            {usable && shareFiles && (
              <Button size="sm" variant="outline" onClick={sharePdf} loading={busy === 'share'}>
                Compartir PDF
              </Button>
            )}
            {usable && (
              <>
                <Button size="sm" variant="outline" onClick={() => void copy(view.verifyUrl, 'Enlace copiado.')}>
                  Copiar enlace
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copy(view.code, 'Código copiado.')}>
                  Copiar código
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {usable && (
        <div className="flex flex-wrap items-end gap-2 border-t border-ink-100 pt-4">
          {askPhone && (
            <div className="w-full sm:w-64">
              <Input
                label="WhatsApp del paciente (opcional)"
                inputMode="tel"
                placeholder="0414-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                hint="Sin número, eliges el contacto en WhatsApp."
              />
            </div>
          )}
          <a
            href={whatsappShareLink(text, phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-lg bg-pine-700 px-4 text-sm font-medium text-white hover:bg-pine-800"
          >
            Enviar por WhatsApp
          </a>
        </div>
      )}

      {message && (
        <p role="status" className="text-sm text-pine-700">
          {message}
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
