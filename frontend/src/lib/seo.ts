/**
 * SEO automático de la ficha del médico, a partir de lo que él mismo cargó.
 * Lo usan la página pública (metadata) y la vista previa de su panel, para que
 * el médico vea exactamente lo que mostrará Google.
 *
 *   Título:      «Nombre Apellido - Especialidad | Guía Médica Monagas»
 *   Descripción: «Nombre Apellido, Especialidad en Municipio. <resumen o
 *                 biografía recortado…> Agenda cita.»
 *
 * Largos según lo que Google muestra sin cortar: ~60 caracteres de título y
 * ~155 de descripción. Si no cabe, se recorta por palabras con «…».
 */
export const SITE_NAME = 'Guía Médica Monagas';
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
/** Llamada a la acción al final de la descripción (solo si recibe citas en línea). */
export const BOOKING_CTA = 'Agenda cita.';
const CONTACT_CTA = 'Ver perfil y contacto.';
const GENERAL_MEDICINE = 'Medicina General';

export interface DoctorSeoInput {
  firstName: string;
  lastName: string;
  /** En el orden del perfil; «Medicina General» cede ante una especialidad. */
  specialties: string[];
  municipality?: string | null;
  /** «Resumen corto (extracto)» escrito por el médico. */
  summary?: string | null;
  /** Biografía profesional, solo si su plan la muestra en público. */
  bio?: string | null;
  bookingEnabled?: boolean;
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

// Un recorte nunca termina en un conector («Ginecología y…»).
const TRAILING_CONNECTOR = /\s+(y|e|o|u|de|del|la|las|los|el|en|con|para|por|a|al)$/i;

/** Recorta por palabras sin pasar de `max` caracteres (incluido el «…»). */
export function truncateWords(text: string, max: number): string {
  const value = clean(text);
  if (value.length <= max) return value;
  const cut = value.slice(0, Math.max(0, max - 1));
  const lastSpace = cut.lastIndexOf(' ');
  let base = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, '');
  while (TRAILING_CONNECTOR.test(base)) base = base.replace(TRAILING_CONNECTOR, '');
  return `${base}…`;
}

export function doctorName(input: Pick<DoctorSeoInput, 'firstName' | 'lastName'>) {
  return clean(`${input.firstName} ${input.lastName}`);
}

/** Primer nombre y primer apellido: «María de los Ángeles Velásquez de Guevara» → «María Velásquez». */
export function shortDoctorName(input: Pick<DoctorSeoInput, 'firstName' | 'lastName'>) {
  const first = clean(input.firstName).split(' ')[0] ?? '';
  const last = clean(input.lastName).split(' ').find((word) => !/^(de|del|la|las|los|y)$/i.test(word)) ?? '';
  return clean(`${first} ${last}`);
}

export function primarySpecialty(specialties: string[]): string | null {
  return specialties.find((s) => s !== GENERAL_MEDICINE) ?? specialties[0] ?? null;
}

export function doctorSeoTitle(input: DoctorSeoInput): string {
  const specialty = primarySpecialty(input.specialties);
  const suffix = ` | ${SITE_NAME}`;
  // Con el nombre completo si cabe; si no, primer nombre y primer apellido.
  for (const name of [doctorName(input), shortDoctorName(input)]) {
    const title = specialty ? `${name} - ${specialty}${suffix}` : `${name}${suffix}`;
    if (title.length <= TITLE_MAX) return title;
  }
  const name = shortDoctorName(input);
  if (!specialty) return `${name}${suffix}`;
  // Luego se recorta la especialidad; el nombre y la plataforma se conservan.
  const room = TITLE_MAX - suffix.length - name.length - 3;
  if (room >= 8) return `${name} - ${truncateWords(specialty, room)}${suffix}`;
  return `${name} - ${specialty}${suffix}`;
}

export function doctorSeoDescription(input: DoctorSeoInput): string {
  const name = doctorName(input);
  const specialty = primarySpecialty(input.specialties) ?? 'Médico';
  const place = input.municipality ? `${input.municipality}, Monagas` : 'Monagas';
  const lead = `${name}, ${specialty} en ${place}.`;
  const cta = input.bookingEnabled ? BOOKING_CTA : CONTACT_CTA;
  const source = clean(input.summary || input.bio || '');
  const room = DESCRIPTION_MAX - lead.length - cta.length - 2;
  const excerpt = source && room >= 25 ? truncateWords(source, room) : '';
  const middle = excerpt ? ` ${/[.!?…]$/.test(excerpt) ? excerpt : `${excerpt}.`}` : '';
  return truncateWords(`${lead}${middle} ${cta}`, DESCRIPTION_MAX + cta.length);
}
