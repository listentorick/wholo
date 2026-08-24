import { IsString, IsOptional, IsBoolean, MaxLength, IsIn } from 'class-validator';
import { ISO_CURRENCIES } from '../../common/currency';

export class UpdatePriceListDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsIn(ISO_CURRENCIES, { message: 'Must be a valid ISO 4217 currency code (e.g. "GBP")' })
  currency?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
