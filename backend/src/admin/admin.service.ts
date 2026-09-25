import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      pendingDocuments,
      pendingPayments,
      totalProfessionals,
      verifiedProfessionals,
      inReviewProfessionals,
      totalOrganizations,
      unreadMessages,
      recentAuditLogs,
    ] = await this.prisma.$transaction([
      this.prisma.professionalDocument.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.professionalProfile.count(),
      this.prisma.professionalProfile.count({ where: { verificationStatus: 'VERIFIED' } }),
      this.prisma.professionalProfile.count({ where: { verificationStatus: 'IN_REVIEW' } }),
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
