import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

// Mirrors apps/api's canonical slug shape (common/slug.ts SLUG_PATTERN).
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateDistributorDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  /** Portal address. Omitted/blank → derived from name by apps/api. */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' ? undefined : trimmed;
  })
  @Matches(SLUG_PATTERN, { message: 'Portal address may only contain lowercase letters, numbers and hyphens' })
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  addressCity: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressState?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  addressPostcode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  addressCountry: string;
}
