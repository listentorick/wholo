import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() billingLine1?: string;
  @IsOptional() @IsString() billingLine2?: string;
  @IsOptional() @IsString() billingCity?: string;
  @IsOptional() @IsString() billingState?: string;
  @IsOptional() @IsString() billingPostcode?: string;
  @IsOptional() @IsString() billingCountry?: string;
}
