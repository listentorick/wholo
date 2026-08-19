import {
  IsOptional, IsInt, Min, IsString, IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class DeliveryRouteQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  // Not @Type(() => Boolean) — Boolean('false') === true in JS, so that
  // coercion would silently turn ?active=false into active: true.
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  active?: boolean;
}
