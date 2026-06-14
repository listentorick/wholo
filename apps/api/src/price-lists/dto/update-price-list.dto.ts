import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdatePriceListDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
