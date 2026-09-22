import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';

const SOCIAL_PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'] as const;

export class SocialLinkDto {
  @IsIn(SOCIAL_PLATFORMS)
  platform!: (typeof SOCIAL_PLATFORMS)[number];

  // El formato exacto (dominio oficial por red) se valida en el servicio,
  // donde también se conoce el plan del perfil/organización.
  @IsString()
  @MaxLength(300)
  url!: string;
}

export class UpsertSocialLinksDto {
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  links!: SocialLinkDto[];
}
