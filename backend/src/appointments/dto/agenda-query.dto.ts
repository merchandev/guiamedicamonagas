import { AppointmentSource, AppointmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Fecha inválida (formato AAAA-MM-DD)';

/** Rango del calendario o de la lista de citas (hasta 62 días). */
export class AgendaRangeDto {
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  from!: string;

  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  to!: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}

/** Historial de citas del médico, con filtros y de a una página. */
export class AppointmentHistoryDto {
  @IsOptional()
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  to?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsEnum(AppointmentSource)
  source?: AppointmentSource;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  /** Código del paciente («GMM-A4F2»). */
  @IsOptional()
  @MaxLength(20)
  patientCode?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Horarios libres de un rango (hasta 62 días) para mover una cita sin arrastrar. */
export class DoctorSlotsDto {
  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  from!: string;

  @Matches(DATE_KEY, { message: DATE_MESSAGE })
  to!: string;

  /** La cita que se va a mover: su horario actual no cuenta como ocupado. */
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
