import { IsDecimal, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaxClassification } from '@prisma/client';

// Creates a new Stocdup TaxType from an imported Xero tax rate. name/rate
// default from the cached external row; classification has no Xero
// equivalent so it is always required here, never defaulted or guessed.
export class ImportTaxTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiProperty({ enum: TaxClassification, enumName: 'TaxClassification' })
  @IsEnum(TaxClassification)
  classification: TaxClassification;

  @ApiProperty({ type: String, description: 'Decimal string, e.g. "20.00"', required: false })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  ratePercentage?: string;
}
