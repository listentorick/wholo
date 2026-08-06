import { IsDecimal, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ImportTaxTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsString()
  @IsNotEmpty()
  classification!: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  ratePercentage?: string;
}
