import {
  IsEnum, IsOptional, IsString, IsInt, Min, IsDecimal,
} from 'class-validator';
import { PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePriceListRuleDto {
  @IsEnum(PriceListRuleSelectorType)
  selectorType: PriceListRuleSelectorType;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  productVariantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity?: number;

  @IsEnum(PriceListRuleValueType)
  @IsOptional()
  valueType?: PriceListRuleValueType;

  @IsDecimal()
  @IsOptional()
  unitPrice?: string;

  @IsDecimal()
  @IsOptional()
  discountPercentage?: string;

  @IsEnum(PriceListRuleDiscountBaseType)
  @IsOptional()
  discountBaseType?: PriceListRuleDiscountBaseType;

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
