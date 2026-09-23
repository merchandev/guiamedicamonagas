import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches, Min, MinLength } from 'class-validator';

export class ReportPaymentDto {
  @IsUUID()
  installmentId!: string;

  /** Informativo: el nombre que se guarda sale del catálogo por el código. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  senderBankName?: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'Código de banco inválido (4 dígitos)' })
  senderBankCode!: string;

  @Matches(/^0(412|414|416|424|426)-?\d{7}$/, { message: 'Teléfono inválido (ej. 0414-1234567)' })
  senderPhone!: string;

  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'La referencia debe tener entre 4 y 8 dígitos' })
  referenceNumber!: string;

  @IsISO8601()
  paidAt!: string;

  @IsNumber()
  @Min(0.01)
  amountBs!: number;
}
