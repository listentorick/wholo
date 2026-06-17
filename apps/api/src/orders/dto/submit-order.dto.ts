import { IsString, IsOptional, IsDateString } from 'class-validator';

export class SubmitOrderDto {
  @IsString()
  distributorSlug: string;

  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  requestedDeliveryDate?: string;
}
