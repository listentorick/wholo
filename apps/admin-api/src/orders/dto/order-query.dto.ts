import {
  IsOptional, IsString, IsInt, IsEnum, IsBoolean, Min, Max,
  IsIn, IsArray,
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

  // Payment position of the order's invoice (ADR-072): one or more, comma-separated
  // (payment=UNPAID,OVERDUE); an order matches any of them; apps/api validates it too.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsIn(['UNPAID', 'PART_PAID', 'PAID', 'OVERDUE'], { each: true })
  payment?: Array<'UNPAID' | 'PART_PAID' | 'PAID' | 'OVERDUE'>;
}
