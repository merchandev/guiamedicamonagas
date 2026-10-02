-- Centro de notificaciones (ACT-0041): cada aviso puede llevar a una ruta
-- interna del sitio, guarda cuándo se leyó y cada usuario puede apagar los
-- correos opcionales (el aviso en la campana sigue llegando).

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- Los ya leídos no tienen fecha de lectura: se toma la de creación.
UPDATE "Notification" SET "readAt" = "createdAt" WHERE "isRead" = true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationEmailOptOut" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
