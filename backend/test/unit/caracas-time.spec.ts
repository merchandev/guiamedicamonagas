import { describe, expect, it } from 'vitest';
import { caracasDateLabel, caracasLongDate, caracasTimeLabel } from '../../src/common/caracas-time';

// Los contenedores de producción corren en UTC. Estos textos van en correos y
// avisos: deben salir en hora de Caracas sea cual sea la zona del servidor.
const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('fechas y horas en hora de Caracas', () => {
  it('una cita de las 10:00 a. m. de Caracas (14:00 UTC) se escribe «10:00 a. m.»', () => {
    expect(plain(caracasTimeLabel(new Date('2026-10-05T14:00:00Z')))).toBe('10:00 a. m.');
  });

  it('una cita de las 9:00 p. m. de Caracas no cae al día siguiente', () => {
    const appointment = new Date('2026-10-06T01:00:00Z');
    expect(plain(caracasDateLabel(appointment))).toBe('lunes, 5 de octubre de 2026');
    expect(plain(caracasTimeLabel(appointment))).toBe('9:00 p. m.');
    expect(plain(caracasLongDate(appointment))).toBe('5 de octubre de 2026');
  });
});
