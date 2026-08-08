import { IsBoolean, IsOptional } from 'class-validator';

export class AcceptOrderDto {
  // Resubmit-with-confirmation for a TAX_TYPE_UNMAPPED 409 — see
  // AdminOrdersService.assertTaxTypesMappedOrConfirmed.
  @IsOptional()
  @IsBoolean()
  confirmUnmappedTaxTypes?: boolean;
}
