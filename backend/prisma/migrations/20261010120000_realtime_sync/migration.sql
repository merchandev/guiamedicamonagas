-- Sincronización en tiempo real (ACT-0049): bandeja de eventos («outbox»).
--
-- Cada tabla con datos que alguien ve en la web o en la app anota aquí, desde un
-- disparador y en la misma transacción del cambio, qué fila cambió y los
-- identificadores que dicen a quién le importa. Así ningún camino queda afuera
-- (web, app, administración, tareas programadas o SQL directo) y un evento
-- solo existe si el cambio se confirmó. Nunca se copia el contenido de la fila.
-- La API lee la bandeja, avisa por su canal en tiempo real (Socket.IO) a las
-- salas autorizadas y borra lo que tiene más de un día.

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "rowId" TEXT,
    "keys" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RealtimeEvent_dispatchedAt_id_idx" ON "RealtimeEvent"("dispatchedAt", "id");

-- CreateIndex
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");

-- Argumentos del disparador:
--   'columna'   identificador que se copia a "keys" (si cambia, también el anterior como old_columna);
--   '+columna'  solo cuenta un UPDATE que cambie alguna de estas columnas;
--   '-columna'  un UPDATE que solo cambie estas columnas (o "updatedAt") no avisa.
CREATE FUNCTION "realtime_capture"() RETURNS trigger AS $$
DECLARE
  arg TEXT;
  col TEXT;
  watched TEXT[] := ARRAY[]::TEXT[];
  ignored TEXT[] := ARRAY['updatedAt'];
  key_cols TEXT[] := ARRAY[]::TEXT[];
  new_row JSONB;
  old_row JSONB;
  src JSONB;
  ref JSONB := '{}'::JSONB;
BEGIN
  -- Sin argumentos (catálogos), TG_ARGV es NULL y no un arreglo vacío.
  FOREACH arg IN ARRAY COALESCE(TG_ARGV, ARRAY[]::TEXT[]) LOOP
    IF left(arg, 1) = '+' THEN
      watched := array_append(watched, substr(arg, 2));
    ELSIF left(arg, 1) = '-' THEN
      ignored := array_append(ignored, substr(arg, 2));
    ELSE
      key_cols := array_append(key_cols, arg);
    END IF;
  END LOOP;

  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW); END IF;

  IF TG_OP = 'UPDATE' THEN
    IF cardinality(watched) > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM unnest(watched) AS w(c) WHERE (new_row -> w.c) IS DISTINCT FROM (old_row -> w.c)
      ) THEN
        RETURN NULL;
      END IF;
    ELSIF (new_row - ignored) = (old_row - ignored) THEN
      RETURN NULL;
    END IF;
  END IF;

  src := COALESCE(new_row, old_row);
  FOREACH col IN ARRAY key_cols LOOP
    ref := ref || jsonb_build_object(col, src -> col);
    IF TG_OP = 'UPDATE' AND (old_row -> col) IS DISTINCT FROM (new_row -> col) THEN
      ref := ref || jsonb_build_object('old_' || col, old_row -> col);
    END IF;
  END LOOP;

  INSERT INTO "RealtimeEvent" ("source", "op", "rowId", "keys")
  VALUES (TG_TABLE_NAME, TG_OP, src ->> 'id', ref);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Agenda y citas
CREATE TRIGGER "Appointment_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Appointment"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId', 'patientId', '-confirmationSentAt', '-reminderSentAt');
CREATE TRIGGER "Schedule_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Schedule"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');
CREATE TRIGGER "ScheduleBlock_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ScheduleBlock"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('scheduleId');
CREATE TRIGGER "ScheduleException_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ScheduleException"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('scheduleId');
CREATE TRIGGER "ClinicalNote_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ClinicalNote"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');
CREATE TRIGGER "FinanceRecord_realtime" AFTER INSERT OR UPDATE OR DELETE ON "FinanceRecord"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');

-- Avisos y pedidos de contacto
CREATE TRIGGER "Notification_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Notification"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('userId');
CREATE TRIGGER "ContactMessage_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ContactMessage"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId', 'patientUserId');

-- Récipes
CREATE TRIGGER "Prescription_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Prescription"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId', 'patientId');
CREATE TRIGGER "PrescriptionPad_realtime" AFTER INSERT OR UPDATE OR DELETE ON "PrescriptionPad"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');

-- Perfil del médico, documentos y publicaciones (el puntaje del directorio y el
-- nombre de búsqueda se recalculan solos al arrancar la API: no avisan)
CREATE TRIGGER "ProfessionalProfile_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ProfessionalProfile"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('id', 'userId', '-directoryScore', '-profileCompleteness', '-searchName');
CREATE TRIGGER "ProfessionalDocument_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ProfessionalDocument"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');
CREATE TRIGGER "ProfessionalLocation_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ProfessionalLocation"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');
CREATE TRIGGER "ProfessionalSocialLink_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ProfessionalSocialLink"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');
CREATE TRIGGER "ProfessionalSpecialty_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ProfessionalSpecialty"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');
CREATE TRIGGER "ProfessionalRegistration_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ProfessionalRegistration"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');
CREATE TRIGGER "Post_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Post"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId');

-- Planes y pagos
CREATE TRIGGER "Subscription_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Subscription"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId', 'organizationId');
CREATE TRIGGER "SubscriptionInstallment_realtime" AFTER INSERT OR UPDATE OR DELETE ON "SubscriptionInstallment"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('subscriptionId');
CREATE TRIGGER "Payment_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('installmentId');

-- Valoraciones
CREATE TRIGGER "Review_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Review"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId', 'patientId');
CREATE TRIGGER "ReviewReply_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ReviewReply"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('reviewId');
CREATE TRIGGER "ReviewReport_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ReviewReport"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('reviewId');

-- Pacientes: ficha, permisos y vínculos con médicos
CREATE TRIGGER "PatientProfile_realtime" AFTER INSERT OR UPDATE OR DELETE ON "PatientProfile"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('id', 'userId');
CREATE TRIGGER "PatientDataGrant_realtime" AFTER INSERT OR UPDATE OR DELETE ON "PatientDataGrant"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('patientId', 'professionalId');
CREATE TRIGGER "ProfessionalPatient_realtime" AFTER INSERT OR UPDATE OR DELETE ON "ProfessionalPatient"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('professionalId', 'patientId');

-- Cuentas: solo lo que cambia la sesión o lo que la cuenta puede hacer
CREATE TRIGGER "User_realtime" AFTER UPDATE OR DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('id', '+role', '+isActive', '+isEmailVerified', '+tokenVersion', '+deletedAt', '+purgedAt', '+suspendedUntil');
CREATE TRIGGER "UserSanction_realtime" AFTER INSERT OR UPDATE OR DELETE ON "UserSanction"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('userId', '-endNoticeSentAt');
CREATE TRIGGER "LegalRequest_realtime" AFTER INSERT OR UPDATE OR DELETE ON "LegalRequest"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('userId');

-- Organizaciones
CREATE TRIGGER "Organization_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Organization"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('id');
CREATE TRIGGER "OrganizationMember_realtime" AFTER INSERT OR UPDATE OR DELETE ON "OrganizationMember"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('organizationId', 'userId');
CREATE TRIGGER "OrganizationProfessional_realtime" AFTER INSERT OR UPDATE OR DELETE ON "OrganizationProfessional"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('organizationId', 'professionalId');
CREATE TRIGGER "OrganizationInvitation_realtime" AFTER INSERT OR UPDATE OR DELETE ON "OrganizationInvitation"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('organizationId');
CREATE TRIGGER "OrganizationLocation_realtime" AFTER INSERT OR UPDATE OR DELETE ON "OrganizationLocation"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('organizationId');
CREATE TRIGGER "OrganizationSocialLink_realtime" AFTER INSERT OR UPDATE OR DELETE ON "OrganizationSocialLink"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"('organizationId');

-- Catálogos que muestran la web y la app
CREATE TRIGGER "Specialty_realtime" AFTER INSERT OR UPDATE OR DELETE ON "Specialty"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"();
CREATE TRIGGER "SubscriptionPlan_realtime" AFTER INSERT OR UPDATE OR DELETE ON "SubscriptionPlan"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"();
CREATE TRIGGER "FinancialInstitution_realtime" AFTER INSERT OR UPDATE OR DELETE ON "FinancialInstitution"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"();
CREATE TRIGGER "SiteSettings_realtime" AFTER INSERT OR UPDATE OR DELETE ON "SiteSettings"
FOR EACH ROW EXECUTE FUNCTION "realtime_capture"();
