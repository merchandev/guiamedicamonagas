import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SocialLinkDto } from '../../common/dto/social-link.dto';
import { OrganizationLocationDto } from './upsert-organization.dto';

/** Lo que la propia organización puede editar desde su panel. */
export class UpdateOwnOrganizationDto {
  @IsIn(['PHARMACY', 'LABORATORY', 'CLINIC'])
  type!: 'PHARMACY' | 'LABORATORY' | 'CLINIC';

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Matches(/^[VEJPG]-?\d{8,9}-?\d$/i, { message: 'RIF inválido (ej. J-12345678-9)' })
  rif?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  openingHours?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  services?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  insurers?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  paymentMethods?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OrganizationLocationDto)
  locations!: OrganizationLocationDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];
}

/** Invitación al equipo: la persona acepta desde el enlace que recibe por correo. */
export class InviteMemberDto {
  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsIn(['ADMIN', 'EDITOR'])
  role!: 'ADMIN' | 'EDITOR';
}

export class ChangeMemberRoleDto {
  @IsIn(['OWNER', 'ADMIN', 'EDITOR'])
  role!: 'OWNER' | 'ADMIN' | 'EDITOR';
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  token!: string;
}

export class InviteProfessionalDto {
  @IsUUID()
  professionalId!: string;
}

export class RespondAffiliationDto {
  @IsBoolean()
  accept!: boolean;
}

export class ReviewOrganizationDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
