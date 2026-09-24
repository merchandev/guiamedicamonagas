import { Equals, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'La contraseña debe incluir al menos una letra y un número',
  })
  password!: string;

  @IsIn(['USER', 'PROFESSIONAL', 'ORGANIZATION'], { message: 'Rol inválido' })
  role!: 'USER' | 'PROFESSIONAL' | 'ORGANIZATION';

  /** Aceptación explícita de los Términos y la Política de privacidad vigentes. */
  @Equals(true, { message: 'Debes aceptar los términos y la política de privacidad' })
  acceptLegal!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @Matches(/^[VEJPG]-?\d{5,9}$/i, { message: 'Cédula inválida (ej. V-12345678)' })
  cedula?: string;

  // --- Solo organizaciones (farmacia / laboratorio / clínica) ---

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  organizationName?: string;

  @IsOptional()
  @IsIn(['PHARMACY', 'LABORATORY', 'CLINIC'])
  organizationType?: 'PHARMACY' | 'LABORATORY' | 'CLINIC';

  @IsOptional()
  @Matches(/^[VEJPG]-?\d{8,9}-?\d$/i, { message: 'RIF inválido (ej. J-12345678-9)' })
  organizationRif?: string;

  /**
   * Alta por invitación al equipo de una organización (solo con role
   * ORGANIZATION): la cuenta se une a esa organización en vez de crear una
   * nueva. El correo debe ser el invitado.
   */
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  invitationToken?: string;
}
