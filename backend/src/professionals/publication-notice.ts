import type { NotificationsService } from '../notifications/notifications.service';
import { profilePublishedTemplate } from '../mail/mail.templates';
import type { DocumentProgress } from './publication-rules';

/** Aviso al médico cuando su perfil pasa a ser público (antes del 100% verificado). */
export async function notifyProfilePublished(
  notifications: NotificationsService,
  profile: { userId: string; firstName: string; email: string; whatsapp: string | null },
  profileUrl: string,
  documents: Pick<DocumentProgress, 'approved' | 'required'>,
) {
  await notifications.notify({
    userId: profile.userId,
    type: 'PROFILE_PUBLISHED',
    title: 'Tu perfil ya es público',
    content: `Apareces en el directorio con ${documents.approved} de ${documents.required} documentos aprobados. El sello «Verificado» llega con el 100%.`,
    email: {
      to: profile.email,
      subject: 'Tu perfil ya es público — Guía Médica Monagas',
      html: profilePublishedTemplate(profile.firstName, profileUrl, documents.approved, documents.required),
      template: 'profile_published',
    },
    whatsapp: profile.whatsapp
      ? {
          to: profile.whatsapp,
          template: 'profile_published',
          body: `Dr(a). ${profile.firstName}, tu perfil en Guía Médica Monagas ya es público: ${profileUrl}`,
        }
      : undefined,
  });
}
