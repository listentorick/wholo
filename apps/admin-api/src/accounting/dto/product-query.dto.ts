import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const ACCOUNTING_PRODUCT_STATUS_VALUES = [
  'LINKED',
  'SUGGESTED',
  'READY_TO_IMPORT',
  'NOT_SOLD',
  'IGNORED',
  'INACTIVE',
  'CONFLICT',
] as const;

export const ACCOUNTING_PRODUCT_TYPE_VALUES = ['sold', 'purchased', 'tracked'] as const;

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(ACCOUNTING_PRODUCT_STATUS_VALUES)
  status?: (typeof ACCOUNTING_PRODUCT_STATUS_VALUES)[number];

  @IsOptional()
  @IsIn(ACCOUNTING_PRODUCT_TYPE_VALUES)
  type?: (typeof ACCOUNTING_PRODUCT_TYPE_VALUES)[number];
}
