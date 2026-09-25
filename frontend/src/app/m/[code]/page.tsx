import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { serverGet } from '@/lib/server-fetch';

// Enlace corto del QR y del código del médico («GM-XXXXXX»): lleva a su ficha
// pública. Es estable aunque cambie el slug (p. ej. al corregir el nombre).
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function DoctorCodeRedirect({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await serverGet<{ slug: string }>(`/professionals/by-code/${encodeURIComponent(code)}`, 300);
  if (!result?.slug) notFound();
  redirect(`/medicos/${result.slug}`);
}
