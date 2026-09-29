import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AssignPaidPlanDto {
  @IsUUID() planId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99) amountBs!: number;
  @IsIn(['PAGO_MOVIL', 'BANK_TRANSFER']) method!: 'PAGO_MOVIL' | 'BANK_TRANSFER';
  @Matches(/^\d{4}$/) senderBankCode!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString() @Matches(/^[A-Z0-9-]{4,50}$/) referenceNumber!: string;
  @IsDateString() paidAt!: string;
  /** Ciclos del plan cubiertos por este pago (p. ej. 3 meses de un plan mensual). */
  @IsOptional() @IsInt() @Min(1) @Max(12) periods?: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(8) @MaxLength(500) reason!: string;
}
