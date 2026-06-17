import { IsOptional, IsString, IsInt, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
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

  @IsOptional()
  @IsEnum(['createdAt', 'requestedDeliveryDate'])
  sortBy?: 'createdAt' | 'requestedDeliveryDate';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
