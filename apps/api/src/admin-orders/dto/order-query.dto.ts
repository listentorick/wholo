import {
  IsOptional, IsString, IsInt, IsEnum, IsBoolean, Min, Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class OrderQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus', required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  statusExclude?: OrderStatus;

  @IsOptional()
  @IsString()
  deliveryDateAfter?: string;

  @IsOptional()
  @IsString()
  deliveryDateBefore?: string;

  // Accepted orders with no delivery date at all — never appear on any
  // dated board (see docs/delivery-planning-pbi-plan.md's M3 risk note),
  // this is how the M4 undated-deliveries panel finds them. Not
  // @Type(() => Boolean) — Boolean('false') === true in JS.
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  undated?: boolean;

  @IsOptional()
  @IsEnum(['createdAt', 'requestedDeliveryDate'])
  sortBy?: 'createdAt' | 'requestedDeliveryDate';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
