import { IsString, IsOptional, IsBoolean, IsEnum, IsNumberString, MaxLength } from 'class-validator';
import { TaxClassification } from '@prisma/client';

export class UpdateTaxTypeDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsEnum(TaxClassification)
  @IsOptional()
  classification?: TaxClassification;

  @IsNumberString()
  @IsOptional()
  ratePercentage?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
