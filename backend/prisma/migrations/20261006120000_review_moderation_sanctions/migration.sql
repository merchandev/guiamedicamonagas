-- Moderación de valoraciones y sanciones por días (ACT-0044): sanciones de
-- opiniones o de la cuenta, suspensión temporal que vence sola y la categoría
-- de reclamos «Valoración abusiva o falsa». Solo agrega.

-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('REVIEWS', 'ACCOUNT');

-- AlterEnum
ALTER TYPE "LegalRequestCategory" ADD VALUE 'REVIEW_ABUSE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserSanction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SanctionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "reviewId" TEXT,
    "createdById" TEXT,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "liftReason" TEXT,
    "endNoticeSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSanction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSanction_userId_type_idx" ON "UserSanction"("userId", "type");

-- CreateIndex
CREATE INDEX "UserSanction_endsAt_idx" ON "UserSanction"("endsAt");

-- AddForeignKey
ALTER TABLE "UserSanction" ADD CONSTRAINT "UserSanction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSanction" ADD CONSTRAINT "UserSanction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSanction" ADD CONSTRAINT "UserSanction_liftedById_fkey" FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indefinida solo la de opiniones; si tiene fin, es posterior al inicio.
ALTER TABLE "UserSanction" ADD CONSTRAINT "UserSanction_end_rules" CHECK (("endsAt" IS NOT NULL OR "type" = 'REVIEWS') AND ("endsAt" IS NULL OR "endsAt" > "startsAt"));
