import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { TopBar } from '@/components/layout/TopBar';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import CookieConsent from '@/components/CookieConsent';
import { LegalAcceptanceGate } from '@/components/LegalAcceptanceGate';
import { ORGANIZATIONS_LAUNCHED } from '@/lib/features';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600'] });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Guía Médica Monagas — Directorio médico verificado',
    template: '%s — Guía Médica Monagas',
  },
  description: `Encuentra ${
    ORGANIZATIONS_LAUNCHED ? 'médicos, especialistas, farmacias y clínicas verificadas' : 'médicos y especialistas verificados'
  } en el estado Monagas. Cada profesional pasa por un proceso de verificación legal y gremial.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <AuthProvider>
          <TopBar />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <CookieConsent />
          <LegalAcceptanceGate />
        </AuthProvider>
      </body>
    </html>
  );
}
