import { IsString, IsOptional, IsArray, MinLength } from 'class-validator';

export class CreateCatalogueDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}
