import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewIdentityDto {
  @IsBoolean()
  approved!: boolean;

  /** Obligatoria al rechazar: el paciente la recibe para saber qué corregir. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
