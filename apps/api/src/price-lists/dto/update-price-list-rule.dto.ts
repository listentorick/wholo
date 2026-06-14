import { IsOptional, IsInt, Min, IsDecimal, IsBoolean, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PriceListRuleDiscountBaseType } from '@prisma/client';

export class UpdatePriceListRuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity?: number;

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

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
