import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertPostDto {
  @IsString()
  @MinLength(4)
  @MaxLength(140)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
