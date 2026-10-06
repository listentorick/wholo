import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsInt, MaxLength } from 'class-validator';
import { PaymentTermType } from '@prisma/client';

// Range checks per type live in normaliseRule (payment-terms.logic.ts), which
// knows which fields each type uses.
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
