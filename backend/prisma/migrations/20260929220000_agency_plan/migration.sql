-- Plan Agencia: nuevo nivel de médico (todo lo de Premium + videos en
-- colaboración con la Guía) y video de presentación de YouTube en la ficha.

ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'AGENCY' AFTER 'PREMIUM';

ALTER TABLE "ProfessionalProfile" ADD COLUMN "presentationVideoId" TEXT;
-- Solo el ID de 11 caracteres de YouTube: nunca una URL libre que termine
-- dentro de un iframe.
ALTER TABLE "ProfessionalProfile" ADD CONSTRAINT "ProfessionalProfile_presentationVideoId_format"
  CHECK ("presentationVideoId" IS NULL OR "presentationVideoId" ~ '^[A-Za-z0-9_-]{11}$');
