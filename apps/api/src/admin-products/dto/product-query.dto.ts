import { IsOptional, IsEnum, IsInt, Min, Max, IsArray, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

// Query values arrive as a single comma-separated string (e.g. `?status=DRAFT,ACTIVE`)
// since URLSearchParams naturally serializes one value per key.
function splitCommaList({ value }: { value: unknown }): unknown {
  if (value === undefined) return value;
  return Array.isArray(value) ? value : String(value).split(',');
}

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  cursor?: string;

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus', isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsEnum(ProductStatus, { each: true })
  status?: ProductStatus[];

  @ApiProperty({ type: String, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsString({ each: true })
  productTypeId?: string[];

  @ApiProperty({ type: String, isArray: true, required: false })
  @IsOptional()
  @Transform(splitCommaList)
  @IsArray()
  @IsString({ each: true })
  supplierId?: string[];
}
