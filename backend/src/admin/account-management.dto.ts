import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AccountListDto {
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'DELETED'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;
}

export class ModerateAccountDto {
  @IsIn(['SUSPEND', 'DELETE', 'RESTORE'])
  action!: 'SUSPEND' | 'DELETE' | 'RESTORE';

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(8) @MaxLength(500)
  reason!: string;
}

export const PURGE_CONFIRMATION = 'ELIMINAR';

export class PurgeAccountDto {
  /** Queda en la auditoría; no se envía al titular. */
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(8) @MaxLength(500)
  reason!: string;

  /** Frena llamadas accidentales: la acción no se puede deshacer. */
  @IsIn([PURGE_CONFIRMATION], { message: `Escribe ${PURGE_CONFIRMATION} para confirmar` })
  confirm!: string;
}
