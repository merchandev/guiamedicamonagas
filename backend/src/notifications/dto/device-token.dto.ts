import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** La app registra el token de FCM de esta instalación al iniciar sesión. */
export class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsIn(['ANDROID', 'IOS'])
  platform?: 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceInfo?: string;
}

/** La app borra su token al cerrar sesión. */
export class RemoveDeviceTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token!: string;
}
