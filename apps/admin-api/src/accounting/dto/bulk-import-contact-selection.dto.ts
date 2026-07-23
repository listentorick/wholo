import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ACCOUNTING_CONTACT_STATUS_VALUES, ACCOUNTING_CONTACT_TYPE_VALUES } from './contact-query.dto';

class BulkImportContactFilterDto {
  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_CONTACT_STATUS_VALUES, { each: true })
  status?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_CONTACT_TYPE_VALUES, { each: true })
  type?: string[];

  @IsOptional()
  @IsString()
  search?: string;
}

export class BulkImportContactSelectionDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => BulkImportContactFilterDto)
  filter?: BulkImportContactFilterDto;

  @IsOptional()
  @IsBoolean()
  honourSuggestions?: boolean;
}
