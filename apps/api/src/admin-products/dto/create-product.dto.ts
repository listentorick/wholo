import { IsString, IsOptional, IsEnum, IsDecimal, MinLength } from 'class-validator';
import { ProductStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus', required: false })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  productTypeId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiProperty({ type: String, description: 'Decimal string, e.g. "29.99"', required: false })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  price?: string;

  @ApiProperty({ type: String, description: 'Decimal string, e.g. "39.99"', required: false })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  compareAtPrice?: string;
}
