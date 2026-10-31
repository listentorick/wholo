import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const INVOICE_TARGET_STATUSES = ['DRAFT', 'SUBMITTED', 'AUTHORISED'] as const;

// Every field is optional: only the ones sent change.
export class UpdateConnectionSettingsDto {
  @IsOptional()
  @IsIn(INVOICE_TARGET_STATUSES)
  invoiceExportTargetStatus?: (typeof INVOICE_TARGET_STATUSES)[number];

  // null clears the default sales account.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  invoiceDefaultAccountId?: string | null;
}
