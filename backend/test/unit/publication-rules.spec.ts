import { describe, expect, it, vi } from 'vitest';
import type { DocumentType } from '@prisma/client';
import {
  canBePublished,
  canSubscribeToTier,
  documentProgress,
  nextVerificationStatus,
  professionalChecklist,
  recomputeProfessionalStatus,
  startsTrial,
  trialAvailable,
} from '../../src/professionals/publication-rules';

const BIO = 'Médico cirujano con diez años de experiencia en atención primaria y medicina familiar en Maturín.';
const approved = (...types: DocumentType[]) =>
  types.map((type) => ({ type, status: 'APPROVED' as const, createdAt: new Date('2026-09-01'), expiresAt: null }));
const FOUR = approved('CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO', 'REGISTRO_MPPS_SACS');
const ALL_SIX = approved('CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO', 'REGISTRO_MPPS_SACS', 'MATRICULA_COLEGIO_MONAGAS', 'ARTICULO_8');

describe('moderación de cuentas y publicación', () => {
  it('una cuenta inactiva no se publica aunque tenga todos los documentos', async () => {
    const professionalProfile = {
      findUnique: vi.fn().mockResolvedValue({ user: { isActive: false }, isPublished: true,
        verificationStatus: 'VERIFIED', isSpecialist: false, photoUrl: '/photo.jpg', bio: BIO, documents: ALL_SIX,
        planTier: 'PROFESSIONAL', trialStartedAt: null, trialNotice: 'CLOSED' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const result = await recomputeProfessionalStatus({ professionalProfile } as any, 'test');
    expect(result?.isPublished).toBe(false);
    expect(result?.becamePublic).toBe(false);
    expect(professionalProfile.updateMany.mock.calls[0][0].data.isPublished).toBe(false);
  });

  it('no anuncia publicación si una moderación concurrente cambia el estado', async () => {
    const professionalProfile = {
      findUnique: vi.fn().mockResolvedValue({ user: { isActive: true }, isPublished: false,
        verificationStatus: 'IN_REVIEW', isSpecialist: false, photoUrl: '/photo.jpg', bio: BIO, documents: ALL_SIX,
        planTier: 'PROFESSIONAL', trialStartedAt: null, trialNotice: 'CLOSED' }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    expect(await recomputeProfessionalStatus({ professionalProfile } as any, 'test')).toBeNull();
  });
});

describe('publicación del médico: 60% aprobado + biografía + foto + un plan', () => {
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

  it('3 de 6 no se publica; 4 de 6 con biografía, foto y plan Profesional sí', () => {
    const base = { verificationStatus: 'IN_REVIEW' as const, photoUrl: 'p.png', bio: BIO, planTier: 'PROFESSIONAL' as const };
    expect(canBePublished({ ...base, documents: documentProgress(false, FOUR.slice(0, 3)) })).toBe(false);
    expect(canBePublished({ ...base, documents: documentProgress(false, FOUR) })).toBe(true);
  });

  it('sin plan no se publica, aunque tenga todo lo demás (no hay plan gratis)', () => {
    const p = { verificationStatus: 'VERIFIED' as const, photoUrl: 'p.png', bio: BIO, documents: documentProgress(false, ALL_SIX) };
    expect(canBePublished({ ...p, planTier: 'FREE' })).toBe(false);
    expect(canBePublished({ ...p, planTier: 'PROFESSIONAL_PLUS' })).toBe(true);
  });

  it('sin foto, con biografía corta o suspendido no se publica', () => {
    const documents = documentProgress(false, ALL_SIX);
    const planTier = 'PREMIUM' as const;
    expect(canBePublished({ verificationStatus: 'VERIFIED', photoUrl: null, bio: BIO, documents, planTier })).toBe(false);
    expect(canBePublished({ verificationStatus: 'VERIFIED', photoUrl: 'p.png', bio: 'Pediatra.', documents, planTier })).toBe(false);
    expect(canBePublished({ verificationStatus: 'SUSPENDED', photoUrl: 'p.png', bio: BIO, documents, planTier })).toBe(false);
  });

  it('el sello «Verificado» solo llega con el 100%; un suspendido sigue suspendido', () => {
    expect(nextVerificationStatus('IN_REVIEW', documentProgress(false, FOUR))).toBe('IN_REVIEW');
    expect(nextVerificationStatus('IN_REVIEW', documentProgress(false, ALL_SIX))).toBe('VERIFIED');
    expect(nextVerificationStatus('SUSPENDED', documentProgress(false, ALL_SIX))).toBe('SUSPENDED');
    expect(nextVerificationStatus('PENDING', documentProgress(false, []))).toBe('PENDING');
  });
});

describe('planes Plus y Premium: 100% de documentos aprobados', () => {
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

  it('en el plan Profesional, redes, web y video se muestran bloqueados y no restan', () => {
    const progress = professionalChecklist({ ...input, planTier: 'PROFESSIONAL' });
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
      'video',
    ]);
    expect(progress.items.find((i) => i.key === 'social')?.lockedUntil).toBe('PROFESSIONAL_PLUS');
    expect(progress.items.find((i) => i.key === 'website')?.lockedUntil).toBe('PREMIUM');
    expect(progress.items.find((i) => i.key === 'video')?.lockedUntil).toBe('AGENCY');
    expect(progress.percent).toBe(100);
    expect(progress.canPublish).toBe(true);
  });

  it('en Premium, redes y web cuentan; los documentos suman en proporción', () => {
    const progress = professionalChecklist({ ...input, planTier: 'PREMIUM', documents: documentProgress(false, FOUR) });
    // 7 ítems completos + 4/6 de documentos, sobre 10 ítems (redes y web pendientes).
    expect(progress.percent).toBe(Math.round(((7 + 4 / 6) / 10) * 100));
    expect(progress.fullDocuments).toBe(false);
  });

  it('sin plan, el plan falta para publicarse y explica cuándo empieza la prueba gratis', () => {
    const progress = professionalChecklist({ ...input, planTier: 'FREE', trialAvailable: true, documents: documentProgress(false, FOUR) });
    const plan = progress.publication.find((r) => r.key === 'plan');
    expect(plan?.done).toBe(false);
    expect(plan?.label).toContain('prueba gratis de 14 días');
    expect(progress.canPublish).toBe(false);
    const used = professionalChecklist({ ...input, planTier: 'FREE', trialAvailable: false });
    expect(used.publication.find((r) => r.key === 'plan')?.label).toContain('Suscripción y pagos');
  });
});

describe('prueba gratuita de Plus: 14 días, una sola vez, con el 100%', () => {
  const ready = {
    verificationStatus: 'VERIFIED' as const,
    photoUrl: 'p.png',
    bio: BIO,
    documents: documentProgress(false, ALL_SIX),
    planTier: 'FREE' as const,
    trialAvailable: true,
  };

  it('empieza sola con todo listo y sin plan', () => {
    expect(startsTrial(ready)).toBe(true);
  });

  it('no empieza con el 60%, sin foto, ya usada, con un plan pagado o suspendido', () => {
    expect(startsTrial({ ...ready, documents: documentProgress(false, FOUR), verificationStatus: 'IN_REVIEW' })).toBe(false);
    expect(startsTrial({ ...ready, photoUrl: null })).toBe(false);
    expect(startsTrial({ ...ready, trialAvailable: false })).toBe(false);
    expect(startsTrial({ ...ready, planTier: 'PROFESSIONAL' })).toBe(false);
    expect(startsTrial({ ...ready, verificationStatus: 'SUSPENDED' })).toBe(false);
  });

  it('se usa una sola vez: no la tiene quien la empezó ni quien ya pagó un plan', () => {
    expect(trialAvailable({ trialStartedAt: null, trialNotice: 'NONE' })).toBe(true);
    expect(trialAvailable({ trialStartedAt: new Date(), trialNotice: 'NONE' })).toBe(false);
    expect(trialAvailable({ trialStartedAt: null, trialNotice: 'CLOSED' })).toBe(false);
  });

  it('al completar el perfil se publica con Plus por 14 días', async () => {
    const now = new Date('2026-10-07T12:00:00Z');
    const professionalProfile = {
      findUnique: vi.fn().mockResolvedValue({ user: { isActive: true }, isPublished: false, verificationStatus: 'IN_REVIEW',
        isSpecialist: false, photoUrl: '/photo.jpg', bio: BIO, documents: ALL_SIX, planTier: 'FREE', trialStartedAt: null, trialNotice: 'NONE' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const result = await recomputeProfessionalStatus({ professionalProfile } as any, 'test', now);
    expect(result).toMatchObject({ trialStarted: true, isPublished: true, becamePublic: true, becameVerified: true });
    expect(result?.trialEndsAt?.toISOString()).toBe('2026-10-21T12:00:00.000Z');
    const call = professionalProfile.updateMany.mock.calls[0][0];
    expect(call.data).toMatchObject({ planTier: 'PROFESSIONAL_PLUS', trialStartedAt: now, isPublished: true, verificationStatus: 'VERIFIED' });
    // Un pago aprobado al mismo tiempo no se pisa: la escritura exige el plan que se leyó.
    expect(call.where.planTier).toBe('FREE');
  });

  it('una cuenta suspendida no empieza la prueba', async () => {
    const professionalProfile = {
      findUnique: vi.fn().mockResolvedValue({ user: { isActive: false }, isPublished: false, verificationStatus: 'VERIFIED',
        isSpecialist: false, photoUrl: '/photo.jpg', bio: BIO, documents: ALL_SIX, planTier: 'FREE', trialStartedAt: null, trialNotice: 'NONE' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const result = await recomputeProfessionalStatus({ professionalProfile } as any, 'test');
    expect(result?.trialStarted).toBe(false);
    expect(professionalProfile.updateMany).not.toHaveBeenCalled();
  });
});
