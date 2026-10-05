import { ReviewAuthorDisplay, ReviewReportReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { Equals, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const REVIEW_TEXT_MAX = 1000;

export class CreateReviewDto {
  @IsUUID()
  professionalId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  /** Opcional: sin comentario la valoración se publica al enviarla; con comentario pasa por moderación. */
  @IsOptional()
  @IsString()
  @MaxLength(REVIEW_TEXT_MAX)
  comment?: string;

  @IsEnum(ReviewAuthorDisplay)
  authorDisplay!: ReviewAuthorDisplay;

  /** Aceptó las reglas de las valoraciones (REVIEW_RULES_VERSION). */
  @Equals(true, { message: 'Debes aceptar las reglas de las valoraciones' })
  acceptRules!: boolean;
}

export class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** Vacío quita el comentario. */
  @IsOptional()
  @IsString()
  @MaxLength(REVIEW_TEXT_MAX)
  comment?: string;

  @IsOptional()
  @IsEnum(ReviewAuthorDisplay)
  authorDisplay?: ReviewAuthorDisplay;

  @Equals(true, { message: 'Debes aceptar las reglas de las valoraciones' })
  acceptRules!: boolean;
}

export class ReviewReplyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(REVIEW_TEXT_MAX)
  content!: string;
}

export class ReportReviewDto {
  @IsEnum(ReviewReportReason)
  reason!: ReviewReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(REVIEW_TEXT_MAX)
  details?: string;
}

export class ReviewPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;
}
