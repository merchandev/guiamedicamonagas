const BRAND_COLOR = '#0f6e5c';
const BRAND_NAME = 'Guía Médica Monagas';

/** Escapa HTML para evitar inyección en correos a partir de datos de usuario. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, bodyHtml: string, footerNote?: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1c1c1c;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f3;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:${BRAND_COLOR};padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.2px;">${BRAND_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#fafaf9;border-top:1px solid #eee;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8a8a;">
                  ${footerNote ?? `Recibiste este correo porque tienes una cuenta en ${BRAND_NAME}.`}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;margin-top:16px;">${label}</a>`;
}

export function emailVerificationTemplate(rawName: string, verifyUrl: string) {
  const name = escapeHtml(rawName);
  return layout(
    'Confirma tu correo',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name} 👋</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Gracias por registrarte en ${BRAND_NAME}. Confirma tu correo para activar tu cuenta.</p>
     ${button(verifyUrl, 'Confirmar mi correo')}
     <p style="font-size:12px;color:#9a9a9a;margin-top:20px;">Si no creaste esta cuenta, ignora este mensaje. Este enlace vence en 24 horas.</p>`,
  );
}

export function passwordResetTemplate(rawName: string, resetUrl: string) {
  const name = escapeHtml(rawName);
  return layout(
    'Restablece tu contraseña',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Recibimos una solicitud para restablecer tu contraseña.</p>
     ${button(resetUrl, 'Restablecer contraseña')}
     <p style="font-size:12px;color:#9a9a9a;margin-top:20px;">Si no solicitaste este cambio, puedes ignorar este mensaje. El enlace vence en 1 hora.</p>`,
  );
}

export function documentReviewedTemplate(
  rawName: string,
  rawDocumentLabel: string,
  approved: boolean,
  rawNote: string | undefined,
  dashboardUrl: string,
) {
  const name = escapeHtml(rawName);
  const documentLabel = escapeHtml(rawDocumentLabel);
  const note = rawNote ? escapeHtml(rawNote) : undefined;
  return layout(
    approved ? 'Documento aprobado' : 'Documento rechazado',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">
       Tu documento <strong>${documentLabel}</strong> fue
       ${approved ? '<span style="color:#0f6e5c;font-weight:600;">aprobado</span>' : '<span style="color:#b42318;font-weight:600;">rechazado</span>'}.
     </p>
     ${note ? `<p style="font-size:13px;background:#f7f7f5;border-radius:8px;padding:12px 14px;color:#4a4a4a;">Nota del revisor: ${note}</p>` : ''}
     ${button(dashboardUrl, 'Ver mi panel')}`,
  );
}

export function profileVerifiedTemplate(rawName: string, profileUrl: string) {
  const name = escapeHtml(rawName);
  return layout(
    '¡Tu perfil fue verificado!',
    `<h1 style="font-size:20px;margin:0 0 12px;">Felicidades, ${name} 🎉</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">
       Tu perfil profesional fue verificado y ya está visible públicamente en ${BRAND_NAME}, junto con tu N° MPPS y Colegio de Médicos de Monagas.
     </p>
     ${button(profileUrl, 'Ver mi perfil público')}`,
  );
}

export function profilePublishedTemplate(rawName: string, profileUrl: string, approved: number, required: number) {
  const name = escapeHtml(rawName);
  return layout(
    'Tu perfil ya es público',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">
       Tu perfil ya aparece en el directorio de ${BRAND_NAME}: tienes ${approved} de ${required} documentos aprobados,
       tu biografía y tu foto de perfil. Mientras terminamos de revisar el resto, se muestra como «verificación en curso».
       Con todos tus documentos aprobados obtienes el sello «Verificado» y puedes contratar Profesional Plus o Premium.
     </p>
     ${button(profileUrl, 'Ver mi perfil público')}`,
  );
}

export function paymentReviewedTemplate(
  rawName: string,
  approved: boolean,
  amountBs: string,
  rawNote: string | undefined,
  dashboardUrl: string,
) {
  const name = escapeHtml(rawName);
  const note = rawNote ? escapeHtml(rawNote) : undefined;
  return layout(
    approved ? 'Pago aprobado' : 'Pago rechazado',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">
       Tu reporte de Pago Móvil por <strong>Bs. ${amountBs}</strong> fue
       ${approved ? '<span style="color:#0f6e5c;font-weight:600;">aprobado y tu suscripción está activa</span>' : '<span style="color:#b42318;font-weight:600;">rechazado</span>'}.
     </p>
     ${note ? `<p style="font-size:13px;background:#f7f7f5;border-radius:8px;padding:12px 14px;color:#4a4a4a;">Nota: ${note}</p>` : ''}
     ${button(dashboardUrl, 'Ver mi panel')}`,
  );
}

function appointmentDetailsBlock(details: {
  doctorName?: string;
  specialty?: string;
  dateLabel: string;
  timeLabel: string;
  location?: string;
  reason?: string;
}): string {
  const rows: string[] = [];
  if (details.doctorName) rows.push(`<strong>Especialista:</strong> Dr(a). ${escapeHtml(details.doctorName)}`);
  if (details.specialty) rows.push(`<strong>Especialidad:</strong> ${escapeHtml(details.specialty)}`);
  rows.push(`<strong>Fecha:</strong> ${escapeHtml(details.dateLabel)}`);
  rows.push(`<strong>Hora:</strong> ${escapeHtml(details.timeLabel)}`);
  if (details.location) rows.push(`<strong>Lugar:</strong> ${escapeHtml(details.location)}`);
  if (details.reason) rows.push(`<strong>Motivo:</strong> ${escapeHtml(details.reason)}`);
  return `<div style="font-size:13px;background:#f7f7f5;border-radius:8px;padding:14px;color:#3a3a3a;margin-top:8px;line-height:1.8;">
    ${rows.join('<br/>')}
  </div>`;
}

export function appointmentRequestedPatientTemplate(
  rawPatientName: string,
  details: { doctorName: string; specialty?: string; dateLabel: string; timeLabel: string; location?: string },
) {
  const name = escapeHtml(rawPatientName);
  return layout(
    'Solicitud de cita recibida',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Recibimos tu solicitud de cita. Te avisaremos en cuanto el médico la confirme.</p>
     ${appointmentDetailsBlock(details)}`,
  );
}

export function appointmentRequestedProfessionalTemplate(
  rawDoctorName: string,
  details: { patientCode: string; dateLabel: string; timeLabel: string; reason?: string },
  dashboardUrl: string,
) {
  const name = escapeHtml(rawDoctorName);
  return layout(
    'Nueva solicitud de cita',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, Dr(a). ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Tienes una nueva solicitud de cita del paciente <strong>${escapeHtml(details.patientCode)}</strong>.</p>
     ${appointmentDetailsBlock(details)}
     ${button(dashboardUrl, 'Ver en mi agenda')}`,
  );
}

export function appointmentConfirmedTemplate(
  rawPatientName: string,
  details: { doctorName: string; specialty?: string; dateLabel: string; timeLabel: string; location?: string },
  manageUrl: string,
) {
  const name = escapeHtml(rawPatientName);
  return layout(
    'Cita confirmada',
    `<h1 style="font-size:20px;margin:0 0 12px;">¡Cita confirmada, ${name}!</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Tu cita fue confirmada por el médico. Adjuntamos el evento para tu calendario.</p>
     ${appointmentDetailsBlock(details)}
     ${button(manageUrl, 'Ver mi cita')}`,
  );
}

export function appointmentCancelledTemplate(
  rawRecipientName: string,
  details: { dateLabel: string; timeLabel: string; reason?: string },
  rawCancelledByLabel: string,
) {
  const name = escapeHtml(rawRecipientName);
  const cancelledBy = escapeHtml(rawCancelledByLabel);
  return layout(
    'Cita cancelada',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Tu cita fue cancelada por ${cancelledBy}.</p>
     ${appointmentDetailsBlock(details)}`,
  );
}

export function appointmentRescheduledTemplate(
  rawRecipientName: string,
  details: { dateLabel: string; timeLabel: string },
  manageUrl: string,
) {
  const name = escapeHtml(rawRecipientName);
  return layout(
    'Cita reprogramada',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Tu cita fue reprogramada a una nueva fecha y hora.</p>
     ${appointmentDetailsBlock(details)}
     ${button(manageUrl, 'Ver mi cita')}`,
  );
}

export function appointmentReminderTemplate(
  rawPatientName: string,
  details: { doctorName: string; specialty?: string; dateLabel: string; timeLabel: string; location?: string },
  rawHoursLabel: string,
) {
  const name = escapeHtml(rawPatientName);
  const hoursLabel = escapeHtml(rawHoursLabel);
  return layout(
    'Recordatorio de tu cita',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Te recordamos que tienes una cita ${hoursLabel}.</p>
     ${appointmentDetailsBlock(details)}`,
  );
}

export function contactMessageTemplate(
  rawProfessionalName: string,
  rawSenderName: string,
  rawSenderEmail: string,
  rawSenderPhone: string | undefined,
  rawContent: string,
) {
  const professionalName = escapeHtml(rawProfessionalName);
  const senderName = escapeHtml(rawSenderName);
  const senderEmail = escapeHtml(rawSenderEmail);
  const senderPhone = rawSenderPhone ? escapeHtml(rawSenderPhone) : undefined;
  const content = escapeHtml(rawContent);
  return layout(
    'Nuevo mensaje de un paciente',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, Dr(a). ${professionalName}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Recibiste un nuevo mensaje a través de tu perfil en ${BRAND_NAME}:</p>
     <div style="font-size:13px;background:#f7f7f5;border-radius:8px;padding:14px;color:#3a3a3a;margin-top:8px;">
       <p style="margin:0 0 6px;"><strong>${senderName}</strong> (${senderEmail}${senderPhone ? `, ${senderPhone}` : ''})</p>
       <p style="margin:0;white-space:pre-wrap;">${content}</p>
     </div>`,
  );
}

export function patientDataAccessRequestedTemplate(
  rawPatientName: string,
  rawDoctorName: string,
  scopeLabels: string[],
  panelUrl: string,
) {
  const name = escapeHtml(rawPatientName);
  const doctor = escapeHtml(rawDoctorName);
  const scopes = scopeLabels.map(escapeHtml).join(', ');
  return layout(
    'Solicitud de acceso a tus datos',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Dr(a). ${doctor} solicita ver tus ${scopes}.</p>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Nadie accede a tus datos sin tu autorización. Tú decides qué compartir y por cuánto tiempo, y puedes revocarlo cuando quieras. Si no reconoces esta solicitud, ignórala.</p>
     ${button(panelUrl, 'Revisar la solicitud')}`,
  );
}

export function mfaCodeTemplate(code: string) {
  return layout(
    'Código de acceso',
    `<h1 style="font-size:20px;margin:0 0 12px;">Tu código de acceso</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">Usa este código para completar el inicio de sesión en el panel administrativo. Vence en 10 minutos.</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${escapeHtml(code)}</p>
     <p style="font-size:13px;line-height:1.6;color:#8a8a8a;">Si no intentaste iniciar sesión, cambia tu contraseña de inmediato.</p>`,
  );
}

export function identityReviewedTemplate(rawName: string, approved: boolean, rawNote: string | undefined, profileUrl: string) {
  const name = escapeHtml(rawName);
  const note = rawNote ? escapeHtml(rawNote) : undefined;
  return layout(
    approved ? 'Identidad verificada' : 'Revisa tu foto de identificación',
    `<h1 style="font-size:20px;margin:0 0 12px;">Hola, ${name}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">
       ${
         approved
           ? 'Verificamos tu identidad. Tu ficha de paciente queda marcada como verificada.'
           : 'No pudimos verificar tu identidad con la foto que enviaste. Por tu privacidad la eliminamos; puedes subir una nueva desde tu perfil.'
       }
     </p>
     ${note ? `<p style="font-size:13px;background:#f7f7f5;border-radius:8px;padding:12px 14px;color:#4a4a4a;">Nota del revisor: ${note}</p>` : ''}
     ${button(profileUrl, 'Ver mi perfil')}`,
  );
}

export function organizationInvitationTemplate(
  rawOrganizationName: string,
  rawRoleLabel: string,
  acceptUrl: string,
  expiresInHours: number,
) {
  const organization = escapeHtml(rawOrganizationName);
  const role = escapeHtml(rawRoleLabel);
  return layout(
    'Invitación a un equipo',
    `<h1 style="font-size:20px;margin:0 0 12px;">Te invitaron a ${organization}</h1>
     <p style="font-size:14px;line-height:1.6;color:#3a3a3a;">
       Te invitaron a unirte al equipo de <strong>${organization}</strong> en ${BRAND_NAME} con el rol de <strong>${role}</strong>.
       Inicia sesión o crea tu cuenta con este mismo correo para aceptar.
     </p>
     ${button(acceptUrl, 'Ver la invitación')}
     <p style="font-size:13px;line-height:1.6;color:#8a8a8a;margin-top:16px;">
       El enlace vence en ${expiresInHours} horas y sirve una sola vez. Si no esperabas esta invitación, ignora este correo.
     </p>`,
  );
}
