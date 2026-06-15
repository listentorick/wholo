import {
  IsEnum, IsOptional, IsString, IsInt, Min, IsDecimal,
} from 'class-validator';
import { PriceListRuleDiscountBaseType, PriceListRuleSelectorType, PriceListRuleValueType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePriceListRuleDto {
  @ApiProperty({ enum: PriceListRuleSelectorType, enumName: 'PriceListRuleSelectorType' })
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

  @ApiProperty({ enum: PriceListRuleValueType, enumName: 'PriceListRuleValueType', required: false })
  @IsEnum(PriceListRuleValueType)
  @IsOptional()
  valueType?: PriceListRuleValueType;

  @ApiProperty({ type: String, description: 'Decimal string, e.g. "19.99"', required: false })
  @IsDecimal()
  @IsOptional()
  unitPrice?: string;

  @ApiProperty({ type: String, description: 'Decimal percentage, e.g. "10.00"', required: false })
  @IsDecimal()
  @IsOptional()
  discountPercentage?: string;

  @ApiProperty({ enum: PriceListRuleDiscountBaseType, enumName: 'PriceListRuleDiscountBaseType', required: false })
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
