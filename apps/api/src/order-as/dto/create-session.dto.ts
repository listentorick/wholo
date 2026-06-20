import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tradeRelationshipId: string;
}
