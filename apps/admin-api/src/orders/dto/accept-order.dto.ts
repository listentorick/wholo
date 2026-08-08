import { IsBoolean, IsOptional } from 'class-validator';

export class AcceptOrderDto {
  // Resubmit-with-confirmation for a TAX_TYPE_UNMAPPED 409 — see
  // AdminOrdersService.assertTaxTypesMappedOrConfirmed (apps/api).
  @IsOptional()
  @IsBoolean()
  confirmUnmappedTaxTypes?: boolean;
}
