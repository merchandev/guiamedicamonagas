import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { OPTIONAL_EMAIL_TYPES } from '../notification-types';

export class ListNotificationsDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class UpdateNotificationPreferencesDto {
  /** Tipos de aviso cuyo correo se apaga (solo los opcionales). */
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsIn(Object.keys(OPTIONAL_EMAIL_TYPES), { each: true })
  emailOptOut!: string[];
}
