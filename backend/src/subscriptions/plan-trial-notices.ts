import type { NotificationsService } from '../notifications/notifications.service';
import { trialEndingTemplate, trialExpiredTemplate, trialStartedTemplate } from '../mail/mail.templates';
import { TRIAL_DAYS } from './plan-tiers';
import { trialEndLabel } from './plan-trial';

/**
 * Avisos de la prueba gratuita de Plus, en la campana y por correo (no se
 * pueden apagar: son de la cuenta). Llevan a «Suscripción y pagos».
 */
interface Recipient {
  userId: string;
  firstName: string;
  email: string;
}

const PLANS_PATH = '/dashboard/pagos';

export async function notifyTrialStarted(
  notifications: NotificationsService,
  doctor: Recipient & { slug: string },
  frontendUrl: string,
  endsAt: Date,
) {
  const ends = trialEndLabel(endsAt);
  await notifications.notify({
    userId: doctor.userId,
    type: 'TRIAL_STARTED',
    title: `Tu perfil ya es público: ${TRIAL_DAYS} días gratis de Plus`,
    content: `Apareces en el directorio con el sello «Verificado» y el plan Plus gratis. Tu prueba termina el ${ends}: para seguir apareciendo después, elige un plan en «Suscripción y pagos».`,
    link: PLANS_PATH,
    email: {
      to: doctor.email,
      subject: `Tu perfil ya es público: ${TRIAL_DAYS} días gratis de Plus — Guía Médica Monagas`,
      html: trialStartedTemplate(`Dr(a). ${doctor.firstName}`, ends, `${frontendUrl}/medicos/${doctor.slug}`, `${frontendUrl}${PLANS_PATH}`),
      template: 'trial_started',
    },
  });
}

export async function notifyTrialEnding(
  notifications: NotificationsService,
  doctor: Recipient,
  frontendUrl: string,
  endsAt: Date,
  lastDay: boolean,
) {
  const ends = trialEndLabel(endsAt);
  const title = lastDay ? 'Tu prueba gratis de Plus termina en menos de 24 horas' : 'Tu prueba gratis de Plus termina en 3 días';
  await notifications.notify({
    userId: doctor.userId,
    type: 'TRIAL_ENDING',
    title,
    content: `Termina el ${ends}: para seguir apareciendo en el directorio y recibiendo citas, elige un plan y reporta tu pago. Si pagas antes, los días que te queden se suman a tu plan.`,
    link: PLANS_PATH,
    email: {
      to: doctor.email,
      subject: `${title} — Guía Médica Monagas`,
      html: trialEndingTemplate(`Dr(a). ${doctor.firstName}`, ends, `${frontendUrl}${PLANS_PATH}`),
      template: 'trial_ending',
    },
  });
}

export async function notifyTrialExpired(notifications: NotificationsService, doctor: Recipient, frontendUrl: string) {
  await notifications.notify({
    userId: doctor.userId,
    type: 'TRIAL_EXPIRED',
    title: 'Tu prueba gratis de Plus terminó',
    content:
      'Tu perfil ya no aparece en el directorio ni recibe citas nuevas. Tus datos, tus documentos y las citas que ya tenías se conservan. Elige un plan y reporta tu pago para volver a aparecer.',
    link: PLANS_PATH,
    email: {
      to: doctor.email,
      subject: 'Tu prueba gratis de Plus terminó — Guía Médica Monagas',
      html: trialExpiredTemplate(`Dr(a). ${doctor.firstName}`, `${frontendUrl}${PLANS_PATH}`),
      template: 'trial_expired',
    },
  });
}
