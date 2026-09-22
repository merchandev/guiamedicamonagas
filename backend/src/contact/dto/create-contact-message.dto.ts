import { IsEmail, IsOptional, IsString, MaxLength, Matches, MinLength } from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  professionalSlug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  senderName!: string;

  @IsEmail()
  @MaxLength(180)
  senderEmail!: string;

  @IsOptional()
  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  senderPhone?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  content!: string;

  /** Campo honeypot: si viene relleno, el envío se descarta silenciosamente (anti-spam). */
  @IsOptional()
  @IsString()
  website?: string;
}
