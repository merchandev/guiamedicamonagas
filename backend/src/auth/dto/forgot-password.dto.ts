import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Correo inválido' })
  @MaxLength(180)
  email!: string;
}
