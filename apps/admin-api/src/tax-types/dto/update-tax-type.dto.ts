import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateTaxTypeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  classification?: string;

  @IsString()
  @IsOptional()
  ratePercentage?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
