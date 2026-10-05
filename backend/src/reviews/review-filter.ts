/**
 * Filtro automático de los textos de valoraciones y respuestas. No publica ni
 * rechaza nada por sí solo: todo texto pasa por moderación previa y estas
 * marcas le dicen a quien modera qué mirar primero. Una valoración sin
 * comentario no tiene nada que filtrar y se publica al enviarla.
 */
export type ReviewFlag = 'PHONE' | 'EMAIL' | 'LINK' | 'ID_NUMBER' | 'INSULT' | 'HEALTH';

export const REVIEW_FLAG_LABELS: Record<ReviewFlag, string> = {
  PHONE: 'teléfono',
  EMAIL: 'correo',
  LINK: 'enlace',
  ID_NUMBER: 'cédula',
  INSULT: 'insulto o acusación',
  HEALTH: 'datos de salud',
};

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|net|org|ve|info|io|co|me|app|link|ly|gob)(?:\/\S*)?\b/i;
/** Siete o más dígitos, con o sin espacios, puntos, guiones o paréntesis entre ellos. */
const PHONE = /\d(?:[\s.\-()]*\d){6,}/;
/** «V-12.345.678», «E 1234567», o «cédula» seguida de un número. */
const ID_NUMBER = /\b[vejpg][\s.-]*\d{1,2}[\s.]?\d{3}[\s.]?\d{3}\b|cedula\D{0,15}\d{5,}/;

// Sin tildes y en minúsculas; un «*» final acepta cualquier terminación.
const INSULTS = [
  'idiota*', 'imbecil*', 'estupid*', 'pendej*', 'mierda', 'cono', 'marico*', 'marica', 'mamaguev*', 'mamahuev*',
  'maldit*', 'basura', 'porqueria', 'hijo de puta', 'hdp', 'puta', 'puto', 'carajo', 'bruto', 'bruta', 'inutil*',
  // Acusaciones graves: riesgo de difamación si no se pueden sostener.
  'ladron*', 'estafador*', 'estafa', 'asesin*', 'charlatan*', 'matasanos', 'corrupt*', 'delincuente*',
];
const HEALTH_TERMS = [
  'diagnostic*', 'cancer*', 'tumor*', 'vih', 'sida', 'embaraz*', 'aborto', 'depresion', 'ansiedad', 'bipolar',
  'esquizofreni*', 'psiquiatr*', 'psicolog*', 'diabet*', 'hipertens*', 'quimio*', 'cirugia*', 'operacion*', 'operaron',
  'biopsia*', 'enfermedad*', 'infeccion*', 'hepatitis', 'tuberculosis', 'covid', 'epilep*', 'autism*', 'alzheimer',
  'parkinson', 'sifilis', 'gonorrea', 'herpes', 'papiloma', 'vph', 'ets', 'adiccion*', 'alcoholism*', 'medicament*',
  'receta*', 'dosis', 'tratamiento*', 'sintoma*', 'transtorno*', 'trastorno*', 'discapacidad*',
];

function wordsPattern(words: string[]): RegExp {
  const parts = words.map((word) =>
    word.endsWith('*') ? `${escape(word.slice(0, -1))}\\w*` : escape(word).replace(/ /g, '\\s+'),
  );
  return new RegExp(`(?:^|[^\\w])(?:${parts.join('|')})(?=$|[^\\w])`);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const INSULT_PATTERN = wordsPattern(INSULTS);
const HEALTH_PATTERN = wordsPattern(HEALTH_TERMS);

/** Minúsculas y sin tildes («Cédula» → «cedula»); la «ñ» queda como «n». */
export function normalizeForFilter(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function reviewFlags(text: string | null | undefined): ReviewFlag[] {
  if (!text?.trim()) return [];
  const plain = normalizeForFilter(text);
  const flags: ReviewFlag[] = [];
  if (PHONE.test(plain)) flags.push('PHONE');
  if (EMAIL.test(plain)) flags.push('EMAIL');
  if (LINK.test(plain.replace(EMAIL, ' '))) flags.push('LINK');
  if (ID_NUMBER.test(plain)) flags.push('ID_NUMBER');
  if (INSULT_PATTERN.test(plain)) flags.push('INSULT');
  if (HEALTH_PATTERN.test(plain)) flags.push('HEALTH');
  return flags;
}

/** Recorta espacios y deja `null` si no queda texto. */
export function cleanText(text: string | null | undefined): string | null {
  const trimmed = text?.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return trimmed ? trimmed : null;
}
