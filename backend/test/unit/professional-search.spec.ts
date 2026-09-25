import { describe, expect, it } from 'vitest';
import {
  directorySearchWhere,
  generatePublicCode,
  normalizePublicCode,
  normalizeSearchText,
  searchNameFor,
  searchTerms,
} from '../../src/professionals/professional-search.util';

describe('código público del médico', () => {
  it('tiene la forma GM-XXXXXX, sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) expect(generatePublicCode()).toMatch(/^GM-[2-9A-HJKMNP-Z]{6}$/);
  });

  it('se acepta con o sin prefijo, guion o mayúsculas', () => {
    const code = generatePublicCode();
    expect(normalizePublicCode(code.toLowerCase())).toBe(code);
    expect(normalizePublicCode(code.replace('-', ''))).toBe(code);
    expect(normalizePublicCode(code.slice(3))).toBe(code);
  });

  it('no confunde un código de paciente, una cédula ni un RIF con un código de médico', () => {
    expect(normalizePublicCode('K7Q4-M9TX-P3WD')).toBeNull();
    expect(normalizePublicCode('V-12345678')).toBeNull();
    expect(normalizePublicCode('V-12345678-9')).toBeNull();
  });
});

describe('texto de búsqueda', () => {
  it('ignora tildes, eñes, mayúsculas y espacios de más', () => {
    expect(normalizeSearchText('  José  Núñez PÉREZ ')).toBe('jose nunez perez');
    expect(searchNameFor('María José', 'Rodríguez')).toBe('maria jose rodriguez');
  });

  it('separa términos útiles (2+ caracteres, sin repetir, máximo 5)', () => {
    expect(searchTerms('Dra. Ana  ana Pérez')).toEqual(['dra', 'ana', 'perez']);
    expect(searchTerms('a b c')).toEqual([]);
    expect(searchTerms('uno dos tres cuatro cinco seis')).toHaveLength(5);
  });

  it('una búsqueda sin términos útiles no devuelve todo el directorio', () => {
    expect(directorySearchWhere(undefined)).toBeUndefined();
    expect(directorySearchWhere('   ')).toBeUndefined();
    expect(directorySearchWhere('a')).toEqual({ id: '__sin-resultados__' });
  });

  it('solo busca en nombre, especialidad y código: nunca en cédula, RIF, correo ni dirección', () => {
    const where = JSON.stringify(directorySearchWhere('Ana Pérez cardiología'));
    expect(where).toContain('searchName');
    expect(where).toContain('specialties');
    for (const field of ['cedula', 'rif', 'email', 'address', 'phone', 'patient']) expect(where).not.toContain(field);
  });
});
