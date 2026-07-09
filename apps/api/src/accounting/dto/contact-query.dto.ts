import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
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

// Mirrors the All/Customers/Suppliers/Archived split Xero's own contacts
// screen already uses — distinct from the match-status filter above (which
// is "what does Wholo need me to do"), this is "which Xero bucket".
export const ACCOUNTING_CONTACT_TYPE_VALUES = ['customers', 'suppliers', 'archived'] as const;
export type AccountingContactTypeFilter = (typeof ACCOUNTING_CONTACT_TYPE_VALUES)[number];

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

  @ApiProperty({ enum: ACCOUNTING_CONTACT_STATUS_VALUES, required: false })
  @IsOptional()
  @IsIn(ACCOUNTING_CONTACT_STATUS_VALUES)
  status?: AccountingContactStatusFilter;

  @ApiProperty({ enum: ACCOUNTING_CONTACT_TYPE_VALUES, required: false })
  @IsOptional()
  @IsIn(ACCOUNTING_CONTACT_TYPE_VALUES)
  type?: AccountingContactTypeFilter;
}
