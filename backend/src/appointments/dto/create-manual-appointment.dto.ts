import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** El médico registra una cita para un paciente walk-in / agendado por teléfono, sin cuenta. */
export class CreateManualAppointmentDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  phone?: string;
}
