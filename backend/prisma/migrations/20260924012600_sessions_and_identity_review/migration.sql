-- SEC-02: versión de sesión en cada access token. Los tokens ya emitidos no
-- traen `tv` y se tratan como versión 0, así que nadie pierde la sesión al
-- aplicar esta migración.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Revisión administrativa de la foto de identificación del paciente.
ALTER TABLE "PatientProfile" ADD COLUMN "identityReviewNote" TEXT,
ADD COLUMN "identityReviewedAt" TIMESTAMP(3),
ADD COLUMN "identityReviewedById" TEXT;

CREATE INDEX "PatientProfile_identityStatus_idx" ON "PatientProfile"("identityStatus");

ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_identityReviewedById_fkey" FOREIGN KEY ("identityReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
