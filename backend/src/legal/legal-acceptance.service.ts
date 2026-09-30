import { Injectable } from '@nestjs/common';
import type { LegalDocument, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LEGAL_VERSIONS, requiredLegalDocuments } from '../common/legal-versions';

type Db = Pick<PrismaService, 'legalAcceptance'> | Prisma.TransactionClient;

export interface AcceptanceContext {
  context: 'REGISTER' | 'UPDATE';
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Evidencia de aceptación de los textos legales (Decreto-Ley sobre Mensajes
 * de Datos y Firmas Electrónicas: la aceptación electrónica vale como
 * prueba). Cada aceptación es una fila nueva con la versión vigente.
 */
@Injectable()
export class LegalAcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  async record(db: Db, userId: string, documents: LegalDocument[], { context, ipAddress, userAgent }: AcceptanceContext) {
    if (!documents.length) return;
    await db.legalAcceptance.createMany({
      data: documents.map((document) => ({
        userId,
        document,
        version: LEGAL_VERSIONS[document],
        context,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent?.slice(0, 300) ?? null,
      })),
    });
  }

  /** Documentos que el usuario todavía no aceptó en su versión vigente. */
  async pendingFor(userId: string, role: Role): Promise<LegalDocument[]> {
    const required = requiredLegalDocuments(role);
    const accepted = await this.prisma.legalAcceptance.findMany({
      where: { userId, document: { in: required } },
      select: { document: true, version: true },
    });
    return required.filter(
      (document) => !accepted.some((row) => row.document === document && row.version === LEGAL_VERSIONS[document]),
    );
  }

  /** Historial de aceptaciones del propio usuario (centro de privacidad y descarga de datos). */
  listOwn(userId: string) {
    return this.prisma.legalAcceptance.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
      select: { document: true, version: true, context: true, acceptedAt: true },
    });
  }
}
