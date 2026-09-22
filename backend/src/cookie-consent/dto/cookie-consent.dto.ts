import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RecordConsentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  subjectId!: string;

  @IsBoolean()
  analytics!: boolean;

  @IsBoolean()
  marketing!: boolean;
}

export class UpdateCookieConfigDto {
  @IsString()
  @MinLength(10)
  @MaxLength(600)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  necessaryDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  analyticsDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  marketingDescription?: string;
}
