import { IsOptional, IsString, MinLength } from 'class-validator';

// No email field, deliberately — see apps/api's ImportContactDto for why.
export class ImportContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  billingLine1?: string;

  @IsOptional()
  @IsString()
  billingLine2?: string;

  @IsOptional()
  @IsString()
  billingCity?: string;

  @IsOptional()
  @IsString()
  billingState?: string;

  @IsOptional()
  @IsString()
  billingPostcode?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;
}
