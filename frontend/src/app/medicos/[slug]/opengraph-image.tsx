import { serverGet } from '@/lib/server-fetch';
import { ProfessionalDetail } from '@/lib/types';
import { doctorName, primarySpecialty, SITE_NAME } from '@/lib/seo';
import { renderDoctorShareCard, SHARE_CARD_SIZE } from '@/lib/doctor-share-card';

// Imagen que acompaña la ficha al compartirla (og:image y twitter:image).
// URL estable (no la foto firmada, que vence en una hora) y cacheada una hora.
export const alt = `Ficha del médico en ${SITE_NAME}`;
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';
export const revalidate = 3600;

const API_URL =
  process.env.API_INTERNAL_URL ||
  (process.env.NEXT_PUBLIC_API_URL && /^https?:\/\//.test(process.env.NEXT_PUBLIC_API_URL)
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:4000/api/v1');

/** Foto JPEG cuadrada que la API entrega solo si el plan del médico muestra su foto. */
async function sharePhoto(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/professionals/${encodeURIComponent(slug)}/share-photo`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return `data:image/jpeg;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doctor = await serverGet<ProfessionalDetail>(`/professionals/${slug}`, 3600);
  if (!doctor) {
    return renderDoctorShareCard({
      name: SITE_NAME,
      specialty: 'Directorio médico verificado',
      place: 'Monagas',
      verified: true,
      photo: null,
      initials: 'GM',
    });
  }
  return renderDoctorShareCard({
    name: doctorName(doctor),
    specialty: primarySpecialty(doctor.specialties.map((s) => s.specialty.name)) ?? 'Medicina General',
    place: doctor.municipality ? `${doctor.municipality}, Monagas` : 'Monagas',
    code: doctor.publicCode,
    verified: doctor.verificationStatus === 'VERIFIED',
    photo: await sharePhoto(slug),
    initials: `${doctor.firstName[0] ?? ''}${doctor.lastName[0] ?? ''}`.toUpperCase(),
  });
}
