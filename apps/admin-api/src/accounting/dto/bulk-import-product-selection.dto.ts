import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ACCOUNTING_PRODUCT_STATUS_VALUES, ACCOUNTING_PRODUCT_TYPE_VALUES } from './product-query.dto';

class BulkImportProductFilterDto {
  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_STATUS_VALUES, { each: true })
  status?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_TYPE_VALUES, { each: true })
  type?: string[];

  @IsOptional()
  @IsString()
  search?: string;
}

export class BulkImportProductSelectionDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BulkImportProductFilterDto)
  filter?: BulkImportProductFilterDto;

  @IsOptional()
  @IsBoolean()
  honourSuggestions?: boolean;
}
