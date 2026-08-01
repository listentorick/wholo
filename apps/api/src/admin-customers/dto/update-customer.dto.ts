import { IsString, IsOptional, IsEmail, IsDecimal, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Status is intentionally not editable here — it moves only through the
// dedicated, validated transition endpoints (accept-request/decline-request/
// suspend/unsuspend), each of which checks the relationship's current status
// before changing it. A free-form status field on this generic update let
// any status be set from any other with no guard.
export class UpdateCustomerDto {
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
  accountNumber?: string;

  @ApiProperty({ type: String, description: 'Decimal string, e.g. "5000.00"', required: false })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  creditLimit?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  minimumOrderSpend?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  deliveryLine1?: string;

  @IsOptional()
  @IsString()
  deliveryLine2?: string;

  @IsOptional()
  @IsString()
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  deliveryState?: string;

  @IsOptional()
  @IsString()
  deliveryPostcode?: string;

  @IsOptional()
  @IsString()
  deliveryCountry?: string;

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
