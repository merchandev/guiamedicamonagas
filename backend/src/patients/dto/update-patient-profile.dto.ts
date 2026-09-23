import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
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
}
