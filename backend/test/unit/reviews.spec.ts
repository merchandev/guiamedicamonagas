import { describe, expect, it } from 'vitest';
import { cleanText, reviewFlags } from '../../src/reviews/review-filter';
import { publicRating } from '../../src/reviews/review-rating';
import { authorLabel } from '../../src/reviews/reviews.service';
import { patientCompleteness } from '../../src/patients/patient-completeness';
import { caracasMonthKey } from '../../src/common/caracas-time';
import { ROLE_PERMISSIONS, Permission } from '../../src/common/permissions';
import { activeSanctionWhere, SANCTION_PRESET_DAYS, sanctionEndsAt, sanctionUntilText } from '../../src/reviews/sanction-rules';

describe('filtro automático de valoraciones', () => {
  it('marca teléfonos, correos, enlaces y cédulas', () => {
    expect(reviewFlags('Llámame al 0414-123.45.67')).toContain('PHONE');
    expect(reviewFlags('Escríbeme a maria.perez@correo.com')).toEqual(expect.arrayContaining(['EMAIL']));
    expect(reviewFlags('Escríbeme a maria.perez@correo.com')).not.toContain('LINK');
    expect(reviewFlags('Mira www.otra-pagina.com/perfil')).toContain('LINK');
    expect(reviewFlags('Vean consultorio-x.com')).toContain('LINK');
    expect(reviewFlags('Mi cédula es V-12.345.678')).toContain('ID_NUMBER');
    expect(reviewFlags('soy la c.i. v12345678')).toContain('ID_NUMBER');
  });

  it('marca insultos, acusaciones y términos de salud sin importar tildes ni mayúsculas', () => {
    expect(reviewFlags('Es un IMBÉCIL')).toContain('INSULT');
    expect(reviewFlags('un estafador total')).toContain('INSULT');
    expect(reviewFlags('Me diagnosticó DEPRESIÓN')).toEqual(expect.arrayContaining(['HEALTH']));
    expect(reviewFlags('Mi tratamiento funcionó')).toContain('HEALTH');
  });

  it('no marca una opinión común sobre la atención', () => {
    expect(reviewFlags('Muy puntual y amable, explicó todo con paciencia. Lo recomiendo.')).toEqual([]);
    expect(reviewFlags('La consulta duró 30 minutos y la espera fue de 15')).toEqual([]);
    expect(reviewFlags('Conozco su consultorio desde hace años')).toEqual([]);
    expect(reviewFlags('')).toEqual([]);
    expect(reviewFlags(null)).toEqual([]);
  });

  it('recorta el texto y deja null si queda vacío', () => {
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(undefined)).toBeNull();
    expect(cleanText('  Excelente\r\n\r\n\r\n\r\natención  ')).toBe('Excelente\n\natención');
  });
});

describe('lo público de una valoración', () => {
  it('el autor es «Paciente verificado» salvo que elija nombre e inicial', () => {
    expect(authorLabel('ANONYMOUS', 'María José', 'González')).toBe('Paciente verificado');
    expect(authorLabel('INITIAL', 'María José', 'González')).toBe('María G.');
    expect(authorLabel('INITIAL', 'Ana', 'álvarez')).toBe('Ana Á.');
    expect(authorLabel('INITIAL', null, 'González')).toBe('Paciente verificado');
  });

  it('el promedio aparece desde 3 valoraciones publicadas, con un decimal', () => {
    expect(publicRating(5, 2)).toEqual({ average: null, count: 2 });
    expect(publicRating(4.666666, 3)).toEqual({ average: 4.7, count: 3 });
    expect(publicRating(null, 0)).toEqual({ average: null, count: 0 });
  });

  it('el mes de la consulta es el de Caracas, no el de UTC', () => {
    // 30 de septiembre a las 9:00 p. m. en Caracas = 1 de octubre 01:00 UTC.
    expect(caracasMonthKey(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09');
    expect(caracasMonthKey(new Date('2026-10-01T05:00:00Z'))).toBe('2026-10');
  });
});

describe('registro al 100 % del paciente', () => {
  const full = {
    firstName: 'María',
    lastName: 'González',
    cedulaEnc: 'gmm1.x',
    phoneEnc: 'gmm1.y',
    municipality: 'Maturín',
    photoKey: 'patient-photos/a.jpg',
    idPhotoKey: 'patient-id-documents/b.jpg',
  };

  it('identidad y contacto con el correo verificado, sin datos de salud', () => {
    expect(patientCompleteness(full, true).percent).toBe(100);
    const result = patientCompleteness({ ...full, idPhotoKey: null }, true);
    expect(result.percent).toBe(86);
    expect(result.items.filter((item) => !item.done).map((item) => item.label)).toEqual(['Foto de tu cédula']);
    expect(patientCompleteness(full, false).items.find((item) => item.key === 'email')?.done).toBe(false);
    expect(patientCompleteness(null, false).percent).toBe(0);
  });
});

describe('permiso de moderación', () => {
  it('lo tienen la administración y la superadministración, nadie más', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain(Permission.MODERATE_REVIEWS);
    expect(ROLE_PERMISSIONS.SUPERADMIN).toContain(Permission.MODERATE_REVIEWS);
    for (const role of ['USER', 'PROFESSIONAL', 'ORGANIZATION'] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain(Permission.MODERATE_REVIEWS);
    }
  });
});

describe('sanciones por días', () => {
  it('dura de 1 a 365 días desde ahora, o es indefinida', () => {
    const from = new Date('2026-10-05T14:00:00Z');
    expect(sanctionEndsAt(7, from)?.toISOString()).toBe('2026-10-12T14:00:00.000Z');
    expect(sanctionEndsAt(null, from)).toBeNull();
    expect(() => sanctionEndsAt(0, from)).toThrow(RangeError);
    expect(() => sanctionEndsAt(366, from)).toThrow(RangeError);
    expect(() => sanctionEndsAt(2.5, from)).toThrow(RangeError);
    expect(SANCTION_PRESET_DAYS).toEqual([1, 3, 7, 15, 30, 90]);
  });

  it('el aviso dice hasta cuándo en hora de Caracas', () => {
    // 15 de octubre a las 11:00 p. m. en Caracas = 16 de octubre 03:00 UTC.
    expect(sanctionUntilText(new Date('2026-10-16T03:00:00Z'))).toBe('hasta el 15 de octubre de 2026');
    expect(sanctionUntilText(null)).toBe('por tiempo indefinido');
  });

  it('una sanción vigente no está levantada, ya empezó y no terminó', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    expect(activeSanctionWhere('u1', 'ACCOUNT', now)).toEqual({
      userId: 'u1',
      type: 'ACCOUNT',
      liftedAt: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    });
  });
});
