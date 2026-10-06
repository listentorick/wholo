import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsInt, MaxLength } from 'class-validator';
import { PaymentTermType } from '@prisma/client';

// Shape only — apps/api checks each type's ranges (ADR-075).
export class PaymentTermRuleDto {
  @IsEnum(PaymentTermType)
  type: PaymentTermType;

  @IsOptional()
  @IsInt()
  days?: number | null;

  @IsOptional()
  @IsInt()
  dayOfWeek?: number | null;

  @IsOptional()
  @IsInt()
  dayOfMonth?: number | null;
}

export class CreatePaymentTermDto extends PaymentTermRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  makeDefault?: boolean;
}
