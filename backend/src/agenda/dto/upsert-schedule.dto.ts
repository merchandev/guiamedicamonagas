import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpsertScheduleDto {
  @IsInt()
  @Min(5)
  @Max(180)
  slotDurationMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(60)
  bufferMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxDailyAppointments?: number;

  @IsBoolean()
  autoConfirm!: boolean;
}
