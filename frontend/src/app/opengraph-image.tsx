import { SITE_NAME } from '@/lib/seo';
import { renderSiteShareCard, SHARE_CARD_SIZE } from '@/lib/site-share-card';

// Imagen al compartir cualquier página del sitio (og:image y twitter:image).
// La ficha de cada médico tiene la suya, con su foto y su especialidad.
export const alt = `${SITE_NAME} — Directorio médico verificado`;
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderSiteShareCard();
}
