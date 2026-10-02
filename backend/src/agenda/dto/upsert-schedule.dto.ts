import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpsertScheduleDto {
  @IsInt()
  @Min(5)
  @Max(180)
  slotDurationMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(60)
  bufferMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxDailyAppointments?: number;

  @IsBoolean()
  autoConfirm!: boolean;

  /** Hasta cuántos días adelante pueden reservar los pacientes. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  bookingWindowDays?: number;

  /** Antelación mínima de una reserva de paciente, en minutos (hasta 7 días). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  minNoticeMinutes?: number;
}
