import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { appointmentReminderTemplate } from '../mail/mail.templates';

const DATE_LABEL_FMT: Intl.DateTimeFormatOptions = { dateStyle: 'full' };
const TIME_LABEL_FMT: Intl.DateTimeFormatOptions = { timeStyle: 'short' };
const WINDOW_MS = 10 * 60_000; // tolerancia = intervalo del cron

/** Envía recordatorios de cita 24h y 2h antes de la hora agendada. */
@Injectable()
export class AppointmentRemindersService {
  private readonly logger = new Logger(AppointmentRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/10 * * * *')
  async send24hReminders() {
    await this.sendRemindersForWindow(24 * 60 * 60_000, 'reminderSentAt', 'mañana');
  }

  @Cron('*/10 * * * *')
  async send2hReminders() {
    await this.sendRemindersForWindow(2 * 60 * 60_000, 'reminder2hSentAt', 'en 2 horas');
  }

  private async sendRemindersForWindow(
    offsetMs: number,
    sentField: 'reminderSentAt' | 'reminder2hSentAt',
    hoursLabel: string,
  ) {
    const target = new Date(Date.now() + offsetMs);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        [sentField]: null,
        startsAt: { gte: new Date(target.getTime() - WINDOW_MS), lte: new Date(target.getTime() + WINDOW_MS) },
      },
      include: {
        patient: { include: { user: { select: { email: true } } } },
        professional: { include: { specialties: { include: { specialty: true } } } },
        location: true,
      },
    });

    for (const appt of appointments) {
      if (!appt.patient.userId || !appt.patient.user) continue;
      try {
        const dateLabel = appt.startsAt.toLocaleDateString('es-VE', DATE_LABEL_FMT);
        const timeLabel = appt.startsAt.toLocaleTimeString('es-VE', TIME_LABEL_FMT);
        const doctorName = `${appt.professional.firstName} ${appt.professional.lastName}`;

        await this.notifications.notify({
          userId: appt.patient.userId,
          type: 'APPOINTMENT_REMINDER',
          title: 'Recordatorio de cita',
          content: `Dr(a). ${doctorName} — ${dateLabel} ${timeLabel}`,
          email: {
            to: appt.patient.user.email,
            subject: 'Recordatorio de tu cita — Guía Médica Monagas',
            template: 'appointment_reminder',
            html: appointmentReminderTemplate(
              appt.patient.firstName ?? 'Paciente',
              {
                doctorName,
                specialty: appt.professional.specialties[0]?.specialty.name,
                dateLabel,
                timeLabel,
                location: appt.location?.address ?? undefined,
              },
              hoursLabel,
            ),
          },
        });

        await this.prisma.appointment.update({ where: { id: appt.id }, data: { [sentField]: new Date() } });
      } catch (error) {
        this.logger.error(`Fallo al enviar recordatorio para la cita ${appt.id}: ${(error as Error).message}`);
      }
    }
  }
}
