import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { LegalDocument, LegalRequestCategory, LegalRequestStatus } from '@prisma/client';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const emptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value));

export const LEGAL_REQUEST_CATEGORIES = Object.values(LegalRequestCategory);
export const LEGAL_REQUEST_STATUSES = Object.values(LegalRequestStatus);

export class CreateLegalRequestDto {
  @IsIn(LEGAL_REQUEST_CATEGORIES, { message: 'Elige el tipo de solicitud' })
  category!: LegalRequestCategory;

  @trim() @IsString() @MinLength(3, { message: 'Escribe tu nombre' }) @MaxLength(120)
  requesterName!: string;

  /** Sin sesión es obligatorio; con sesión se usa el correo de la cuenta. */
  @IsOptional() @trim() @IsEmail({}, { message: 'Correo inválido' }) @MaxLength(180)
  requesterEmail?: string;

  @IsOptional() @emptyToUndefined() @Matches(/^\+?[\d\s()-]{7,20}$/, { message: 'Teléfono inválido' })
  requesterPhone?: string;

  @IsOptional() @emptyToUndefined() @IsString() @MaxLength(300)
  subjectUrl?: string;

  @trim() @IsString() @MinLength(20, { message: 'Describe tu solicitud (mínimo 20 caracteres)' }) @MaxLength(5000)
  description!: string;
}

export class LookupLegalRequestDto {
  @trim() @Matches(/^R-[A-Z0-9]{8}$/i, { message: 'Número de solicitud inválido (ej. R-7KQ4M9XP)' })
  ticket!: string;

  @trim() @IsEmail({}, { message: 'Correo inválido' }) @MaxLength(180)
  email!: string;
}

export class ListLegalRequestsDto {
  @IsOptional() @IsIn(LEGAL_REQUEST_STATUSES)
  status?: LegalRequestStatus;

  @IsOptional() @IsIn(LEGAL_REQUEST_CATEGORIES)
  category?: LegalRequestCategory;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;
}

export class UpdateLegalRequestDto {
  @IsIn(LEGAL_REQUEST_STATUSES)
  status!: LegalRequestStatus;

  /** Obligatoria al resolver o rechazar: se envía al solicitante. */
  @IsOptional() @trim() @IsString() @MaxLength(3000)
  resolution?: string;
}

export class AcceptLegalDto {
  @IsArray() @ArrayMaxSize(10)
  @IsIn(Object.values(LegalDocument), { each: true })
  documents!: LegalDocument[];
}
