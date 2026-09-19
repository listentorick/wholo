import { ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
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

export class AcceptInvitationDto {
  @IsString()
  @MinLength(1)
  token: string;
}
