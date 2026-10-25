import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupportGrantDto {
  @ApiProperty({ description: 'The grant holder. Must be the caller — support access is only ever self-granted.' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: 'Setting up price lists, ticket 142', description: 'Shown to the distributor and kept in its audit log' })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ example: 240, description: 'Visit length in minutes; defaults to 240 and is capped at 480' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}
