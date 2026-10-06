import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsInt, MaxLength } from 'class-validator';
import { PaymentTermType } from '@prisma/client';

export class UpdatePaymentTermDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(PaymentTermType)
  type?: PaymentTermType;

  @IsOptional()
  @IsInt()
  days?: number | null;

  @IsOptional()
  @IsInt()
  dayOfWeek?: number | null;

  @IsOptional()
  @IsInt()
  dayOfMonth?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // Only `true` is meaningful: a distributor always has a default, so it is
  // moved by making a different term the default.
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
