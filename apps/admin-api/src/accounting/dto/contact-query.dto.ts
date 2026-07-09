import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const ACCOUNTING_CONTACT_STATUS_VALUES = [
  'LINKED',
  'SUGGESTED',
  'READY_TO_IMPORT',
  'NOT_A_CUSTOMER',
  'IGNORED',
  'ARCHIVED',
  'CONFLICT',
] as const;

export const ACCOUNTING_CONTACT_TYPE_VALUES = ['customers', 'suppliers', 'archived'] as const;

export class ContactQueryDto {
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
  @IsIn(ACCOUNTING_CONTACT_STATUS_VALUES)
  status?: (typeof ACCOUNTING_CONTACT_STATUS_VALUES)[number];

  @IsOptional()
  @IsIn(ACCOUNTING_CONTACT_TYPE_VALUES)
  type?: (typeof ACCOUNTING_CONTACT_TYPE_VALUES)[number];
}
