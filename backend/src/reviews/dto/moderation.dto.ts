import { SanctionType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_SANCTION_DAYS } from '../sanction-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MODERATION_TABS = ['PENDING', 'REPLIES', 'REPORTED', 'PUBLISHED', 'WITHDRAWN', 'REJECTED'] as const;
export type ModerationTab = (typeof MODERATION_TABS)[number];

export class ModerationListDto {
  @IsOptional()
  @IsIn(MODERATION_TABS)
  tab?: ModerationTab;

  /** Nombre o apellido del médico. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

/** Motivo de un rechazo, un retiro o una sanción: lo recibe el afectado. */
export class ModerationReasonDto {
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export const DELETE_CONFIRMATION = 'ELIMINAR';

export class DeleteReviewDto extends ModerationReasonDto {
  /** Eliminar no se puede deshacer: se escribe la palabra para confirmar. */
  @IsIn([DELETE_CONFIRMATION], { message: `Escribe ${DELETE_CONFIRMATION} para confirmar` })
  confirm!: string;
}

export class ModerateReplyDto {
  @IsIn(['APPROVE', 'REJECT', 'WITHDRAW', 'RESTORE'])
  action!: 'APPROVE' | 'REJECT' | 'WITHDRAW' | 'RESTORE';

  /** Obligatorio para rechazar o retirar. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason?: string;
}

export class ResolveReportDto {
  @IsIn(['UPHELD', 'DISMISSED'])
  status!: 'UPHELD' | 'DISMISSED';

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  note!: string;
}

/** Duración: `days` de 1 a 365, o `indefinite` (solo la sanción de opiniones). */
export class SanctionDurationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SANCTION_DAYS)
  days?: number;

  @IsOptional()
  @IsBoolean()
  indefinite?: boolean;
}

export class CreateSanctionDto extends SanctionDurationDto {
  @IsUUID()
  userId!: string;

  @IsEnum(SanctionType)
  type!: SanctionType;

  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsUUID()
  reviewId?: string;
}

export class SanctionListDto {
  @IsUUID()
  userId!: string;
}
