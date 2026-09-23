import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const PHONE_REGEX = /^0(412|414|416|424|426)-?\d{7}$/;

export class MedicationItemDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(120)
  schedule!: string;
}

export class UpdatePatientProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @Matches(/^[VEJPG]-?\d{5,9}$/i, { message: 'Cédula inválida (ej. V-12345678)' })
  cedula?: string;

  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  phone?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (formato AAAA-MM-DD)' })
  birthDate?: string;

  @IsOptional()
  @IsIn(['M', 'F', 'Otro'])
  sex?: string;

  @IsOptional()
  @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  bloodType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  municipality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  emergencyAddress?: string;

  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  emergencyMedicalPhone?: string;

  @IsOptional()
  @IsBoolean()
  isHealthy?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  conditionSummary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications?: MedicationItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  treatingDoctors?: string[];
}
