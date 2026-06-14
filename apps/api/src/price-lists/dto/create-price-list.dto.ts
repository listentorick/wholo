import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreatePriceListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}
