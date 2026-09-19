import { ArrayNotEmpty, IsArray, IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateStaffInvitationDto {
  @ApiProperty({ example: 'sam.patel@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: Role, isArray: true, example: [Role.OPERATIONS_MANAGER] })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}

export class UpdateStaffRolesDto {
  @ApiProperty({ enum: Role, isArray: true, example: [Role.OPERATIONS_MANAGER, Role.WAREHOUSE_STAFF] })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles!: Role[];
}
