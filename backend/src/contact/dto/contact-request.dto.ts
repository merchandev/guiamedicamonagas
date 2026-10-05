import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_REGEX } from '../../patients/dto/update-patient-profile.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const CONTACT_CHANNELS = ['PHONE', 'WHATSAPP', 'EMAIL'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** «Quiero que me contacte»: el paciente elige qué compartir con ese médico. */
export class CreateContactRequestDto {
  @IsString()
  @MaxLength(200)
  professionalSlug!: string;

  /** Mostrar su nombre y apellido; si no, el médico ve «Paciente». */
  @IsBoolean()
  shareName!: boolean;

  /** Teléfono para llamada o WhatsApp (el de su ficha u otro). */
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  phone?: string;

  /** Compartir el correo de su cuenta. */
  @IsBoolean()
  shareEmail!: boolean;

  @IsIn(CONTACT_CHANNELS)
  channel!: ContactChannel;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  preferredTime?: string;

  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Escribe al menos 10 caracteres' })
  @MaxLength(1000)
  message!: string;

  /** Aceptó el texto del pedido (CONTACT_REQUEST_CONSENT_VERSION). */
  @Equals(true, { message: 'Debes aceptar cómo se comparten tus datos' })
  acceptConsent!: boolean;
}

export class ContactRequestStatusDto {
  @IsIn(['CONTACTED', 'CLOSED'])
  status!: 'CONTACTED' | 'CLOSED';
}
