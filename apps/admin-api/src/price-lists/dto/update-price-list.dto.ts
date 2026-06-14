import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdatePriceListDto {
  @IsString()
  @IsOptional()
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
