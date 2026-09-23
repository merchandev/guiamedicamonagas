CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_professional_active_slot_key"
  ON "Appointment" ("professionalId", "startsAt")
  WHERE "status" IN ('PENDING', 'CONFIRMED');
