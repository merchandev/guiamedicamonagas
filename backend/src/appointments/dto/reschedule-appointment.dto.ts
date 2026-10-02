import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class RescheduleAppointmentDto {
  @IsDateString()
  startsAt!: string;

  /**
   * Solo el médico: ponerla fuera de su horario habitual (p. ej. atender más
   * tarde un día). Nunca encima de otra cita. Para el paciente no cuenta.
   */
  @IsOptional()
  @IsBoolean()
  outsideSchedule?: boolean;
}
