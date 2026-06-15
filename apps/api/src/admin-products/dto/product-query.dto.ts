import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  cursor?: string;

  @ApiProperty({ enum: ProductStatus, enumName: 'ProductStatus', required: false })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
