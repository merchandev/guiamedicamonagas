import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

const PLAN_TIERS = ['FREE', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM', 'ORGANIZATION'] as const;

export class UpsertPlanDto {
  @IsIn(PLAN_TIERS)
  tier!: (typeof PLAN_TIERS)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsNumber()
  @Min(0)
  priceUsd!: number;

  @IsIn(['MONTHLY', 'QUARTERLY', 'YEARLY'])
  billingCycle!: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLocations?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  postsLimit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
