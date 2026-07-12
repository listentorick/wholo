import { ApiProperty } from '@nestjs/swagger';
import { AccountingInvoiceTargetStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateConnectionSettingsDto {
  @ApiProperty({
    enum: AccountingInvoiceTargetStatus,
    description: 'Status invoices are created with in the connected accounting system',
  })
  @IsEnum(AccountingInvoiceTargetStatus)
  invoiceExportTargetStatus!: AccountingInvoiceTargetStatus;
}
