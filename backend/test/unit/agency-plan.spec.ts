import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { parseYouTubeVideoId, resolvePresentationVideo } from '../../src/professionals/presentation-video';
import { canSubscribeToTier, documentProgress, professionalChecklist } from '../../src/professionals/publication-rules';
import { DOCTOR_TIER_RANK, FEATURED_TIERS, SOCIAL_LINK_LIMITS, tierAtLeast } from '../../src/subscriptions/plan-tiers';
import { PLAN_BOOST } from '../../src/professionals/directory-score';

const ID = 'dQw4w9WgXcQ';

describe('video de presentación: solo IDs de YouTube', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=shared`,
    ID,
  ])('acepta %s', (input) => {
    expect(parseYouTubeVideoId(input)).toBe(ID);
  });

  it.each([
    `https://youtube.com.evil.example/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://vimeo.com/${ID}`,
    `https://www.youtube.com/watch?v=corto`,
    `https://www.youtube.com/playlist?list=PL1234567890`,
    `https://www.youtube.com/watch/extra?v=${ID}`,
    `https://user:pass@www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com:8443/watch?v=${ID}`,
    `javascript:alert(1)`,
    `<script>`,
    '',
  ])('rechaza %s', (input) => {
    expect(parseYouTubeVideoId(input)).toBeNull();
  });

  it('vacío o null quita el video; un enlace ajeno es un error claro', () => {
    expect(resolvePresentationVideo(null)).toBeNull();
    expect(resolvePresentationVideo('   ')).toBeNull();
    expect(resolvePresentationVideo(`https://youtu.be/${ID}`)).toBe(ID);
    expect(() => resolvePresentationVideo('https://vimeo.com/123')).toThrow(BadRequestException);
  });
});

describe('plan Marca Médica', () => {
  it('es el plan de médico más alto y conserva todo lo de Premium', () => {
    expect(Math.max(...Object.values(DOCTOR_TIER_RANK))).toBe(DOCTOR_TIER_RANK.AGENCY);
    expect(tierAtLeast('AGENCY', 'PREMIUM')).toBe(true);
    expect(tierAtLeast('PREMIUM', 'AGENCY')).toBe(false);
    expect(SOCIAL_LINK_LIMITS.AGENCY).toEqual(SOCIAL_LINK_LIMITS.PREMIUM);
    expect(FEATURED_TIERS[0]).toBe('AGENCY');
    expect(FEATURED_TIERS).toContain('PREMIUM');
  });

  it('no compra puntaje extra en el directorio: solo el espacio «Destacado» señalado', () => {
    expect(PLAN_BOOST.AGENCY).toBe(PLAN_BOOST.PREMIUM);
    expect(Math.max(...Object.values(PLAN_BOOST))).toBeLessThanOrEqual(15);
  });

  it('exige el 100% de los documentos aprobados, como Plus y Premium', () => {
    const approved = (n: number) =>
      (['CEDULA_IDENTIDAD', 'RIF', 'TITULO_MEDICO', 'REGISTRO_MPPS_SACS', 'MATRICULA_COLEGIO_MONAGAS', 'ARTICULO_8'] as const)
        .slice(0, n)
        .map((type) => ({ type, status: 'APPROVED' as const, createdAt: new Date('2026-09-01'), expiresAt: null }));
    expect(canSubscribeToTier('AGENCY', documentProgress(false, approved(4)))).toBe(false);
    expect(canSubscribeToTier('AGENCY', documentProgress(false, approved(6)))).toBe(true);
  });

  it('en Agencia el video cuenta en el progreso del perfil', () => {
    const base = {
      isEmailVerified: true,
      photoUrl: 'foto.jpg',
      bio: 'Médico cirujano con diez años de experiencia en atención primaria y medicina familiar en Maturín.',
      phone: '0414-1234567',
      whatsapp: null,
      seoDescription: 'Medicina familiar',
      specialtyCount: 1,
      socialPlatforms: ['INSTAGRAM', 'WEBSITE'] as ('INSTAGRAM' | 'WEBSITE')[],
      verificationStatus: 'VERIFIED' as const,
      documents: documentProgress(false, []),
      planTier: 'AGENCY' as const,
    };
    const withoutVideo = professionalChecklist({ ...base, presentationVideoId: null });
    const video = withoutVideo.items.find((i) => i.key === 'video');
    expect(video?.lockedUntil).toBeUndefined();
    expect(video?.done).toBe(false);
    const withVideo = professionalChecklist({ ...base, presentationVideoId: ID });
    expect(withVideo.percent).toBeGreaterThan(withoutVideo.percent);
  });
});
