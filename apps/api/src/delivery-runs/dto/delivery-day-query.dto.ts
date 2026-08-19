import { IsDateString } from 'class-validator';

export class DeliveryDayQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
