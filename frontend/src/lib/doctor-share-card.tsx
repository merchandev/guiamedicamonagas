import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';

/**
 * Tarjeta 1200×630 para compartir la ficha de un médico (WhatsApp, Telegram,
 * Facebook, X). Todo va centrado: cuando WhatsApp la muestra como miniatura
 * cuadrada, el recorte central conserva la foto, el nombre y la especialidad.
 */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

export interface ShareCardData {
  name: string;
  specialty: string;
  place: string;
  code?: string | null;
  verified: boolean;
  /** data:image/jpeg;base64,… o null para mostrar las iniciales. */
  photo: string | null;
  initials: string;
}

export function renderDoctorShareCard(data: ShareCardData) {
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
          position: 'relative',
        }}
      >
        {data.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.photo}
            width={220}
            height={220}
            alt=""
            style={{ borderRadius: 9999, border: '8px solid rgba(255,255,255,0.9)', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: 9999,
              border: '8px solid rgba(255,255,255,0.9)',
              background: '#d6f4e6',
              color: '#12503f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 88,
              fontWeight: 700,
            }}
          >
            {data.initials}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 28, fontSize: 52, fontWeight: 700 }}>
          {data.name}
        </div>
        <div style={{ display: 'flex', marginTop: 8, fontSize: 32, color: '#afe8cf' }}>
          {data.specialty} · {data.place}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 22, fontSize: 24, color: '#d6f4e6' }}>
          {/* Ícono dibujado: la fuente de la imagen no trae el carácter «✓». */}
          {data.verified && (
            <svg width="26" height="26" viewBox="0 0 24 24" style={{ marginRight: 10 }}>
              <circle cx="12" cy="12" r="11" fill="#afe8cf" />
              <path d="M7 12.5l3.2 3.2L17 9" stroke="#0f4234" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {data.verified ? 'Médico verificado' : 'Verificación en curso'}
          {data.code ? `  ·  Código ${data.code}` : ''}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            display: 'flex',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 1,
            color: '#ffffff',
            opacity: 0.9,
          }}
        >
          {SITE_NAME} · guiamedicamonagas.com
        </div>
      </div>
    ),
    { ...SHARE_CARD_SIZE },
  );
}
