'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { brandQrSvg, downloadQrPng, svgDataUrl } from '@/lib/qr';

/**
 * Código y QR del médico para compartir su ficha (consultorio, tarjetas,
 * WhatsApp). El QR abre /m/<código>, que lleva siempre a la ficha actual; el
 * paciente también puede escribir el código en el buscador del directorio.
 */
export function DoctorShareCodeCard({ code, isPublished, fullName }: { code: string; isPublished: boolean; fullName: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const url = `${siteUrl}/m/${code}`;
  const qrSvg = useMemo(() => brandQrSvg(url), [url]);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${fullName} en Guía Médica Monagas: ${url}`)}`;

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch {
      setMessage('No se pudo copiar; selecciónalo y cópialo manualmente.');
    }
  };

  return (
    <section aria-labelledby="mi-codigo" className="card grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={svgDataUrl(qrSvg)}
        alt={`Código QR de tu ficha (${code})`}
        className="mx-auto h-40 w-40 rounded-lg border border-ink-200 bg-white p-1"
      />
      <div className="space-y-3">
        <div>
          <h2 id="mi-codigo" className="text-lg font-semibold text-ink-900">
            Tu código y QR para compartir
          </h2>
          <p className="mt-1 select-all font-mono text-2xl font-semibold tracking-[0.15em] text-ink-950">{code}</p>
          <p className="mt-1 text-sm text-ink-600">
            Tus pacientes pueden escanear el QR o escribir este código en el buscador para abrir tu ficha. No muestra tu
            cédula, RIF ni correo.
          </p>
          {!isPublished && (
            <p className="mt-1 text-sm text-gold-800">Funcionará en cuanto tu perfil esté publicado en el directorio.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copy(code, 'Código copiado.')}>
            Copiar código
          </Button>
          <Button variant="outline" size="sm" onClick={() => copy(url, 'Enlace copiado.')}>
            Copiar enlace
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadQrPng(qrSvg, `qr-${code}.png`).catch(() => setMessage('No se pudo descargar el QR'))}>
            Descargar QR
          </Button>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-lg bg-pine-700 px-3 text-xs font-medium text-white hover:bg-pine-800"
          >
            Compartir por WhatsApp
          </a>
        </div>
        {message && (
          <p role="status" className="text-sm text-pine-700">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
