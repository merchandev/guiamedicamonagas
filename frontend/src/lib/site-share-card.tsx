import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';
import { SHARE_CARD_SIZE } from '@/lib/doctor-share-card';

export { SHARE_CARD_SIZE };

/**
 * Tarjeta 1200×630 del sitio para cuando se comparte una página que no es la
 * ficha de un médico (WhatsApp, Telegram, Facebook, X). Mismo estilo que la
 * del médico y todo centrado, para que el recorte cuadrado de WhatsApp
 * conserve el nombre.
 */
export function renderSiteShareCard(subtitle = 'Directorio médico verificado del estado Monagas') {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #0f6e5c 0%, #0f4234 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: 40,
            background: '#ffffff',
            color: '#0f6e5c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 84,
            fontWeight: 700,
          }}
        >
          GM
        </div>
        <div style={{ display: 'flex', marginTop: 36, fontSize: 64, fontWeight: 700 }}>{SITE_NAME}</div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: 34, color: '#afe8cf' }}>{subtitle}</div>
        <div style={{ display: 'flex', marginTop: 40, fontSize: 26, color: '#d6f4e6' }}>guiamedicamonagas.com</div>
      </div>
    ),
    SHARE_CARD_SIZE,
  );
}
