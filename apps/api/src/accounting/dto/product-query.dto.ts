import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

// Which provider bucket the item sits in (the provider's own
// sold/purchased/tracked-as-inventory item flags) — distinct from the
// match-status filter above (which is "what does Wholo need me to do").
export const ACCOUNTING_PRODUCT_TYPE_VALUES = ['sold', 'purchased', 'tracked'] as const;
export type AccountingProductTypeFilter = (typeof ACCOUNTING_PRODUCT_TYPE_VALUES)[number];

// Query values arrive as a single comma-separated string (e.g. `?status=LINKED,IGNORED`)
// since URLSearchParams naturally serializes one value per key.
function splitCommaList({ value }: { value: unknown }): unknown {
  if (value === undefined) return value;
  return Array.isArray(value) ? value : String(value).split(',');
}

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

  @ApiProperty({ enum: ACCOUNTING_PRODUCT_STATUS_VALUES, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_STATUS_VALUES, { each: true })
  status?: AccountingProductStatusFilter[];

  @ApiProperty({ enum: ACCOUNTING_PRODUCT_TYPE_VALUES, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_TYPE_VALUES, { each: true })
  type?: AccountingProductTypeFilter[];
}
