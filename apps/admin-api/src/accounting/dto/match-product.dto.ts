import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MatchProductDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsOptional()
  @IsBoolean()
  confirmTaxTypeOverride?: boolean;
}
