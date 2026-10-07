-- Sin plan gratis (ACT-0052): un médico aparece en el directorio con un plan
-- pagado o con la prueba gratuita de 14 días del plan Plus, que empieza sola la
-- primera vez que su perfil puede publicarse con el 100% de los documentos
-- aprobados.

-- CreateEnum
CREATE TYPE "TrialNotice" AS ENUM ('NONE', 'ENDS_IN_3_DAYS', 'ENDS_IN_1_DAY', 'CLOSED');

-- AlterTable
ALTER TABLE "ProfessionalProfile" ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialNotice" "TrialNotice" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "trialStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ProfessionalProfile_trialNotice_trialEndsAt_idx" ON "ProfessionalProfile"("trialNotice", "trialEndsAt");

-- El Perfil Básico deja de ofrecerse (la fila queda: FREE es «sin plan»).
UPDATE "SubscriptionPlan"
SET "isActive" = false, "name" = 'Sin plan', "features" = '[]'::jsonb,
    "description" = 'No se ofrece: sin un plan activo el perfil no aparece en el directorio.'
WHERE "tier" = 'FREE';

-- Perfiles que ya estaban publicados sin plan: los verificados empiezan hoy su
-- prueba; los demás dejan de mostrarse hasta tener un plan.
UPDATE "ProfessionalProfile"
SET "planTier" = 'PROFESSIONAL_PLUS', "trialStartedAt" = now(), "trialEndsAt" = now() + interval '14 days'
WHERE "planTier" = 'FREE' AND "isPublished" AND "verificationStatus" = 'VERIFIED';

UPDATE "ProfessionalProfile" SET "isPublished" = false WHERE "planTier" = 'FREE' AND "isPublished";
