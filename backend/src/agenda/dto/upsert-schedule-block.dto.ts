import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Matches, Max, Min, ValidateNested } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpsertScheduleBlockDto {
  /** 0 = Domingo, 1 = Lunes, ..., 6 = Sábado */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(TIME_PATTERN, { message: 'Hora inválida (formato HH:mm, ej. 08:00)' })
  startTime!: string;

  @Matches(TIME_PATTERN, { message: 'Hora inválida (formato HH:mm, ej. 12:00)' })
  endTime!: string;
}

/** El horario semanal completo, tal como queda en la cuadrícula. */
export class ReplaceScheduleBlocksDto {
  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => UpsertScheduleBlockDto)
  blocks!: UpsertScheduleBlockDto[];
}
