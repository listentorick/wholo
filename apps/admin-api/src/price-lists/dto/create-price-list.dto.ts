import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePriceListDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}
