import { IsString, IsOptional, IsEmail, IsDecimal, IsEnum, MinLength } from 'class-validator';
import { TradeRelationshipStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ enum: TradeRelationshipStatus, enumName: 'TradeRelationshipStatus', required: false })
  @IsOptional()
  @IsEnum(TradeRelationshipStatus)
  status?: TradeRelationshipStatus;

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
