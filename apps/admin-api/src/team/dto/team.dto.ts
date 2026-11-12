import { ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteTeamMemberDto {
  @IsEmail()
  email: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles: Role[];
}

export class UpdateTeamRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles: Role[];
}

export class InvitationTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token: string;
}

export class AcceptInvitationDto extends InvitationTokenDto {
  /** The code emailed to the invited address, when signed in with another address (ADR-081). */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}
