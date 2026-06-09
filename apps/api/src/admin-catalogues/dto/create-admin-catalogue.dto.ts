import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateAdminCatalogueDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
