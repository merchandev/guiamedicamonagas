-- Calendario de la agenda e historial de citas (ACT-0042).
-- Migración aditiva: no cambia ni borra datos existentes.

-- CreateEnum
CREATE TYPE "AppointmentEventType" AS ENUM ('CREATED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentActor" AS ENUM ('PATIENT', 'PROFESSIONAL', 'SYSTEM', 'ADMIN');

-- Límites para los pacientes: hasta cuándo pueden reservar y con cuánta antelación.
-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "bookingWindowDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "minNoticeMinutes" INTEGER NOT NULL DEFAULT 120;

-- CreateTable
CREATE TABLE "AppointmentEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type" "AppointmentEventType" NOT NULL,
    "actor" "AppointmentActor" NOT NULL,
    "actorUserId" TEXT,
    "previousStartsAt" TIMESTAMP(3),
    "newStartsAt" TIMESTAMP(3),
    "outsideSchedule" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentEvent_appointmentId_createdAt_idx" ON "AppointmentEvent"("appointmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Las citas que ya existen reciben su historial con lo que se sabe de ellas:
-- quién la creó (por el canal) y, si se canceló, quién y cuándo.
INSERT INTO "AppointmentEvent" ("id", "appointmentId", "type", "actor", "createdAt")
SELECT gen_random_uuid()::text, "id", 'CREATED',
       CASE "source" WHEN 'WEB' THEN 'PATIENT'::"AppointmentActor"
                     WHEN 'PHONE' THEN 'PROFESSIONAL'::"AppointmentActor"
                     ELSE 'SYSTEM'::"AppointmentActor" END,
       "createdAt"
FROM "Appointment";

INSERT INTO "AppointmentEvent" ("id", "appointmentId", "type", "actor", "createdAt")
SELECT gen_random_uuid()::text, "id", 'CANCELLED',
       CASE "cancelledBy" WHEN 'PATIENT' THEN 'PATIENT'::"AppointmentActor"
                          WHEN 'PROFESSIONAL' THEN 'PROFESSIONAL'::"AppointmentActor"
                          ELSE 'SYSTEM'::"AppointmentActor" END,
       COALESCE("cancelledAt", "updatedAt")
FROM "Appointment"
WHERE "status" = 'CANCELLED';

-- Anti-solapamiento: el índice único parcial (init) solo impide dos citas
-- activas con el MISMO inicio. Desde el calendario el médico puede atender
-- fuera de la cuadrícula (10:00–10:30 y 10:15–10:45 no empiezan igual pero se
-- solapan): esta restricción lo impide para las citas activas de un médico,
-- también ante dos cambios simultáneos. Prisma no la expresa en el schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_overlap"
  EXCLUDE USING gist ("professionalId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
