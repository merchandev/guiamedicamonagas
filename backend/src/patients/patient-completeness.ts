import type { PatientProfile } from '@prisma/client';

export interface CompletenessItem {
  key: 'name' | 'cedula' | 'phone' | 'municipality' | 'photo' | 'idPhoto' | 'email';
  label: string;
  done: boolean;
}

export interface PatientCompleteness {
  percent: number;
  items: CompletenessItem[];
}

type CompletenessSource = Pick<
  PatientProfile,
  'firstName' | 'lastName' | 'cedulaEnc' | 'phoneEnc' | 'municipality' | 'photoKey' | 'idPhotoKey'
>;

/**
 * «Registro al 100 %»: identidad y contacto, nunca datos de salud. Nombre y
 * apellido, cédula, teléfono, municipio, foto de perfil, foto de la cédula y el
 * correo verificado. La aprobación de la cédula se exige aparte (identityStatus).
 * Se mira si el dato existe, sin descifrarlo.
 */
export function patientCompleteness(profile: CompletenessSource | null, emailVerified: boolean): PatientCompleteness {
  const items: CompletenessItem[] = [
    { key: 'name', label: 'Nombre y apellido', done: !!(profile?.firstName?.trim() && profile?.lastName?.trim()) },
    { key: 'cedula', label: 'Cédula', done: !!profile?.cedulaEnc },
    { key: 'phone', label: 'Teléfono', done: !!profile?.phoneEnc },
    { key: 'municipality', label: 'Municipio', done: !!profile?.municipality },
    { key: 'photo', label: 'Foto de perfil', done: !!profile?.photoKey },
    { key: 'idPhoto', label: 'Foto de tu cédula', done: !!profile?.idPhotoKey },
    { key: 'email', label: 'Correo verificado', done: emailVerified },
  ];
  const done = items.filter((item) => item.done).length;
  return { percent: Math.round((done * 100) / items.length), items };
}
