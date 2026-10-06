import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PRESCRIPTION_MAX_ITEMS } from '../prescription-content';

/** Una línea: sin espacios de más ni saltos. */
const oneLine = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value);
/** Texto libre: conserva los saltos de línea; vacío = no enviado. */
const text = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  return trimmed === '' ? undefined : trimmed;
};
const optionalOneLine = ({ value }: { value: unknown }) => {
  const cleaned = oneLine({ value });
  return cleaned === '' ? undefined : cleaned;
};
/** «v-12.345.678» → «V-12345678». */
const cedula = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const cleaned = value.toUpperCase().replace(/[.\s]/g, '');
  return cleaned === '' ? undefined : cleaned;
};

const CEDULA = /^[VEJPG]-?\d{5,9}$/;
const CEDULA_MESSAGE = 'Cédula inválida (ej. V-12345678)';
const RIF = /^[VEJPG]-?\d{8,9}-?\d$/i;

export class PrescriptionItemDto {
  @Transform(oneLine)
  @IsString()
  @MinLength(2, { message: 'Escribe el principio activo (DCI) de cada medicamento' })
  @MaxLength(120)
  activeIngredient!: string;

  @Transform(oneLine)
  @IsString()
  @MinLength(1, { message: 'Indica la concentración de cada medicamento (ej. 500 mg)' })
  @MaxLength(60)
  concentration!: string;

  @Transform(oneLine)
  @IsString()
  @MinLength(2, { message: 'Indica la forma farmacéutica de cada medicamento' })
  @MaxLength(60)
  pharmaceuticalForm!: string;

  @Transform(oneLine)
  @IsString()
  @MinLength(2, { message: 'Indica la vía de administración de cada medicamento' })
  @MaxLength(40)
  route!: string;

  @Transform(oneLine)
  @IsString()
  @MinLength(2, { message: 'Indica la dosis de cada medicamento' })
  @MaxLength(160)
  dose!: string;

  @Transform(oneLine)
  @IsString()
  @MinLength(2, { message: 'Indica la duración del tratamiento de cada medicamento' })
  @MaxLength(60)
  duration!: string;

  @Transform(optionalOneLine)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  quantity?: string;

  @Transform(optionalOneLine)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brandNames?: string;

  @IsBoolean()
  nonSubstitutable!: boolean;

  @Transform(text)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instructions?: string;
}

export class IssuePrescriptionDto {
  /** Paciente con cuenta del directorio del médico: lo recibe en «Mis récipes». */
  @IsOptional()
  @IsUUID('all')
  patientId?: string;

  @Transform(oneLine)
  @IsString()
  @MinLength(3, { message: 'Escribe el nombre y apellido del paciente' })
  @MaxLength(120)
  patientName!: string;

  /** Vacía solo si es un menor sin cédula: entonces va la del representante. */
  @Transform(cedula)
  @IsOptional()
  @Matches(CEDULA, { message: CEDULA_MESSAGE })
  patientCedula?: string;

  @Type(() => Number)
  @IsInt({ message: 'Indica el año de nacimiento del paciente' })
  @Min(1900)
  @Max(2100)
  patientBirthYear!: number;

  @Transform(optionalOneLine)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  guardianName?: string;

  @Transform(cedula)
  @IsOptional()
  @Matches(CEDULA, { message: CEDULA_MESSAGE })
  guardianCedula?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un medicamento' })
  @ArrayMaxSize(PRESCRIPTION_MAX_ITEMS, { message: `Un récipe admite hasta ${PRESCRIPTION_MAX_ITEMS} medicamentos` })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];

  @Transform(text)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pharmacistNotes?: string;

  @Transform(text)
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  patientInstructions?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  validityDays!: number;
}

export class UpdatePrescriptionPadDto {
  @Transform(optionalOneLine)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  establishmentName?: string;

  @Transform(optionalOneLine)
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  establishmentAddress?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.toUpperCase().replace(/[.\s]/g, '') || undefined : value))
  @IsOptional()
  @Matches(RIF, { message: 'RIF inválido (ej. J-12345678-9)' })
  establishmentRif?: string;

  /** Vacío = se quita el teléfono del récipe. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || null : value))
  @IsOptional()
  @IsString()
  @Matches(/^[0-9+()\-\s/]{7,40}$/, { message: 'Teléfono inválido' })
  establishmentPhone?: string | null;

  @Transform(optionalOneLine)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  defaultValidityDays?: number;

  /** Acepta las condiciones de uso vigentes del récipe digital. */
  @IsOptional()
  @IsBoolean()
  acceptRules?: boolean;
}

export class AnnulPrescriptionDto {
  @Transform(oneLine)
  @IsString()
  @MinLength(5, { message: 'Explica en pocas palabras por qué lo anulas' })
  @MaxLength(300)
  reason!: string;
}

export class EmailPrescriptionDto {
  @Transform(oneLine)
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(200)
  email!: string;
}

export class DeliverPrescriptionDto {
  @IsUUID('all')
  patientId!: string;
}

export class PrescriptionCodeDto {
  @Transform(oneLine)
  @IsString()
  @MinLength(12)
  @MaxLength(20)
  code!: string;
}

export class PrescriptionListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  /** Nombre o cédula del paciente, número del récipe o medicamento. */
  @Transform(oneLine)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
