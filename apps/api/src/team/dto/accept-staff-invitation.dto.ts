import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StaffInvitationTokenDto {
  @ApiProperty({ description: 'The token from the emailed invitation link' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token!: string;
}

export class AcceptStaffInvitationDto extends StaffInvitationTokenDto {
  @ApiPropertyOptional({ description: 'The code emailed to the invited address, when signed in with another address (ADR-081)' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}
