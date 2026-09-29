const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);
const ID_IN_PATH = new Set(['embed', 'shorts', 'live', 'v']);

/**
 * Misma regla que la API (backend/src/professionals/presentation-video.ts),
 * solo para la vista previa: quien decide es el servidor.
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

export const youTubeShortUrl = (videoId: string) => `https://youtu.be/${videoId}`;
