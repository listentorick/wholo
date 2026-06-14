import { IsOptional, IsInt, Min, IsDecimal, IsBoolean, IsString } from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
