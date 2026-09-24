import { describe, expect, it } from 'vitest';
import type { DocumentType } from '@prisma/client';
import {
  canBePublished,
  canSubscribeToTier,
  documentProgress,
  nextVerificationStatus,
  professionalChecklist,
} from '../../src/professionals/publication-rules';

const BIO = 'Médico cirujano con diez años de experiencia en atención primaria y medicina familiar en Maturín.';
const approved = (...types: DocumentType[]) =>
  types.map((type) => ({ type, status: 'APPROVED' as const, createdAt: new Date('2026-09-01'), expiresAt: null }));
const FOUR = approved('CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO', 'REGISTRO_MPPS_SACS');
const ALL_SIX = approved('CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO', 'REGISTRO_MPPS_SACS', 'MATRICULA_COLEGIO_MONAGAS', 'ARTICULO_8');

describe('publicación del médico: 60% aprobado + biografía + foto', () => {
  it('el 60% se redondea hacia arriba: 4 de 6 (general) y 5 de 8 (especialista)', () => {
    expect(documentProgress(false, []).minimumToPublish).toBe(4);
    expect(documentProgress(true, []).minimumToPublish).toBe(5);
  });

  it('cuenta solo el documento más reciente de cada tipo, aprobado y vigente', () => {
    const replaced = [
      ...approved('CEDULA_IDENTIDAD'),
      { type: 'CEDULA_IDENTIDAD' as const, status: 'PENDING' as const, createdAt: new Date('2026-09-20'), expiresAt: null },
      { type: 'RIF' as const, status: 'APPROVED' as const, createdAt: new Date('2026-09-01'), expiresAt: new Date('2026-09-02') },
    ];
    expect(documentProgress(false, replaced, new Date('2026-09-24')).approved).toBe(0);
  });

  it('3 de 6 no se publica; 4 de 6 con biografía y foto sí', () => {
    const base = { verificationStatus: 'IN_REVIEW' as const, photoUrl: 'p.png', bio: BIO };
    expect(canBePublished({ ...base, documents: documentProgress(false, FOUR.slice(0, 3)) })).toBe(false);
    expect(canBePublished({ ...base, documents: documentProgress(false, FOUR) })).toBe(true);
  });

  it('sin foto, con biografía corta o suspendido no se publica', () => {
    const documents = documentProgress(false, ALL_SIX);
    expect(canBePublished({ verificationStatus: 'VERIFIED', photoUrl: null, bio: BIO, documents })).toBe(false);
    expect(canBePublished({ verificationStatus: 'VERIFIED', photoUrl: 'p.png', bio: 'Pediatra.', documents })).toBe(false);
    expect(canBePublished({ verificationStatus: 'SUSPENDED', photoUrl: 'p.png', bio: BIO, documents })).toBe(false);
  });

  it('el sello «Verificado» solo llega con el 100%; un suspendido sigue suspendido', () => {
    expect(nextVerificationStatus('IN_REVIEW', documentProgress(false, FOUR))).toBe('IN_REVIEW');
    expect(nextVerificationStatus('IN_REVIEW', documentProgress(false, ALL_SIX))).toBe('VERIFIED');
    expect(nextVerificationStatus('SUSPENDED', documentProgress(false, ALL_SIX))).toBe('SUSPENDED');
    expect(nextVerificationStatus('PENDING', documentProgress(false, []))).toBe('PENDING');
  });
});

describe('planes Profesional Plus y Premium: 100% de documentos aprobados', () => {
  it('Plus y Premium lo exigen; Profesional no', () => {
    const partial = documentProgress(false, FOUR);
    expect(canSubscribeToTier('PROFESSIONAL', partial)).toBe(true);
    expect(canSubscribeToTier('PROFESSIONAL_PLUS', partial)).toBe(false);
    expect(canSubscribeToTier('PREMIUM', partial)).toBe(false);
    expect(canSubscribeToTier('PREMIUM', documentProgress(false, ALL_SIX))).toBe(true);
  });
});

describe('barra de progreso del registro del médico', () => {
  const input = {
    verificationStatus: 'IN_REVIEW' as const,
    photoUrl: 'p.png',
    bio: BIO,
    isEmailVerified: true,
    phone: '0414-1234567',
    whatsapp: null,
    seoDescription: 'Medicina familiar en Maturín',
    specialtyCount: 1,
    socialPlatforms: [],
    documents: documentProgress(false, ALL_SIX),
  };

  it('en plan básico, redes y web se muestran bloqueadas y no restan', () => {
    const progress = professionalChecklist({ ...input, planTier: 'FREE' });
    expect(progress.items.map((i) => i.key)).toEqual([
      'account',
      'email',
      'phone',
      'photo',
      'bio',
      'specialties',
      'summary',
      'documents',
      'social',
      'website',
    ]);
    expect(progress.items.find((i) => i.key === 'social')?.lockedUntil).toBe('PROFESSIONAL_PLUS');
    expect(progress.items.find((i) => i.key === 'website')?.lockedUntil).toBe('PREMIUM');
    expect(progress.percent).toBe(100);
    expect(progress.canPublish).toBe(true);
  });

  it('en Premium, redes y web cuentan; los documentos suman en proporción', () => {
    const progress = professionalChecklist({ ...input, planTier: 'PREMIUM', documents: documentProgress(false, FOUR) });
    // 7 ítems completos + 4/6 de documentos, sobre 10 ítems (redes y web pendientes).
    expect(progress.percent).toBe(Math.round(((7 + 4 / 6) / 10) * 100));
    expect(progress.fullDocuments).toBe(false);
  });
});
