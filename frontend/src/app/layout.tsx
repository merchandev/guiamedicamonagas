import './globals.css';
import type { Metadata } from 'next';
import { Montserrat, Open_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { TopBar } from '@/components/layout/TopBar';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import CookieConsent from '@/components/CookieConsent';
import { LegalAcceptanceGate } from '@/components/LegalAcceptanceGate';
import { ORGANIZATIONS_LAUNCHED } from '@/lib/features';
import { SITE_NAME } from '@/lib/seo';

// Solo dos familias en todo el sitio: Montserrat para títulos (h1–h4 y el
// logo) y Open Sans para el texto, los botones y los formularios.
const display = Montserrat({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700'] });
const sans = Open_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Guía Médica Monagas — Directorio médico verificado',
    template: '%s — Guía Médica Monagas',
  },
  description: `Encuentra ${
    ORGANIZATIONS_LAUNCHED ? 'médicos, especialistas, farmacias y clínicas verificadas' : 'médicos y especialistas verificados'
  } en el estado Monagas. Cada profesional pasa por un proceso de verificación legal y gremial.`,
  // Tarjeta al compartir (WhatsApp, Facebook, X): la imagen sale de
  // app/opengraph-image.tsx; la ficha de cada médico define la suya.
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'es_VE' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <AuthProvider>
          {/* La app móvil abre los textos legales dentro de la app y marca la página
              (html[data-embed="app"]): sin encabezado, pie ni aviso de cookies. */}
          <div data-site-chrome className="contents">
            <TopBar />
            <Header />
          </div>
          <main className="flex-1">{children}</main>
          <div data-site-chrome className="contents">
            <Footer />
            <CookieConsent />
          </div>
          <LegalAcceptanceGate />
        </AuthProvider>
      </body>
    </html>
  );
}
