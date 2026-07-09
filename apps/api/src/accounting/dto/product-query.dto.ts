import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const ACCOUNTING_PRODUCT_STATUS_VALUES = [
  'LINKED',
  'SUGGESTED',
  'READY_TO_IMPORT',
  'NOT_SOLD',
  'IGNORED',
  'INACTIVE',
  'CONFLICT',
] as const;

export type AccountingProductStatusFilter = (typeof ACCOUNTING_PRODUCT_STATUS_VALUES)[number];

// Which provider bucket the item sits in (sold/purchased/tracked are Xero's
// own item flags) — distinct from the match-status filter above (which is
// "what does Wholo need me to do").
export const ACCOUNTING_PRODUCT_TYPE_VALUES = ['sold', 'purchased', 'tracked'] as const;
export type AccountingProductTypeFilter = (typeof ACCOUNTING_PRODUCT_TYPE_VALUES)[number];

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  cursor?: string;

  @IsOptional()
  search?: string;

  @ApiProperty({ enum: ACCOUNTING_PRODUCT_STATUS_VALUES, required: false })
  @IsOptional()
  @IsIn(ACCOUNTING_PRODUCT_STATUS_VALUES)
  status?: AccountingProductStatusFilter;

  @ApiProperty({ enum: ACCOUNTING_PRODUCT_TYPE_VALUES, required: false })
  @IsOptional()
  @IsIn(ACCOUNTING_PRODUCT_TYPE_VALUES)
  type?: AccountingProductTypeFilter;
}
