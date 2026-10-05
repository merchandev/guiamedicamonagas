-- «Quiero que me contacte» y apariciones en búsquedas (ACT-0045): el pedido de
-- contacto amplía ContactMessage (solo columnas nuevas, nulas o con valor por
-- defecto) y las apariciones son conteos diarios sin datos de quien buscó.

-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('OPEN', 'CONTACTED', 'CLOSED', 'WITHDRAWN', 'EXPIRED');

-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "identityVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patientUserId" TEXT,
ADD COLUMN     "preferredChannel" TEXT,
ADD COLUMN     "preferredTime" TEXT,
ADD COLUMN     "requestStatus" "ContactRequestStatus",
ADD COLUMN     "statusChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SearchAppearance" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "specialtySlug" TEXT NOT NULL DEFAULT '',
    "municipality" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SearchAppearance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchAppearance_professionalId_day_specialtySlug_municipal_key" ON "SearchAppearance"("professionalId", "day", "specialtySlug", "municipality");

-- CreateIndex
CREATE INDEX "ContactMessage_professionalId_createdAt_idx" ON "ContactMessage"("professionalId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactMessage_patientUserId_createdAt_idx" ON "ContactMessage"("patientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactMessage_requestStatus_expiresAt_idx" ON "ContactMessage"("requestStatus", "expiresAt");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchAppearance" ADD CONSTRAINT "SearchAppearance_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Canal preferido de una lista fija y conteos nunca negativos.
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_preferredChannel_check" CHECK ("preferredChannel" IS NULL OR "preferredChannel" IN ('PHONE', 'WHATSAPP', 'EMAIL'));
ALTER TABLE "SearchAppearance" ADD CONSTRAINT "SearchAppearance_count_check" CHECK ("count" >= 0);
