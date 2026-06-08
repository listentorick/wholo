import { IsString, IsOptional, IsEnum, IsDecimal, MinLength } from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  productTypeId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  price?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  compareAtPrice?: string;
}
