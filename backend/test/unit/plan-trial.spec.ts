import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/professionals/publication-rules', async (original) => ({
  ...(await original<typeof import('../../src/professionals/publication-rules')>()),
  recomputeProfessionalStatus: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/professionals/directory-score', () => ({ recomputeDirectoryScore: vi.fn() }));

import { recomputeProfessionalStatus } from '../../src/professionals/publication-rules';
import { paidPeriodAnchor, planStatus, trialStep } from '../../src/subscriptions/plan-trial';
import { PlanTrialsService } from '../../src/subscriptions/plan-trials.service';

const HOUR = 3_600_000;
const NOW = new Date('2026-10-07T12:00:00Z');
const endsIn = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const step = (hours: number, notice: 'NONE' | 'ENDS_IN_3_DAYS' | 'ENDS_IN_1_DAY' | 'CLOSED' = 'NONE', extra = {}) =>
  trialStep({ now: NOW, trialEndsAt: endsIn(hours), notice, onTrialTier: true, hasPaidPlan: false, ...extra });

describe('prueba gratuita: qué toca hacer en cada momento', () => {
  it('nada mientras faltan más de 3 días', () => {
    expect(step(73)).toBe('NONE');
  });

  it('un aviso al entrar en los últimos 3 días y otro en el último día, una sola vez cada uno', () => {
    expect(step(72)).toBe('ENDS_IN_3_DAYS');
    expect(step(50, 'ENDS_IN_3_DAYS')).toBe('NONE');
    expect(step(24, 'ENDS_IN_3_DAYS')).toBe('ENDS_IN_1_DAY');
    expect(step(5, 'ENDS_IN_1_DAY')).toBe('NONE');
  });

  it('si el aviso de 3 días no salió a tiempo, en el último día sale solo el de 1 día', () => {
    expect(step(10)).toBe('ENDS_IN_1_DAY');
  });

  it('al vencer se cierra (y el perfil deja de mostrarse)', () => {
    expect(step(0, 'ENDS_IN_1_DAY')).toBe('EXPIRE');
    expect(step(-5)).toBe('EXPIRE');
  });

  it('con un plan pagado, o sin el plan de la prueba, se cierra sin avisos', () => {
    expect(step(10, 'NONE', { hasPaidPlan: true })).toBe('CLOSE');
    expect(step(-5, 'NONE', { onTrialTier: false })).toBe('CLOSE');
    expect(step(-5, 'CLOSED')).toBe('NONE');
  });
});

describe('pago durante la prueba: los días que quedaban se suman', () => {
  const trial = { planTier: 'PROFESSIONAL_PLUS', trialEndsAt: endsIn(5 * 24), trialNotice: 'NONE' as const };

  it('el vencimiento se calcula desde el fin de la prueba', () => {
    expect(paidPeriodAnchor(NOW, trial, 'PROFESSIONAL_PLUS')).toEqual(trial.trialEndsAt);
  });

  it('sin prueba en curso, desde el pago', () => {
    expect(paidPeriodAnchor(NOW, { ...trial, trialNotice: 'CLOSED' }, 'PROFESSIONAL_PLUS')).toEqual(NOW);
    expect(paidPeriodAnchor(NOW, { ...trial, planTier: 'FREE' }, 'PROFESSIONAL_PLUS')).toEqual(NOW);
    expect(paidPeriodAnchor(NOW, { ...trial, trialEndsAt: endsIn(-1) }, 'PROFESSIONAL_PLUS')).toEqual(NOW);
  });
});

describe('estado del plan en el panel', () => {
  const base = { trialStartedAt: null, trialEndsAt: null, trialNotice: 'NONE' as const };

  it('sin plan y con la prueba disponible', () => {
    expect(planStatus({ ...base, planTier: 'FREE' }, null, NOW)).toMatchObject({ kind: 'NONE', trialAvailable: true, trialEndedAt: null });
  });

  it('en la prueba, con su fin', () => {
    const trial = { planTier: 'PROFESSIONAL_PLUS' as const, trialStartedAt: endsIn(-24), trialEndsAt: endsIn(24), trialNotice: 'NONE' as const };
    expect(planStatus(trial, null, NOW)).toMatchObject({ kind: 'TRIAL', endsAt: trial.trialEndsAt });
  });

  it('la prueba terminó: sin plan y sin otra prueba', () => {
    const ended = { planTier: 'FREE' as const, trialStartedAt: endsIn(-400), trialEndsAt: endsIn(-64), trialNotice: 'CLOSED' as const };
    expect(planStatus(ended, null, NOW)).toMatchObject({ kind: 'NONE', trialAvailable: false, trialEndedAt: ended.trialEndsAt });
  });

  it('con un plan pagado, su vencimiento', () => {
    const paidEnd = endsIn(700);
    expect(planStatus({ ...base, planTier: 'PREMIUM', trialNotice: 'CLOSED' }, { currentPeriodEnd: paidEnd }, NOW)).toMatchObject({
      kind: 'PAID',
      endsAt: paidEnd,
    });
  });
});

describe('tarea horaria de la prueba', () => {
  function setup(profiles: object[]) {
    const prisma = {
      professionalProfile: {
        findMany: vi.fn().mockResolvedValue(profiles),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
    const config = { get: () => 'https://gmm.test' };
    return { prisma, notifications, service: new PlanTrialsService(prisma as any, notifications as any, config as any) };
  }
  const doctor = (hours: number, extra = {}) => ({
    id: 'p1', userId: 'u1', firstName: 'Diana', planTier: 'PROFESSIONAL_PLUS', trialEndsAt: endsIn(hours),
    trialNotice: 'NONE', user: { email: 'diana@test.local' }, subscriptions: [], ...extra,
  });

  it('al vencer: sin plan, se recalcula la publicación y avisa con el enlace a pagar', async () => {
    const { prisma, notifications, service } = setup([doctor(-1)]);
    await service.processTrials(NOW);
    expect(prisma.professionalProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', trialNotice: 'NONE', planTier: 'PROFESSIONAL_PLUS' },
      data: { trialNotice: 'CLOSED', planTier: 'FREE' },
    });
    expect(recomputeProfessionalStatus).toHaveBeenCalledWith(prisma, 'p1', NOW);
    const notice = notifications.notify.mock.calls[0][0];
    expect(notice).toMatchObject({ userId: 'u1', type: 'TRIAL_EXPIRED', link: '/dashboard/pagos' });
    expect(notice.email.to).toBe('diana@test.local');
    expect(notice.email.html).toContain('https://gmm.test/dashboard/pagos');
  });

  it('3 días antes: aviso por la campana y por correo, sin tocar el plan', async () => {
    const { prisma, notifications, service } = setup([doctor(60)]);
    await service.processTrials(NOW);
    expect(prisma.professionalProfile.updateMany.mock.calls[0][0].data).toEqual({ trialNotice: 'ENDS_IN_3_DAYS' });
    expect(notifications.notify.mock.calls[0][0]).toMatchObject({ type: 'TRIAL_ENDING', title: 'Tu prueba gratis de Plus termina en 3 días' });
  });

  it('si ya pagó, la prueba se cierra sin avisos', async () => {
    const { prisma, notifications, service } = setup([doctor(-1, { subscriptions: [{ id: 's1' }] })]);
    await service.processTrials(NOW);
    expect(prisma.professionalProfile.updateMany.mock.calls[0][0].data).toEqual({ trialNotice: 'CLOSED' });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('los avisos no dejan un punto doble tras la hora («p. m..»)', async () => {
    const { notifications, service } = setup([doctor(60), doctor(-1, { id: 'p2' })]);
    await service.processTrials(NOW);
    const notifyTrialStarted = (await import('../../src/subscriptions/plan-trial-notices')).notifyTrialStarted;
    await notifyTrialStarted(notifications as any, { userId: 'u1', firstName: 'Diana', email: 'd@test.local', slug: 'diana' }, 'https://gmm.test', endsIn(300));
    for (const [notice] of notifications.notify.mock.calls) {
      expect(notice.content).not.toMatch(/\.\./);
      expect(notice.email.html).not.toMatch(/\.\s*<\/strong>\./);
    }
    expect(notifications.notify).toHaveBeenCalledTimes(3);
  });

  it('si otro proceso ya lo hizo, no avisa dos veces', async () => {
    const { prisma, notifications, service } = setup([doctor(10)]);
    prisma.professionalProfile.updateMany.mockResolvedValue({ count: 0 });
    await service.processTrials(NOW);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
