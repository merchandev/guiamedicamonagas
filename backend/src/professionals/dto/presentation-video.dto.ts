import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Enlace de YouTube del video de presentación; vacío o null lo quita. */
export class PresentationVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  url?: string | null;
}
