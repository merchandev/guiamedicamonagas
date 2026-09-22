import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Guía Médica Monagas',
  description: 'Encuentra a los mejores médicos y especialistas en Monagas.',
};

import CookieConsent from '@/components/CookieConsent';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <nav className="p-4 bg-blue-600 text-white">
          <h1 className="text-xl font-bold">Guía Médica Monagas</h1>
        </nav>
        <main className="p-4">
          {children}
        </main>
        <CookieConsent />
      </body>
    </html>
  );
}
