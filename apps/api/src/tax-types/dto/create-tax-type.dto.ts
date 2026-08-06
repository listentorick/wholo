import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsNumberString, MaxLength } from 'class-validator';
import { TaxClassification } from '@prisma/client';

export class CreateTaxTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(TaxClassification)
  classification: TaxClassification;

  @IsNumberString()
  ratePercentage: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
