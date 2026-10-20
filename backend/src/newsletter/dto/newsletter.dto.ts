import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Un bloque del editor. Solo se usan los campos del tipo correspondiente. */
export class NewsletterBlockDto {
  @IsIn(['heading', 'paragraph', 'button', 'image', 'divider'])
  type!: 'heading' | 'paragraph' | 'button' | 'image' | 'divider';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;
}

/** Base de una campaña: asunto, audiencia y contenido (bloques o HTML libre). */
export class CampaignContentDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsIn(['BLOCKS', 'HTML'])
  contentMode!: 'BLOCKS' | 'HTML';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => NewsletterBlockDto)
  blocks?: NewsletterBlockDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  rawHtml?: string;

  @IsBoolean()
  audienceList!: boolean;

  @IsBoolean()
  audiencePatients!: boolean;

  @IsBoolean()
  audienceProfessionals!: boolean;

  /** Si viene y es futura, el boletín se programa (no se envía al instante). ISO 8601. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

/** Enviar una prueba al correo indicado, con el contenido en edición. */
export class SendTestDto extends CampaignContentDto {
  @IsEmail()
  to!: string;
}

/** Guardar el contenido en edición como plantilla reutilizable. */
export class SaveTemplateDto extends CampaignContentDto {
  @IsString()
  @MaxLength(120)
  name!: string;
}

export class AddSubscriberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class ImportSubscribersDto {
  @IsString()
  @MaxLength(200000)
  text!: string;
}

export class ListSubscribersDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'UNSUBSCRIBED'])
  status?: 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED';

  @IsOptional()
  @IsString()
  @MaxLength(180)
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

/** Alta pública desde el formulario de la web (doble opt-in). */
export class PublicSubscribeDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class TokenQueryDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}
