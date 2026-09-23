import { PatientDataScope } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_GRANT_DAYS } from '../../patients/dto/patient-data-grant.dto';

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

  /**
   * Consentimiento opcional marcado por el paciente al reservar: qué datos
   * puede ver este médico y por cuántos días. Vacío = el médico solo ve el
   * código de paciente.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PatientDataScope, { each: true })
  shareScopes?: PatientDataScope[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GRANT_DAYS)
  shareDays?: number;
}
