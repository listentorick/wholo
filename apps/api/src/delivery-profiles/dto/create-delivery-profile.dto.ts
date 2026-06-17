import {
  IsString, IsNotEmpty, IsOptional, IsBoolean,
  IsArray, IsInt, Min, Max, MaxLength, Matches, IsDateString,
} from 'class-validator';

export class CreateDeliveryProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  defaultWeekdays?: number[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'defaultCutoffTime must be in HH:MM format' })
  defaultCutoffTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultCutoffProcessingDays?: number;

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  speciallyEnabledDates?: string[];

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  speciallyDisabledDates?: string[];
}
