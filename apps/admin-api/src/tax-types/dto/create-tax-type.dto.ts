import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateTaxTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  classification: string;

  @IsString()
  @IsNotEmpty()
  ratePercentage: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
