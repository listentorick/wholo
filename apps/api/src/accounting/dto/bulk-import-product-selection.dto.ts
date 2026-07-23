import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNTING_PRODUCT_STATUS_VALUES, ACCOUNTING_PRODUCT_TYPE_VALUES } from './product-query.dto';

// Same status/type vocabulary as ProductQueryDto, minus pagination — the
// processor re-resolves the matching external product ids from this filter
// at process time, never trusting a client-supplied id snapshot.
class BulkImportProductFilterDto {
  @ApiProperty({ enum: ACCOUNTING_PRODUCT_STATUS_VALUES, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_STATUS_VALUES, { each: true })
  status?: string[];

  @ApiProperty({ enum: ACCOUNTING_PRODUCT_TYPE_VALUES, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_PRODUCT_TYPE_VALUES, { each: true })
  type?: string[];

  @IsOptional()
  @IsString()
  search?: string;
}

// Exactly one of ids/filter must be provided — enforced in the service, not
// here, matching this codebase's existing convention of business validation
// living in services rather than cross-field class-validator decorators.
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
