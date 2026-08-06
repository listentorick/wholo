import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MatchProductDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  // Resubmit-with-confirmation for a TAX_TYPE_CONFLICT 409 — see
  // AccountingProductService.resolveTaxTypeForMatch.
  @IsOptional()
  @IsBoolean()
  confirmTaxTypeOverride?: boolean;
}
