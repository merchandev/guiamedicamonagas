-- =============================================================================
-- Privacidad y seguridad (auditoría 2026-09-23):
--   * SEC-05: datos personales y de salud del paciente cifrados en aplicación
--   * Consentimiento paciente → médico (PatientDataGrant)
--   * Analítica sin IP ni user-agent
--   * Versionado de aceptación legal por usuario
--   * Organizaciones con autoservicio, miembros y suscripción propia
--   * Geografía como datos, registros profesionales por jurisdicción
--   * Catálogo de bancos administrable y evidencia de la tasa BCV por cuota
-- =============================================================================

-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('MPPS_SACS', 'COLEGIO_MEDICOS', 'INPREMEDICO', 'ESPECIALIDAD', 'OTRO');
CREATE TYPE "OrganizationMemberRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR');
CREATE TYPE "PatientDataScope" AS ENUM ('IDENTITY', 'CONTACT', 'HEALTH');
CREATE TYPE "AffiliationStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ORGANIZATION';
ALTER TYPE "VerificationTokenType" ADD VALUE 'MFA_LOGIN';

-- -----------------------------------------------------------------------------
-- SEC-05: preservar cualquier dato de paciente en claro ANTES de eliminar las
-- columnas. La API, al arrancar, cifra cada fila de esta tabla temporal con
-- las claves de DATA_ENCRYPTION_KEYS, la vuelca en las columnas *Enc/*Lookup y
-- borra la tabla (ver src/patients/legacy-patient-data.migrator.ts). Así la
-- migración nunca pierde datos y el texto plano no sobrevive al primer
-- arranque de la versión nueva.
-- -----------------------------------------------------------------------------
CREATE TABLE "_PatientPlaintextLegacy" AS
SELECT "id", "cedula", "phone", "birthDate", "sex", "bloodType", "allergies",
       "emergencyAddress", "emergencyMedicalPhone", "isHealthy", "conditionSummary",
       "medications", "treatingDoctors"
FROM "PatientProfile"
WHERE "cedula" IS NOT NULL OR "phone" IS NOT NULL OR "birthDate" IS NOT NULL
   OR "sex" IS NOT NULL OR "bloodType" IS NOT NULL OR "allergies" IS NOT NULL
   OR "emergencyAddress" IS NOT NULL OR "emergencyMedicalPhone" IS NOT NULL
   OR "isHealthy" = true OR "conditionSummary" IS NOT NULL
   OR "medications" IS NOT NULL OR "treatingDoctors" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "_PatientPlaintextLegacy") THEN
    DROP TABLE "_PatientPlaintextLegacy";
  END IF;
END $$;

-- DropIndex
DROP INDEX "Payment_referenceNumber_idx";
DROP INDEX "PatientProfile_cedula_key";
DROP INDEX "PatientProfile_phone_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legalAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "privacyVersionAccepted" TEXT,
ADD COLUMN     "termsVersionAccepted" TEXT;

ALTER TABLE "VerificationToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeHash" TEXT;

ALTER TABLE "ProfessionalProfile" ADD COLUMN     "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "directoryScore" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Organization" ADD COLUMN     "insurers" JSONB,
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "paymentMethods" JSONB,
ADD COLUMN     "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "rif" TEXT,
ADD COLUMN     "services" JSONB,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'VERIFIED',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- Las organizaciones existentes las creó un administrador: ya están verificadas.
UPDATE "Organization" SET "verifiedAt" = "createdAt" WHERE "verifiedAt" IS NULL;

ALTER TABLE "Subscription" ADD COLUMN     "organizationId" TEXT,
ALTER COLUMN "professionalId" DROP NOT NULL;

-- Una suscripción pertenece a un profesional O a una organización, nunca a ambos ni a ninguno.
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_single_owner_check"
  CHECK (("professionalId" IS NOT NULL) <> ("organizationId" IS NOT NULL));

ALTER TABLE "SubscriptionInstallment" ADD COLUMN     "bcvRate" DECIMAL(14,4),
ADD COLUMN     "priceUsd" DECIMAL(10,2),
ADD COLUMN     "rateCapturedAt" TIMESTAMP(3),
ADD COLUMN     "rateEffectiveDate" TEXT,
ADD COLUMN     "rateSource" TEXT;

-- Analítica: se elimina la IP y el user-agent históricos.
ALTER TABLE "AnalyticsEvent" DROP COLUMN "ipAddress",
DROP COLUMN "userAgent";

ALTER TABLE "PatientProfile" DROP COLUMN "allergies",
DROP COLUMN "birthDate",
DROP COLUMN "bloodType",
DROP COLUMN "cedula",
DROP COLUMN "conditionSummary",
DROP COLUMN "emergencyAddress",
DROP COLUMN "emergencyMedicalPhone",
DROP COLUMN "isHealthy",
DROP COLUMN "medications",
DROP COLUMN "phone",
DROP COLUMN "sex",
DROP COLUMN "treatingDoctors",
ADD COLUMN     "cedulaEnc" TEXT,
ADD COLUMN     "cedulaLookup" TEXT,
ADD COLUMN     "createdByProfessionalId" TEXT,
ADD COLUMN     "healthDataEnc" TEXT,
ADD COLUMN     "phoneEnc" TEXT,
ADD COLUMN     "phoneLookup" TEXT;

-- Fichas walk-in existentes: el médico que las creó (cita manual) conserva
-- acceso a los datos que él mismo cargó.
UPDATE "PatientProfile" p
SET "createdByProfessionalId" = a."professionalId"
FROM (
  SELECT DISTINCT ON ("patientId") "patientId", "professionalId"
  FROM "Appointment"
  WHERE "source" = 'PHONE'
  ORDER BY "patientId", "createdAt" ASC
) a
WHERE p."id" = a."patientId" AND p."userId" IS NULL;

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Parish" (
    "id" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parish_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfessionalRegistration" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "type" "RegistrationType" NOT NULL,
    "issuer" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "number" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationProfessional" (
    "organizationId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "OrganizationProfessional_pkey" PRIMARY KEY ("organizationId","professionalId")
);

CREATE TABLE "FinancialInstitution" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supportsPagoMovil" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialInstitution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientDataGrant" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "scopes" "PatientDataScope"[],
    "reason" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "grantedById" TEXT,
    "consentVersion" TEXT NOT NULL,

    CONSTRAINT "PatientDataGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_slug_key" ON "State"("slug");
CREATE UNIQUE INDEX "State_name_key" ON "State"("name");
CREATE UNIQUE INDEX "Municipality_stateId_slug_key" ON "Municipality"("stateId", "slug");
CREATE UNIQUE INDEX "Municipality_stateId_name_key" ON "Municipality"("stateId", "name");
CREATE UNIQUE INDEX "Parish_municipalityId_slug_key" ON "Parish"("municipalityId", "slug");
CREATE UNIQUE INDEX "ProfessionalRegistration_professionalId_type_issuer_key" ON "ProfessionalRegistration"("professionalId", "type", "issuer");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");
CREATE INDEX "OrganizationProfessional_professionalId_status_idx" ON "OrganizationProfessional"("professionalId", "status");
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE UNIQUE INDEX "FinancialInstitution_code_key" ON "FinancialInstitution"("code");
CREATE INDEX "PatientDataGrant_patientId_professionalId_idx" ON "PatientDataGrant"("patientId", "professionalId");
CREATE INDEX "PatientDataGrant_professionalId_expiresAt_idx" ON "PatientDataGrant"("professionalId", "expiresAt");
CREATE INDEX "ProfessionalProfile_directoryScore_idx" ON "ProfessionalProfile"("directoryScore");
CREATE INDEX "Organization_verificationStatus_isPublished_idx" ON "Organization"("verificationStatus", "isPublished");
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");
CREATE INDEX "Payment_senderBankCode_referenceNumber_idx" ON "Payment"("senderBankCode", "referenceNumber");
CREATE UNIQUE INDEX "PatientProfile_cedulaLookup_key" ON "PatientProfile"("cedulaLookup");
CREATE UNIQUE INDEX "PatientProfile_phoneLookup_key" ON "PatientProfile"("phoneLookup");

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Parish" ADD CONSTRAINT "Parish_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalRegistration" ADD CONSTRAINT "ProfessionalRegistration_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationProfessional" ADD CONSTRAINT "OrganizationProfessional_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationProfessional" ADD CONSTRAINT "OrganizationProfessional_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_createdByProfessionalId_fkey" FOREIGN KEY ("createdByProfessionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientDataGrant" ADD CONSTRAINT "PatientDataGrant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDataGrant" ADD CONSTRAINT "PatientDataGrant_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDataGrant" ADD CONSTRAINT "PatientDataGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Registros profesionales: se trasladan los números ya cargados.
-- -----------------------------------------------------------------------------
INSERT INTO "ProfessionalRegistration" ("id", "professionalId", "type", "issuer", "jurisdiction", "number", "verifiedAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'MPPS_SACS', 'MPPS (SACS)', 'Nacional', trim("mppsNumber"),
       CASE WHEN "verificationStatus" = 'VERIFIED' THEN "verifiedAt" END, CURRENT_TIMESTAMP
FROM "ProfessionalProfile" WHERE coalesce(trim("mppsNumber"), '') <> '';

INSERT INTO "ProfessionalRegistration" ("id", "professionalId", "type", "issuer", "jurisdiction", "number", "verifiedAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'COLEGIO_MEDICOS', 'Colegio de Médicos del Estado Monagas', 'Monagas', trim("colmedMonagasNumber"),
       CASE WHEN "verificationStatus" = 'VERIFIED' THEN "verifiedAt" END, CURRENT_TIMESTAMP
FROM "ProfessionalProfile" WHERE coalesce(trim("colmedMonagasNumber"), '') <> '';

INSERT INTO "ProfessionalRegistration" ("id", "professionalId", "type", "issuer", "jurisdiction", "number", "verifiedAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'INPREMEDICO', 'INPREMEDICO', 'Nacional', trim("inpremedicoNumber"),
       CASE WHEN "verificationStatus" = 'VERIFIED' THEN "verifiedAt" END, CURRENT_TIMESTAMP
FROM "ProfessionalProfile" WHERE coalesce(trim("inpremedicoNumber"), '') <> '';

-- -----------------------------------------------------------------------------
-- Geografía: las 24 entidades federales. Solo Monagas queda activa (lanzamiento).
-- -----------------------------------------------------------------------------
INSERT INTO "State" ("id", "slug", "name", "isActive") VALUES
  (gen_random_uuid()::text, 'amazonas', 'Amazonas', false),
  (gen_random_uuid()::text, 'anzoategui', 'Anzoátegui', false),
  (gen_random_uuid()::text, 'apure', 'Apure', false),
  (gen_random_uuid()::text, 'aragua', 'Aragua', false),
  (gen_random_uuid()::text, 'barinas', 'Barinas', false),
  (gen_random_uuid()::text, 'bolivar', 'Bolívar', false),
  (gen_random_uuid()::text, 'carabobo', 'Carabobo', false),
  (gen_random_uuid()::text, 'cojedes', 'Cojedes', false),
  (gen_random_uuid()::text, 'delta-amacuro', 'Delta Amacuro', false),
  (gen_random_uuid()::text, 'distrito-capital', 'Distrito Capital', false),
  (gen_random_uuid()::text, 'falcon', 'Falcón', false),
  (gen_random_uuid()::text, 'guarico', 'Guárico', false),
  (gen_random_uuid()::text, 'la-guaira', 'La Guaira', false),
  (gen_random_uuid()::text, 'lara', 'Lara', false),
  (gen_random_uuid()::text, 'merida', 'Mérida', false),
  (gen_random_uuid()::text, 'miranda', 'Miranda', false),
  (gen_random_uuid()::text, 'monagas', 'Monagas', true),
  (gen_random_uuid()::text, 'nueva-esparta', 'Nueva Esparta', false),
  (gen_random_uuid()::text, 'portuguesa', 'Portuguesa', false),
  (gen_random_uuid()::text, 'sucre', 'Sucre', false),
  (gen_random_uuid()::text, 'tachira', 'Táchira', false),
  (gen_random_uuid()::text, 'trujillo', 'Trujillo', false),
  (gen_random_uuid()::text, 'yaracuy', 'Yaracuy', false),
  (gen_random_uuid()::text, 'zulia', 'Zulia', false);

INSERT INTO "Municipality" ("id", "stateId", "slug", "name")
SELECT gen_random_uuid()::text, s."id", m.slug, m.name
FROM "State" s
CROSS JOIN (VALUES
  ('maturin', 'Maturín'),
  ('acosta', 'Acosta'),
  ('aguasay', 'Aguasay'),
  ('bolivar', 'Bolívar'),
  ('caripe', 'Caripe'),
  ('cedeno', 'Cedeño'),
  ('ezequiel-zamora', 'Ezequiel Zamora'),
  ('libertador', 'Libertador'),
  ('piar', 'Piar'),
  ('punceres', 'Punceres'),
  ('santa-barbara', 'Santa Bárbara'),
  ('sotillo', 'Sotillo'),
  ('uracoa', 'Uracoa')
) AS m(slug, name)
WHERE s."slug" = 'monagas';

-- -----------------------------------------------------------------------------
-- Bancos (antes fijos en frontend/src/lib/monagas.ts).
-- -----------------------------------------------------------------------------
INSERT INTO "FinancialInstitution" ("id", "code", "name", "updatedAt") VALUES
  (gen_random_uuid()::text, '0102', 'Banco de Venezuela', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0104', 'Banco Venezolano de Crédito', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0105', 'Banco Mercantil', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0108', 'Banco Provincial', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0114', 'Bancaribe', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0115', 'Banco Exterior', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0128', 'Banco Caroní', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0134', 'Banesco', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0137', 'Banco Sofitasa', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0138', 'Banco Plaza', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0151', 'BFC Banco Fondo Común', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0156', '100% Banco', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0157', 'DelSur Banco Universal', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0163', 'Banco del Tesoro', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0166', 'Banco Agrícola de Venezuela', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0168', 'Bancrecer', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0169', 'Mi Banco', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0171', 'Banco Activo', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0172', 'Bancamiga', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0174', 'Banplus', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0175', 'Banco Bicentenario', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0177', 'Banco de la Fuerza Armada (Banfanb)', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '0191', 'Banco Nacional de Crédito (BNC)', CURRENT_TIMESTAMP);
