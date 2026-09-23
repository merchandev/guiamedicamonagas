import { IsString, Matches, MaxLength } from 'class-validator';

export class VerifyMfaDto {
  @IsString()
  @MaxLength(200)
  challengeToken!: string;

  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}
