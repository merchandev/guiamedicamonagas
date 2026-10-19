-- Notificaciones push de la app móvil (Firebase Cloud Messaging).
--
-- Cada instalación de la app registra aquí su token de FCM (uno por teléfono).
-- El servidor envía el aviso a FCM, que lo entrega aunque la app esté cerrada.
-- A diferencia de "PushSubscription" (Web Push del navegador), esto es solo
-- para móvil. Nunca se guarda contenido clínico: el push lleva el mismo título
-- y texto que el aviso de la campana (sin motivo de consulta ni datos de ficha).

-- CreateEnum
CREATE TYPE "MobilePlatform" AS ENUM ('ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "MobilePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "MobilePlatform" NOT NULL DEFAULT 'ANDROID',
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushToken_token_key" ON "MobilePushToken"("token");

-- CreateIndex
CREATE INDEX "MobilePushToken_userId_idx" ON "MobilePushToken"("userId");

-- AddForeignKey
ALTER TABLE "MobilePushToken" ADD CONSTRAINT "MobilePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
