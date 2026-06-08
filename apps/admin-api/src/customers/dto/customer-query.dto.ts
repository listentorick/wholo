import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TradeRelationshipStatus } from '@prisma/client';

export class CustomerQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  cursor?: string;

  @IsOptional()
  @IsEnum(TradeRelationshipStatus)
  status?: TradeRelationshipStatus;
}
