import { IsDecimal, IsOptional, IsString, MinLength } from 'class-validator';

export class ImportProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  price?: string;

  @IsOptional()
  @IsString()
  productTypeId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}
