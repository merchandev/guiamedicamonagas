-- Código público del médico (texto/QR para que el paciente lo encuentre) y
-- nombre normalizado solo para el buscador. El código de los perfiles existentes
-- lo asigna la API al arrancar (ProfessionalsService.onApplicationBootstrap).

-- AlterTable
ALTER TABLE "ProfessionalProfile" ADD COLUMN     "publicCode" TEXT,
ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalProfile_publicCode_key" ON "ProfessionalProfile"("publicCode");

-- Relleno inicial del nombre de búsqueda (la API lo recalcula igual al arrancar).
UPDATE "ProfessionalProfile" SET "searchName" = trim(regexp_replace(lower(translate("firstName" || ' ' || "lastName", 'ÁÉÍÓÚÜÑÀÈÌÒÙáéíóúüñàèìòù', 'AEIOUUNAEIOUaeiouunaeiou')), '\s+', ' ', 'g'));
