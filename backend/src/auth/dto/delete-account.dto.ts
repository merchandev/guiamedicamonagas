import { IsString, MaxLength, MinLength } from 'class-validator';

/** El usuario confirma su identidad con la contraseña actual para programar la eliminación. */
export class RequestAccountDeletionDto {
  @IsString()
  @MinLength(1, { message: 'Escribe tu contraseña actual' })
  @MaxLength(200)
  currentPassword!: string;
}
