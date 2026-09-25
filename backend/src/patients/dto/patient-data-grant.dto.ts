import { PatientDataScope } from '@prisma/client';
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const MAX_GRANT_DAYS = 365;
export const DEFAULT_GRANT_DAYS = 30;

/** Qué verá el médico que registre al paciente con su código. */
export class UpdateShareScopesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(PatientDataScope, { each: true })
  scopes!: PatientDataScope[];
}

/** Código que el paciente entregó al médico (con o sin guiones). */
export class RegisterPatientByCodeDto {
  @IsString()
  @MaxLength(32)
  code!: string;
}

export class CreatePatientDataGrantDto {
  @IsUUID()
  professionalId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(PatientDataScope, { each: true })
  scopes!: PatientDataScope[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GRANT_DAYS)
  durationDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
