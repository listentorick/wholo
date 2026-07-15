import {
  IsOptional,
  IsString,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsArray,
  IsInt,
  IsDecimal,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrderAcceptanceMode } from '@prisma/client';
import { SLUG_PATTERN } from '../../common/slug';

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
