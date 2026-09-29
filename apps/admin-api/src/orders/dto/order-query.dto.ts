import {
  IsOptional, IsString, IsInt, IsEnum, IsBoolean, Min, Max,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

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

  // Not @Type(() => Boolean) — Boolean('false') === true in JS.
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

  // Payment position of the order's invoice (ADR-072); apps/api validates it too.
  @IsOptional()
  @IsIn(['UNPAID', 'PART_PAID', 'PAID', 'OVERDUE'])
  payment?: 'UNPAID' | 'PART_PAID' | 'PAID' | 'OVERDUE';
}
