import { Transform } from 'class-transformer';
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

/** Recorta espacios. */
const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Campo opcional del formulario: un texto vacío significa «borrar este dato»
 * (null), no un valor inválido. Sin esto, dejar la cédula o el teléfono en
 * blanco devolvía «Cédula inválida».
 */
const EmptyToNull = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

/**
 * El título y la descripción para buscadores se generan solos a partir del
 * nombre, la especialidad y el resumen (ver frontend/src/lib/seo.ts): el
 * médico ya no los escribe a mano.
 */
export class UpdateProfessionalProfileDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string | null;

  @EmptyToNull()
  @IsOptional()
  @Matches(/^[VEJPG]-?\d{5,9}$/i, { message: 'Cédula inválida (ej. V-12345678)' })
  cedula?: string | null;

  @EmptyToNull()
  @IsOptional()
  @Matches(/^[VEJPG]-?\d{8,9}-?\d$/i, { message: 'RIF inválido (ej. V-12345678-9)' })
  rif?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mppsNumber?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  colmedMonagasNumber?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  inpremedicoNumber?: string | null;

  @EmptyToNull()
  @IsOptional()
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  phone?: string | null;

  @EmptyToNull()
  @IsOptional()
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'WhatsApp inválido (ej. 0414-1234567)' })
  whatsapp?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  municipality?: string | null;

  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

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

  /** Resumen corto del médico: alimenta la descripción automática para buscadores. */
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;
}
