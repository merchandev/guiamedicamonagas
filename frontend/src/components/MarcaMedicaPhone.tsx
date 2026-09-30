'use client';

import { useState } from 'react';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Teléfono de la sección Marca Médica en /planes. Con un video de muestra
 * cargado por la administración, lo reproduce al pulsar (youtube-nocookie;
 * antes de pulsar no se pide nada a YouTube, ni siquiera la miniatura). Sin
 * video, muestra una ilustración señalada como tal.
 */
export function MarcaMedicaPhone({ videoId }: { videoId: string | null }) {
  const [playing, setPlaying] = useState(false);
  const sample = videoId && VIDEO_ID.test(videoId) ? videoId : null;

  return (
    <figure className="mx-auto w-full max-w-[270px]">
      <div className="relative aspect-[9/18.5] rounded-[2.6rem] bg-ink-950 p-2.5 shadow-2xl ring-1 ring-white/15">
        <div className="absolute left-1/2 top-4 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-ink-950" aria-hidden="true" />
        <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-gradient-to-b from-pine-600 via-pine-800 to-ink-950">
          {sample && playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${sample}?autoplay=1&playsinline=1&rel=0`}
              title="Ejemplo de video producido para el plan Marca Médica"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <ReelMock />
          )}
          {sample && !playing && (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-gold-300"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-pine-800 shadow-lg transition-transform group-hover:scale-105" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              </span>
              <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-semibold text-white">Ver el ejemplo real</span>
            </button>
          )}
        </div>
      </div>
      <figcaption className="mt-4 text-center text-xs leading-relaxed text-pine-100">
        {sample ? (
          <>
            <span className="block text-sm font-semibold text-white">Mira lo que podemos producir para tu perfil</span>
            Video de ejemplo producido por Guía Médica Monagas: guion, grabación, edición, subtítulos y difusión. Se carga
            desde YouTube al pulsar.
          </>
        ) : (
          <>Ilustración: así se ve un video vertical con tu nombre, subtítulos y la colaboración con Guía Médica Monagas.</>
        )}
      </figcaption>
    </figure>
  );
}

/** Maqueta de un video vertical (no es un video real ni una persona real). */
function ReelMock() {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-4 pt-10 text-white" aria-hidden="true">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-white/80">
        <span>Reels</span>
        <span className="rounded-full bg-white/15 px-2 py-0.5">Colaboración</span>
      </div>
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold ring-2 ring-white/30">
        TU
      </div>
      <div className="space-y-2">
        <p className="rounded-md bg-black/35 px-2 py-1 text-center text-[11px] font-semibold leading-snug">
          «¿Cada cuánto debo hacerme un chequeo?»
        </p>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-400 text-[10px] font-bold text-ink-950">TU</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold">Tu nombre · Tu especialidad</p>
            <p className="truncate text-[10px] text-white/70">con Guía Médica Monagas</p>
          </div>
        </div>
        <div className="space-y-1">
          <span className="block h-1.5 w-full rounded-full bg-white/25" />
          <span className="block h-1.5 w-2/3 rounded-full bg-white/20" />
        </div>
      </div>
    </div>
  );
}
