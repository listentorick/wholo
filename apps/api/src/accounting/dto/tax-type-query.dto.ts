import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

// Deliberately no search/status/type filters — tax rates are a small,
// near-static set (no FilterBar in the admin UI), unlike the products/
// contacts tabs this mirrors.
export class TaxTypeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  cursor?: string;
}
