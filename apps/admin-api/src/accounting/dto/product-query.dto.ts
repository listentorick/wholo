import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

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
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_STATUS_VALUES, { each: true })
  status?: (typeof ACCOUNTING_PRODUCT_STATUS_VALUES)[number][];

  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_TYPE_VALUES, { each: true })
  type?: (typeof ACCOUNTING_PRODUCT_TYPE_VALUES)[number][];
}
