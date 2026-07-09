import { IsDecimal, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Optional overrides for the values defaulted from the cached accounting
// product. Imported products are product seeds, not finished storefront
// products — they land as DRAFT ("needs catalogue setup") and images,
// categories, catalogue visibility etc. are configured afterwards in Wholo.
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

  @ApiProperty({ type: String, description: 'Decimal string, e.g. "29.99"', required: false })
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
