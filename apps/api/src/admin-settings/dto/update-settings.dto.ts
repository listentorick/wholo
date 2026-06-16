import {
  IsOptional,
  IsString,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsArray,
  MinLength,
} from 'class-validator';
import { OrderAcceptanceMode } from '@prisma/client';

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
  @IsEnum(OrderAcceptanceMode)
  defaultOrderAcceptanceMode?: OrderAcceptanceMode;

  @IsOptional()
  @IsBoolean()
  marketplaceVisible?: boolean;

  @IsOptional()
  @IsString()
  marketplaceDescription?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  orderNotificationEmails?: string[];
}
