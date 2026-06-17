import { IsOptional, IsString, IsEmail, IsBoolean, IsArray, MinLength } from 'class-validator';

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
  defaultOrderAcceptanceMode?: string;

  @IsOptional()
  @IsBoolean()
  marketplaceVisible?: boolean;

  @IsOptional()
  @IsString()
  marketplaceDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderNotificationEmails?: string[];

  @IsOptional()
  @IsArray()
  processingDays?: number[];
}
