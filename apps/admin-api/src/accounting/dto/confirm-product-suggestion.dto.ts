import { IsBoolean, IsOptional } from 'class-validator';

export class ConfirmProductSuggestionDto {
  @IsOptional()
  @IsBoolean()
  confirmTaxTypeOverride?: boolean;
}
