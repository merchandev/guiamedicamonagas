import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpsertBankDto {
  @Matches(/^\d{4}$/, { message: 'El código debe tener 4 dígitos' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  supportsPagoMovil?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
