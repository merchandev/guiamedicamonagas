import { IsIn, IsString, MaxLength } from 'class-validator';

const EVENT_TYPES = [
  'PROFILE_VIEW',
  'WHATSAPP_CLICK',
  'PHONE_CLICK',
  'WEBSITE_CLICK',
  'SOCIAL_LINK_CLICK',
  'MAP_CLICK',
  'CONTACT_SUBMIT',
  'AD_IMPRESSION',
  'AD_CLICK',
] as const;

export class TrackEventDto {
  @IsIn(EVENT_TYPES)
  eventType!: (typeof EVENT_TYPES)[number];

  @IsString()
  @MaxLength(80)
  resourceId!: string;
}
