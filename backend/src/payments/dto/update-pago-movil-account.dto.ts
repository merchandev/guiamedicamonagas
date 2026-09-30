import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const compact = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value);

/** Datos de la cuenta que recibe los Pagos Móviles de las suscripciones. */
export class UpdatePagoMovilAccountDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Indica el nombre del titular de la cuenta' })
  @MaxLength(120)
  holderName!: string;

  /** Cédula (V-12345678) o RIF (J-12345678-9) del titular. */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s.]/g, '').toUpperCase() : value))
  @Matches(/^[VEJPG]-?\d{5,9}(-?\d)?$/, { message: 'Cédula o RIF inválido (ej. V-12345678 o J-12345678-9)' })
  documentId!: string;

  @Matches(/^\d{4}$/, { message: 'El código del banco debe tener 4 dígitos' })
  bankCode!: string;

  @Transform(compact)
  @Matches(/^\d{20}$/, { message: 'El número de cuenta debe tener 20 dígitos' })
  accountNumber!: string;

  @Transform(compact)
  @Matches(/^04\d{9}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  phone!: string;
}
