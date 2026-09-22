import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateGlobalSeoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  siteName!: string;

  @IsIn(['-', '|', '•'])
  titleSeparator!: string;

  @IsBoolean()
  allowIndexing!: boolean;

  @IsOptional()
  @IsUrl()
  defaultOgImageUrl?: string;
}

export class UpsertPageSeoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  path!: string;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  focusKeyword?: string;

  @IsOptional()
  @IsUrl()
  ogImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;
}
