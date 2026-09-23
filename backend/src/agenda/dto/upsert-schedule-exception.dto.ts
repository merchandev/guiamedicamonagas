import { IsBoolean, IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpsertScheduleExceptionDto {
  @IsDateString()
  date!: string;

  @IsBoolean()
  isBlocked!: boolean;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'Hora inválida (formato HH:mm)' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'Hora inválida (formato HH:mm)' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
