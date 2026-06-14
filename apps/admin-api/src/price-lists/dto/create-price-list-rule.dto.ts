import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsDecimal } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePriceListRuleDto {
  @IsString()
  @IsNotEmpty()
  selectorType: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity?: number;

  @IsString()
  @IsOptional()
  valueType?: string;

  @IsDecimal()
  @IsOptional()
  unitPrice?: string;

  @IsDecimal()
  @IsOptional()
  discountPercentage?: string;

  @IsString()
  @IsOptional()
  discountBaseType?: string;

  @IsString()
  @IsOptional()
  basePriceListId?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
