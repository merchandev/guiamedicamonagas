-- Eliminación definitiva de cuentas dadas de baja (solo SUPERADMIN). Una
-- cuenta eliminada queda inactiva y dada de baja para siempre.

ALTER TABLE "User" ADD COLUMN "purgedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT "User_purged_deleted" CHECK ("purgedAt" IS NULL OR ("deletedAt" IS NOT NULL AND "isActive" = false));
