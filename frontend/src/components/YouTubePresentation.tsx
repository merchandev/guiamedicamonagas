'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Video de presentación del médico (plan Marca Médica). Hasta que alguien pulsa
 * «Reproducir» solo se carga la miniatura: YouTube no instala nada ni recibe
 * datos de quien solo mira la ficha. El reproductor es el de
 * youtube-nocookie.com (modo de privacidad mejorada).
 */
export function YouTubePresentation({ videoId, title, className }: { videoId: string; title: string; className?: string }) {
  const [playing, setPlaying] = useState(false);
  // La API ya valida el ID; esto evita armar un iframe con cualquier otra cosa.
  if (!VIDEO_ID.test(videoId)) return null;

  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-xl bg-ink-900 shadow-card', className)}>
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-gold-300"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" aria-hidden="true" />
          <span
            className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-pine-800 shadow-lg transition-transform group-hover:scale-105"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
          </span>
          <span className="absolute bottom-3 left-4 right-4 text-left text-sm font-semibold text-white drop-shadow">
            Reproducir: {title}
          </span>
        </button>
      )}
    </div>
  );
}
