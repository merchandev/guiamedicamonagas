import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfessionalProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @IsOptional()
  @Matches(/^[VEJPG]-?\d{5,9}$/i, { message: 'Cédula inválida (ej. V-12345678)' })
  cedula?: string;

  @IsOptional()
  @Matches(/^[VEJPG]-?\d{8,9}-?\d$/i, { message: 'RIF inválido (ej. V-12345678-9)' })
  rif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mppsNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  colmedMonagasNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  inpremedicoNumber?: string;

  @IsOptional()
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  phone?: string;

  @IsOptional()
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'WhatsApp inválido (ej. 0414-1234567)' })
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  municipality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  specialtyIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  seoDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoKeywords?: string;
}
