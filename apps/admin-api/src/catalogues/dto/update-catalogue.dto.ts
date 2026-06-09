import { IsString, IsOptional, IsArray, MinLength } from 'class-validator';

export class UpdateCatalogueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  productIds: string[];
}
