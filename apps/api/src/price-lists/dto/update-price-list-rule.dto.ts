import { IsOptional, IsInt, Min, IsDecimal, IsBoolean, IsString, IsEnum, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { PriceListRuleDiscountBaseType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { ISO_CURRENCIES } from '../../common/currency';

export class UpdatePriceListRuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity?: number;

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

  @IsOptional()
  @IsIn(ISO_CURRENCIES, { message: 'Must be a valid ISO 4217 currency code (e.g. "GBP")' })
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
