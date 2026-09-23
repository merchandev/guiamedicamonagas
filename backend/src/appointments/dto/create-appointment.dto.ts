import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  professionalId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  // Solo obligatorios si el usuario todavía no tiene una ficha de paciente
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  phone?: string;
}
