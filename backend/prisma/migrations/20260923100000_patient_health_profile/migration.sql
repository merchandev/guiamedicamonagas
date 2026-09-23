-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "conditionSummary" TEXT,
ADD COLUMN     "emergencyAddress" TEXT,
ADD COLUMN     "emergencyMedicalPhone" TEXT,
ADD COLUMN     "idPhotoKey" TEXT,
ADD COLUMN     "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "isHealthy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "medications" JSONB,
ADD COLUMN     "photoKey" TEXT,
ADD COLUMN     "treatingDoctors" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_cedula_key" ON "PatientProfile"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_phone_key" ON "PatientProfile"("phone");

