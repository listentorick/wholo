import { IsString, IsOptional, IsDateString } from 'class-validator';

export class SubmitOrderDto {
  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  requestedDeliveryDate: string;
}
