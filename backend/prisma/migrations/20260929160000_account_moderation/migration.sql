ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "moderationReason" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_deleted_inactive" CHECK ("deletedAt" IS NULL OR "isActive" = false);
