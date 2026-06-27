import { IsOptional, IsString, IsEmail, IsBoolean, IsArray, IsDecimal, MinLength } from 'class-validator';

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
  @IsString()
  defaultOrderAcceptanceMode?: string;

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
  @IsString({ each: true })
  orderNotificationEmails?: string[];

  @IsOptional()
  @IsArray()
  processingDays?: number[];

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  minimumOrderSpend?: string;
}
