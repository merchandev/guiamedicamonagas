import { BadRequestException } from '@nestjs/common';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);
// /embed/ID, /shorts/ID, /live/ID y el viejo /v/ID llevan el ID en el segundo tramo.
const ID_IN_PATH = new Set(['embed', 'shorts', 'live', 'v']);

/**
 * ID del video a partir de lo que se pegue: enlaces de watch, youtu.be,
 * shorts, embed o live, o el ID solo. Devuelve null si no es YouTube: jamás
 * se guarda ni se incrusta una URL libre.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (VIDEO_ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const [, first = '', second = ''] = url.pathname.split('/');
  let candidate: string | null = null;
  if (SHORT_HOSTS.has(host)) candidate = first;
  else if (YOUTUBE_HOSTS.has(host)) {
    if (first === 'watch' && !second) candidate = url.searchParams.get('v');
    else if (ID_IN_PATH.has(first)) candidate = second;
  }
  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

/** Vacío o null borra el video; cualquier otra cosa tiene que ser un enlace de YouTube. */
export function resolvePresentationVideo(input: string | null | undefined): string | null {
  if (input == null || !input.trim()) return null;
  const videoId = parseYouTubeVideoId(input);
  if (!videoId) {
    throw new BadRequestException('Pega el enlace del video en YouTube, por ejemplo https://youtu.be/… o https://www.youtube.com/watch?v=…');
  }
  return videoId;
}
