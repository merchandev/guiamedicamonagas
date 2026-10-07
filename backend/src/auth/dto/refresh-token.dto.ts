import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Solo la app móvil manda el refresh token en el cuerpo (ver
 * AuthController.isMobileApp); la web usa la cookie httpOnly y no manda nada.
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;
}
