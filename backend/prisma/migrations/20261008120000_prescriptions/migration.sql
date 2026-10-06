-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ISSUED', 'ANNULLED');

-- CreateTable
CREATE TABLE "PrescriptionPad" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "logoKey" TEXT,
    "signatureKey" TEXT,
    "sealKey" TEXT,
    "establishmentName" TEXT,
    "establishmentAddress" TEXT,
    "establishmentRif" TEXT,
    "establishmentPhone" TEXT,
    "city" TEXT,
    "defaultValidityDays" INTEGER NOT NULL DEFAULT 30,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "rulesVersion" TEXT,
    "rulesAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionPad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "codeLookup" TEXT NOT NULL,
    "codeEnc" TEXT NOT NULL,
    "patientId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "patientCedulaLookup" TEXT,
    "contentEnc" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "logoKey" TEXT,
    "signatureKey" TEXT,
    "sealKey" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ISSUED',
    "annulledAt" TIMESTAMP(3),
    "annulReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionPad_professionalId_key" ON "PrescriptionPad"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_codeLookup_key" ON "Prescription"("codeLookup");

-- CreateIndex
CREATE INDEX "Prescription_professionalId_issuedAt_idx" ON "Prescription"("professionalId", "issuedAt");

-- CreateIndex
CREATE INDEX "Prescription_patientId_issuedAt_idx" ON "Prescription"("patientId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_professionalId_number_key" ON "Prescription"("professionalId", "number");

-- AddForeignKey
ALTER TABLE "PrescriptionPad" ADD CONSTRAINT "PrescriptionPad_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Reglas que la base de datos hace cumplir aunque falle la API.
ALTER TABLE "PrescriptionPad" ADD CONSTRAINT "PrescriptionPad_validity_range" CHECK ("defaultValidityDays" BETWEEN 1 AND 365);
ALTER TABLE "PrescriptionPad" ADD CONSTRAINT "PrescriptionPad_last_number" CHECK ("lastNumber" >= 0);
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_number_positive" CHECK ("number" > 0);
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_expiry_after_issue" CHECK ("expiresAt" > "issuedAt");
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_annul_rules" CHECK (("status" = 'ANNULLED') = ("annulledAt" IS NOT NULL));
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_delivery_rules" CHECK ("patientId" IS NULL OR "deliveredAt" IS NOT NULL);

-- Un récipe emitido no cambia: solo se anula, se entrega a un paciente o se
-- re-cifra con otra clave (rotación). Número, código, huella, médico y fechas
-- quedan fijos.
CREATE FUNCTION "prescription_issued_is_fixed"() RETURNS trigger AS $$
BEGIN
  IF NEW."professionalId" = OLD."professionalId"
     AND NEW."number" = OLD."number"
     AND NEW."codeLookup" = OLD."codeLookup"
     AND NEW."contentHash" = OLD."contentHash"
     AND NEW."issuedAt" = OLD."issuedAt"
     AND NEW."expiresAt" = OLD."expiresAt"
     AND NOT (OLD."status" = 'ANNULLED' AND NEW."status" <> 'ANNULLED') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Un récipe emitido no se modifica: se anula y se emite otro';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Prescription_issued_is_fixed"
BEFORE UPDATE ON "Prescription"
FOR EACH ROW EXECUTE FUNCTION "prescription_issued_is_fixed"();
