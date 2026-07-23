import { IsArray, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const ACCOUNTING_CONTACT_STATUS_VALUES = [
  'LINKED',
  'SUGGESTED',
  'READY_TO_IMPORT',
  'NOT_A_CUSTOMER',
  'IGNORED',
  'ARCHIVED',
  'CONFLICT',
] as const;

export type AccountingContactStatusFilter = (typeof ACCOUNTING_CONTACT_STATUS_VALUES)[number];

// The provider's own contact classification (customers/suppliers/archived)
// — distinct from the match-status filter above (which is "what does Wholo
// need me to do"), this is "which provider bucket".
export const ACCOUNTING_CONTACT_TYPE_VALUES = ['customers', 'suppliers', 'archived'] as const;
export type AccountingContactTypeFilter = (typeof ACCOUNTING_CONTACT_TYPE_VALUES)[number];

// Query values arrive as a single comma-separated string (e.g. `?status=LINKED,IGNORED`)
// since URLSearchParams naturally serializes one value per key.
function splitCommaList({ value }: { value: unknown }): unknown {
  if (value === undefined) return value;
  return Array.isArray(value) ? value : String(value).split(',');
}

export class ContactQueryDto {
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

  @ApiProperty({ enum: ACCOUNTING_CONTACT_STATUS_VALUES, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsIn(ACCOUNTING_CONTACT_STATUS_VALUES, { each: true })
  status?: AccountingContactStatusFilter[];

  @ApiProperty({ enum: ACCOUNTING_CONTACT_TYPE_VALUES, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsIn(ACCOUNTING_CONTACT_TYPE_VALUES, { each: true })
  type?: AccountingContactTypeFilter[];
}
