import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountingInvoiceTargetStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Every field is optional: only the ones sent change.
export class UpdateConnectionSettingsDto {
  @ApiPropertyOptional({
    enum: AccountingInvoiceTargetStatus,
    description: 'Status invoices are created with in the connected accounting system',
  })
  @IsOptional()
  @IsEnum(AccountingInvoiceTargetStatus)
  invoiceExportTargetStatus?: AccountingInvoiceTargetStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Id of the default sales account (from GET accounts), used for invoice lines whose product brings no account of its own. null clears it.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  invoiceDefaultAccountId?: string | null;
}
