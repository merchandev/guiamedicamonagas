import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewDocumentDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Solo aplica a documentos con vigencia (EXPIRING_DOCUMENT_TYPES). */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
