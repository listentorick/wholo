import { IsOptional, IsEnum, IsInt, Min, Max, IsArray, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TradeRelationshipStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

// Query values arrive as a single comma-separated string (e.g. `?status=ACTIVE,SUSPENDED`)
// since URLSearchParams naturally serializes one value per key.
function splitCommaList({ value }: { value: unknown }): unknown {
  if (value === undefined) return value;
  return Array.isArray(value) ? value : String(value).split(',');
}

export class CustomerQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  cursor?: string;

  @ApiProperty({ enum: TradeRelationshipStatus, enumName: 'TradeRelationshipStatus', isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsEnum(TradeRelationshipStatus, { each: true })
  status?: TradeRelationshipStatus[];

  @ApiProperty({ type: String, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsString({ each: true })
  priceListId?: string[];

  @ApiProperty({ type: String, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsString({ each: true })
  deliveryProfileId?: string[];

  @ApiProperty({ type: String, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsString({ each: true })
  catalogueId?: string[];
}
