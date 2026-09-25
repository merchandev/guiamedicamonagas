-- Código de paciente para compartir (texto y QR), directorio de pacientes
-- registrados por cada médico y sesiones de la bóveda de administración.
-- Solo agrega columnas y tablas: no toca datos existentes.

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "shareCodeCreatedAt" TIMESTAMP(3),
ADD COLUMN     "shareCodeEnc" TEXT,
ADD COLUMN     "shareCodeLookup" TEXT,
ADD COLUMN     "shareScopes" "PatientDataScope"[] DEFAULT ARRAY['IDENTITY', 'CONTACT', 'HEALTH']::"PatientDataScope"[];

-- CreateTable
CREATE TABLE "ProfessionalPatient" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessRevokedAt" TIMESTAMP(3),

    CONSTRAINT "ProfessionalPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientVaultSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "ipAddress" TEXT,

    CONSTRAINT "PatientVaultSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionalPatient_patientId_idx" ON "ProfessionalPatient"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalPatient_professionalId_patientId_key" ON "ProfessionalPatient"("professionalId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientVaultSession_tokenHash_key" ON "PatientVaultSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PatientVaultSession_userId_expiresAt_idx" ON "PatientVaultSession"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_shareCodeLookup_key" ON "PatientProfile"("shareCodeLookup");

-- AddForeignKey
ALTER TABLE "ProfessionalPatient" ADD CONSTRAINT "ProfessionalPatient_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalPatient" ADD CONSTRAINT "ProfessionalPatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientVaultSession" ADD CONSTRAINT "PatientVaultSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
