import { IsIn } from 'class-validator';

const INVOICE_TARGET_STATUSES = ['DRAFT', 'SUBMITTED', 'AUTHORISED'] as const;

export class UpdateConnectionSettingsDto {
  @IsIn(INVOICE_TARGET_STATUSES)
  invoiceExportTargetStatus!: (typeof INVOICE_TARGET_STATUSES)[number];
}
