import {
  IsOptional,
  IsString,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  IsIn,
  IsDecimal,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrderAcceptanceMode } from '@prisma/client';
import { SLUG_PATTERN } from '../../common/slug';
import { ISO_CURRENCIES } from '../../common/currency';

// Intl.supportedValuesOf('timeZone') omits 'UTC' even though it's a valid,
// commonly-selected IANA identifier — add it back explicitly.
const IANA_TIMEZONES = [...Intl.supportedValuesOf('timeZone'), 'UTC'];

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'Portal address may only contain lowercase letters, numbers and hyphens' })
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  addressCity?: string;

  @IsOptional()
  @IsString()
  addressState?: string;

  @IsOptional()
  @IsString()
  addressPostcode?: string;

  @IsOptional()
  @IsString()
  addressCountry?: string;

  // Defines calendar-day/week/month boundaries for analytics period
  // comparisons — see the wholesaler homepage dashboard PRD, §4.1.
  @IsOptional()
  @IsIn(IANA_TIMEZONES, { message: 'Must be a valid IANA timezone (e.g. "Europe/London")' })
  timezone?: string;

  // This distributor's single trading currency — Order/PriceList/PriceListRule
  // snapshot it at creation time (ADR-032) rather than referencing it live.
  @IsOptional()
  @IsIn(ISO_CURRENCIES, { message: 'Must be a valid ISO 4217 currency code (e.g. "GBP")' })
  currencyCode?: string;

  @IsOptional()
  @IsEnum(OrderAcceptanceMode)
  defaultOrderAcceptanceMode?: OrderAcceptanceMode;

  @IsOptional()
  @IsBoolean()
  marketplaceVisible?: boolean;

  @IsOptional()
  @IsString()
  marketplaceDescription?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  aboutText?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  orderNotificationEmails?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  processingDays?: number[];

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  minimumOrderSpend?: string;
}
