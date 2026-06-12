import { IsString, IsOptional } from 'class-validator';

export class SubmitOrderDto {
  @IsString()
  distributorSlug: string;

  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
