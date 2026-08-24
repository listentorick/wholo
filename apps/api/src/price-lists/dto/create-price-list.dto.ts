import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn } from 'class-validator';
import { ISO_CURRENCIES } from '../../common/currency';

export class CreatePriceListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsIn(ISO_CURRENCIES, { message: 'Must be a valid ISO 4217 currency code (e.g. "GBP")' })
  currency?: string;
}
