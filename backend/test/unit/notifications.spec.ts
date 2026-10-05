import { describe, expect, it } from 'vitest';
import { isInternalLink, optionalEmailTypesFor } from '../../src/notifications/notification-types';

describe('avisos de la campana', () => {
  it('solo enlazan rutas internas del sitio', () => {
    expect(isInternalLink('/dashboard/citas')).toBe(true);
    expect(isInternalLink('/paciente/citas?cita=1')).toBe(true);
    for (const link of ['https://otra-web.com', '//otra-web.com', '/\\otra-web.com', 'javascript:alert(1)', '', null, undefined]) {
      expect(isInternalLink(link), String(link)).toBe(false);
    }
  });

  it('cada tipo de cuenta solo puede apagar sus correos opcionales', () => {
    expect(optionalEmailTypesFor('USER')).toEqual(['APPOINTMENT_REMINDER']);
    expect(optionalEmailTypesFor('PROFESSIONAL')).toEqual(['CONTACT_MESSAGE', 'REVIEW_PUBLISHED']);
    expect(optionalEmailTypesFor('ADMIN')).toEqual([]);
  });
});
