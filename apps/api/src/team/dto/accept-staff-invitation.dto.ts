import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptStaffInvitationDto {
  @ApiProperty({ description: 'The token from the emailed invitation link' })
  @IsString()
  @MinLength(1)
  token!: string;
}
