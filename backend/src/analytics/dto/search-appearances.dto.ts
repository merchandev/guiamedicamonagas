import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Médicos que se mostraron en una página de resultados del directorio y los
 * filtros usados (solo especialidad y municipio, de listas cerradas). Nunca el
 * texto que escribió la persona: puede revelar algo de su salud.
 */
export class SearchAppearancesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  professionalIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  municipality?: string;
}
