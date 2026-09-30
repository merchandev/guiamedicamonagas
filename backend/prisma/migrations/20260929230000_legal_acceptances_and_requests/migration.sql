-- Evidencia de aceptación de cada texto legal (quién, qué versión, cuándo y
-- desde dónde) y canal de reclamos, denuncias y solicitudes legales.

-- CreateEnum
CREATE TYPE "LegalDocument" AS ENUM ('TERMS', 'PRIVACY', 'PROFESSIONAL_TERMS', 'PATIENT_HEALTH_CONSENT', 'AGE_DECLARATION');

-- CreateEnum
CREATE TYPE "LegalRequestCategory" AS ENUM ('PRIVACY_RIGHTS', 'ACCOUNT_DELETION', 'UNAUTHORIZED_ACCESS', 'FALSE_IDENTITY', 'FALSE_CREDENTIAL', 'SUSPENDED_PROFESSIONAL', 'MISLEADING_CONTENT', 'SECURITY', 'BILLING', 'INTELLECTUAL_PROPERTY', 'AUTHORITY_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "LegalRequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "document" "LegalDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalRequest" (
    "id" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "category" "LegalRequestCategory" NOT NULL,
    "status" "LegalRequestStatus" NOT NULL DEFAULT 'OPEN',
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "userId" TEXT,
    "subjectUrl" TEXT,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAcceptance_userId_document_idx" ON "LegalAcceptance"("userId", "document");

-- CreateIndex
CREATE UNIQUE INDEX "LegalRequest_ticket_key" ON "LegalRequest"("ticket");

-- CreateIndex
CREATE INDEX "LegalRequest_status_createdAt_idx" ON "LegalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LegalRequest_category_idx" ON "LegalRequest"("category");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequest" ADD CONSTRAINT "LegalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalRequest" ADD CONSTRAINT "LegalRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- La evidencia de aceptación es de solo inserción. Lo único permitido es
-- anonimizarla (userId, IP y navegador a NULL) al eliminar una cuenta.
CREATE FUNCTION "legal_acceptance_append_only"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."id" = OLD."id"
     AND NEW."document" = OLD."document"
     AND NEW."version" = OLD."version"
     AND NEW."context" = OLD."context"
     AND NEW."acceptedAt" = OLD."acceptedAt"
     AND (NEW."userId" IS NOT DISTINCT FROM OLD."userId" OR NEW."userId" IS NULL)
     AND (NEW."ipAddress" IS NOT DISTINCT FROM OLD."ipAddress" OR NEW."ipAddress" IS NULL)
     AND (NEW."userAgent" IS NOT DISTINCT FROM OLD."userAgent" OR NEW."userAgent" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LegalAcceptance es de solo inserción';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LegalAcceptance_append_only"
  BEFORE UPDATE OR DELETE ON "LegalAcceptance"
  FOR EACH ROW EXECUTE FUNCTION "legal_acceptance_append_only"();
