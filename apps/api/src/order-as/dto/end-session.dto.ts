import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EndSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sessionToken: string;
}
