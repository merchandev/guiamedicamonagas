-- =============================================================================
-- Endurecimiento previo a producción (ACT-0019)
-- =============================================================================

-- ClinicalNote: el contenido clínico pasa a un único campo cifrado. Las columnas
-- en claro se eliminan; si existiera alguna nota (hoy no hay endpoints que las
-- creen) la migración se detiene en vez de borrar historia clínica.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ClinicalNote") THEN
    RAISE EXCEPTION 'ClinicalNote tiene filas: migrarlas a clinicalDataEnc antes de eliminar las columnas en claro';
  END IF;
END $$;

ALTER TABLE "ClinicalNote" DROP COLUMN "chiefComplaint",
DROP COLUMN "diagnosis",
DROP COLUMN "medications",
DROP COLUMN "privateNotes",
DROP COLUMN "treatment",
ADD COLUMN     "clinicalDataEnc" TEXT NOT NULL;

-- Invitaciones a equipos de organizaciones (el rol global de la cuenta no cambia).
CREATE TABLE "OrganizationInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation"("tokenHash");
CREATE INDEX "OrganizationInvitation_organizationId_idx" ON "OrganizationInvitation"("organizationId");
CREATE INDEX "OrganizationInvitation_email_idx" ON "OrganizationInvitation"("email");

ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pago Móvil: una referencia del mismo banco emisor solo puede estar en un pago
-- vigente (no rechazado). La comprobación previa de la API no basta ante dos
-- reportes simultáneos; este índice lo garantiza en la base de datos. Como el
-- de Appointment, es un índice único parcial que schema.prisma no puede expresar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Payment"
    WHERE "status" <> 'REJECTED' AND "referenceNumber" IS NOT NULL
    GROUP BY "senderBankCode", "referenceNumber" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay referencias de Pago Móvil duplicadas vigentes: resolverlas antes de crear el índice único';
  END IF;
END $$;

CREATE UNIQUE INDEX "Payment_reference_active_unique"
  ON "Payment" ("senderBankCode", "referenceNumber")
  WHERE "status" <> 'REJECTED';
