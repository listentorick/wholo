import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExchangeTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deliveryToken: string;
}
