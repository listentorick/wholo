import { IsOptional, IsString, MinLength } from 'class-validator';

// Deliberately no `email` field: importing an accounting contact must never
// be assumed to be the ordering user's email (it may be an accounts
// department, a person, or dirty data) — ordering users are added
// separately, after customer setup. See requirements doc, Phase 2.
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
