import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ACCOUNTING_CONTACT_STATUS_VALUES, ACCOUNTING_CONTACT_TYPE_VALUES } from './contact-query.dto';

// Same status/type vocabulary as ContactQueryDto, minus pagination — the
// processor re-resolves the matching external contact ids from this filter
// at process time, never trusting a client-supplied id snapshot.
class BulkImportContactFilterDto {
  @ApiProperty({ enum: ACCOUNTING_CONTACT_STATUS_VALUES, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_CONTACT_STATUS_VALUES, { each: true })
  status?: string[];

  @ApiProperty({ enum: ACCOUNTING_CONTACT_TYPE_VALUES, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsIn(ACCOUNTING_CONTACT_TYPE_VALUES, { each: true })
  type?: string[];

  @IsOptional()
  @IsString()
  search?: string;
}

// Exactly one of ids/filter must be provided — enforced in the service, not
// here, matching this codebase's existing convention of business validation
// living in services rather than cross-field class-validator decorators.
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
