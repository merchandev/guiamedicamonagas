import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    // Una cuenta eliminada definitivamente deja un registro anónimo («Cuenta
    // eliminada») del que cuelgan sus pagos: ya no es un médico y no se cuenta.
    const professionals = { user: { purgedAt: null } };
    const [
      pendingDocuments,
      pendingPayments,
      totalProfessionals,
      verifiedProfessionals,
      inReviewProfessionals,
      totalPatients,
      totalOrganizations,
      unreadMessages,
      recentAuditLogs,
    ] = await this.prisma.$transaction([
      this.prisma.professionalDocument.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.professionalProfile.count({ where: professionals }),
      this.prisma.professionalProfile.count({ where: { ...professionals, verificationStatus: 'VERIFIED' } }),
      this.prisma.professionalProfile.count({ where: { ...professionals, verificationStatus: 'IN_REVIEW' } }),
      // Las mismas cuentas que lista «Pacientes»: solo el total, sin datos de nadie.
      this.prisma.user.count({ where: { role: 'USER', purgedAt: null } }),
      this.prisma.organization.count(),
      this.prisma.contactMessage.count({ where: { isRead: false } }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { email: true, role: true } } },
      }),
    ]);

    return {
      pendingDocuments,
      pendingPayments,
      totalProfessionals,
      verifiedProfessionals,
      inReviewProfessionals,
      totalPatients,
      totalOrganizations,
      unreadMessages,
      // Los pacientes no se identifican aquí: sus datos solo se ven con la bóveda abierta.
      recentAuditLogs: recentAuditLogs.map(({ user, ...log }) => ({
        ...log,
        user: user ? { email: user.role === 'USER' ? 'Paciente (protegido)' : user.email } : null,
      })),
    };
  }
}
