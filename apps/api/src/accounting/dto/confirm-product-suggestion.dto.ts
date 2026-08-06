import { IsBoolean, IsOptional } from 'class-validator';

export class ConfirmProductSuggestionDto {
  // Resubmit-with-confirmation for a TAX_TYPE_CONFLICT 409 — see
  // AccountingProductService.resolveTaxTypeForMatch.
  @IsOptional()
  @IsBoolean()
  confirmTaxTypeOverride?: boolean;
}
